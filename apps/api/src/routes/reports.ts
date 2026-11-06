import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { REPORT_TYPES, HULL_RESTORATION_PHASES, type ReportType } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { assertVesselAccess, requirePerm, vesselFilter, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { CLAUSE_CATALOG, reportPdf } from '../services/pdf';
import { notify, vesselClientUserIds } from '../services/notify';
import { audit } from '../lib/audit';

export const reportsRouter = Router();

const TYPE_KEYS = Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]];

function scope(user: AuthUser): Prisma.ReportWhereInput {
  return { ...vesselFilter(user), ...(user.isStaff ? {} : { status: 'PUBLISHED', customerVisible: true }) };
}

reportsRouter.get('/clauses', (_req, res) => res.json(CLAUSE_CATALOG));

reportsRouter.get(
  '/',
  requirePerm('reports.view', 'reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ vesselId: z.string().optional(), type: z.enum(TYPE_KEYS).optional(), status: z.string().optional(), projectId: z.string().optional() }).parse(req.query);
    const where: Prisma.ReportWhereInput = {
      ...scope(req.user),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.report.findMany({ where, ...paginate(q), orderBy: { updatedAt: 'desc' }, include: { vessel: { select: { id: true, name: true } } } }),
      prisma.report.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

/** Taslak verisini ilgili tekne / iş emri / projeden otomatik doldurur */
async function prefill(type: ReportType, vesselId: string, workOrderId?: string | null, projectId?: string | null, user?: AuthUser) {
  const base: Record<string, any> = { reportDate: new Date().toISOString(), preparedBy: user?.name };
  if (type === 'POST_SCRAPING') {
    return { ...base, inspectionDate: new Date().toISOString(), location: (await prisma.vessel.findUnique({ where: { id: vesselId } }))?.marina, inspector: user?.name, portFindings: '', starboardFindings: '', damages: [], moistureReadings: [{ point: 'Baş bodoslama', side: 'İskele', value: '' }, { point: 'Su hattı orta', side: 'İskele', value: '' }, { point: 'Kıç ayna', side: 'İskele', value: '' }, { point: 'Baş bodoslama', side: 'Sancak', value: '' }, { point: 'Su hattı orta', side: 'Sancak', value: '' }, { point: 'Kıç ayna', side: 'Sancak', value: '' }], assessment: '', recommendation: '' };
  }
  if (type === 'HULL_RESTORATION') {
    const project = projectId ? await prisma.project.findUnique({ where: { id: projectId }, include: { phases: { orderBy: { order: 'asc' }, include: { responsible: true, tasks: true } } } }) : null;
    const phases = project?.phases.length
      ? project.phases.map((p) => ({ name: p.name, responsible: p.responsible?.name, startDate: p.startDate, endDate: p.endDate, status: p.status, materials: p.materials }))
      : HULL_RESTORATION_PHASES.map((name) => ({ name, status: 'NOT_STARTED' }));
    const tasks = project?.phases.flatMap((p) => p.tasks) ?? [];
    const progress = tasks.length ? (tasks.filter((t) => t.done).reduce((s, t) => s + t.weight, 0) / tasks.reduce((s, t) => s + t.weight, 0)) * 100 : 0;
    return { ...base, summary: project?.description ?? '', phases, progress, startDate: project?.startDate, endDate: project?.endDate, notes: '' };
  }
  if (type === 'TEAK_CARPENTRY') {
    return { ...base, summary: '', areas: [{ area: 'Kıç güverte', quantity: '', unit: 'm²', material: 'Burma teak', products: '', labourHours: '', progress: 0 }] };
  }
  if (type === 'DELIVERY_PROTOCOL') {
    const wos = await prisma.workOrder.findMany({
      where: { vesselId, ...(projectId ? { projectId } : workOrderId ? { id: workOrderId } : { status: { in: ['COMPLETED', 'PUBLISHED'] } }) },
      include: { materials: { include: { material: true } } },
      orderBy: { finishedAt: 'asc' },
      take: 50,
    });
    const crs = projectId ? await prisma.changeRequest.findMany({ where: { projectId } }) : [];
    const mats = new Map<string, { name: string; quantity: number; unit: string }>();
    for (const w of wos) for (const m of w.materials) {
      const cur = mats.get(m.materialId) ?? { name: m.material.name, quantity: 0, unit: m.material.unit };
      cur.quantity += m.quantity;
      mats.set(m.materialId, cur);
    }
    return {
      ...base,
      works: wos.map((w) => ({ description: w.customerSummary ?? w.title, ref: w.number, date: w.finishedAt })),
      captainRequests: crs.map((c) => ({ title: c.title, status: c.status === 'APPROVED' ? 'Onaylandı' : c.status === 'REJECTED' ? 'Reddedildi' : 'Bekliyor' })),
      approvedExtras: crs.filter((c) => c.status === 'APPROVED').map((c) => ({ title: c.title, decidedAt: c.decidedAt })),
      materials: [...mats.values()],
      deliveryDate: new Date().toISOString(),
      warranty: '',
      paymentStatus: '',
      notes: '',
      receivedBy: '',
    };
  }
  return base;
}

reportsRouter.post(
  '/',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ type: z.enum(TYPE_KEYS), vesselId: z.string(), title: zOptStr, workOrderId: zOptStr, projectId: zOptStr, data: z.record(z.any()).optional() }).parse(req.body);
    if (body.type === 'INSPECTION') throw badRequest('Denetim raporları denetim onayı ile otomatik oluşturulur');
    assertVesselAccess(req.user, body.vesselId);
    const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: body.vesselId } });
    const data = { ...(await prefill(body.type, body.vesselId, body.workOrderId, body.projectId, req.user)), ...(body.data ?? {}) };
    const report = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('RPT', tx);
      return tx.report.create({
        data: {
          number,
          type: body.type,
          title: body.title || `${REPORT_TYPES[body.type]} — ${vessel.name}`,
          vesselId: body.vesselId,
          workOrderId: body.workOrderId ?? undefined,
          projectId: body.projectId ?? undefined,
          createdById: req.user.id,
          versions: { create: { version: 1, data, createdById: req.user.id } },
        },
      });
    });
    res.status(201).json(report);
  }),
);

reportsRouter.get(
  '/:id',
  requirePerm('reports.view', 'reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const r = await prisma.report.findFirst({
      where: { id: req.params.id, ...scope(req.user) },
      include: {
        vessel: { select: { id: true, name: true, marina: true } },
        workOrder: { select: { id: true, number: true, title: true } },
        project: { select: { id: true, name: true } },
        inspection: { select: { id: true, number: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });
    if (!r) throw notFound('Rapor');
    const userIds = [...new Set(r.versions.flatMap((v) => [v.createdById, v.approvedById]).filter(Boolean) as string[])];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const versions = req.user.isStaff ? r.versions : r.versions.filter((v) => v.status === 'PUBLISHED');
    res.json({ ...r, versions, users: Object.fromEntries(users.map((u) => [u.id, u.name])) });
  }),
);

/**
 * Rapor verisini güncelle. Taslak sürüm yerinde güncellenir;
 * onaylı/yayınlanmış sürüm düzenlenirse yeni taslak sürüm açılır.
 */
reportsRouter.put(
  '/:id',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ title: zOptStr, data: z.record(z.any()), changeNote: zOptStr, customerVisible: z.boolean().optional() }).parse(req.body);
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (r.type === 'INSPECTION') throw badRequest('Denetim raporu denetim kaydı üzerinden düzenlenir');
    const latest = r.versions[0];
    const result = await prisma.$transaction(async (tx) => {
      if (latest && ['DRAFT', 'IN_REVIEW'].includes(latest.status)) {
        await tx.reportVersion.update({ where: { id: latest.id }, data: { data: body.data, changeNote: body.changeNote ?? latest.changeNote } });
      } else {
        await tx.reportVersion.create({ data: { reportId: r.id, version: (latest?.version ?? 0) + 1, data: body.data, createdById: req.user.id, changeNote: body.changeNote ?? 'Onaylı rapor üzerinde revizyon' } });
      }
      const fresh = await tx.reportVersion.findFirstOrThrow({ where: { reportId: r.id }, orderBy: { version: 'desc' } });
      return tx.report.update({
        where: { id: r.id },
        data: { title: body.title ?? undefined, currentVersion: fresh.version, customerVisible: body.customerVisible, status: fresh.status === 'DRAFT' && r.status !== 'DRAFT' ? r.status : fresh.status },
      });
    });
    await audit(req.user.id, 'report.update', 'Report', r.id, { version: result.currentVersion });
    res.json(result);
  }),
);

reportsRouter.post(
  '/:id/submit',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const v = await prisma.reportVersion.findFirstOrThrow({ where: { reportId: req.params.id }, orderBy: { version: 'desc' } });
    if (v.status !== 'DRAFT') throw badRequest('Yalnızca taslak sürüm kontrole gönderilebilir');
    await prisma.reportVersion.update({ where: { id: v.id }, data: { status: 'IN_REVIEW' } });
    res.json(await prisma.report.update({ where: { id: req.params.id }, data: { status: 'IN_REVIEW' } }));
  }),
);

/**
 * Onay: yetkili kullanıcı sürümü onaylar ve isteğe bağlı olarak
 * teknik uygunluk / ayıpsız teslim / garanti / ibra beyanlarını açıkça ekler.
 */
reportsRouter.post(
  '/:id/approve',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ clauses: z.array(z.object({ key: z.string(), text: z.string().optional() })).default([]) }).parse(req.body ?? {});
    const report = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id } });
    const v = await prisma.reportVersion.findFirstOrThrow({ where: { reportId: report.id }, orderBy: { version: 'desc' } });
    if (!['DRAFT', 'IN_REVIEW'].includes(v.status)) throw badRequest('Bu sürüm zaten onaylanmış');
    const now = new Date();
    const clauses = body.clauses
      .filter((c) => CLAUSE_CATALOG[c.key])
      .map((c) => ({ key: c.key, text: c.text?.trim() || CLAUSE_CATALOG[c.key].text, approvedById: req.user.id, approvedByName: req.user.name, approvedAt: now }));
    await prisma.$transaction([
      prisma.reportVersion.updateMany({ where: { reportId: report.id, version: { lt: v.version }, status: { in: ['APPROVED', 'PUBLISHED'] } }, data: { status: 'SUPERSEDED' } }),
      prisma.reportVersion.update({ where: { id: v.id }, data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: now, clauses } }),
      prisma.report.update({ where: { id: report.id }, data: { status: 'APPROVED', currentVersion: v.version } }),
    ]);
    await audit(req.user.id, 'report.approve', 'Report', report.id, { version: v.version, clauses: clauses.map((c) => c.key) });
    res.json({ ok: true, version: v.version });
  }),
);

/** Müşteriye yayınla */
reportsRouter.post(
  '/:id/publish',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const report = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id } });
    const v = await prisma.reportVersion.findFirstOrThrow({ where: { reportId: report.id, status: { in: ['APPROVED', 'PUBLISHED'] } }, orderBy: { version: 'desc' } });
    await prisma.$transaction([
      prisma.reportVersion.updateMany({ where: { reportId: report.id, status: 'PUBLISHED', id: { not: v.id } }, data: { status: 'SUPERSEDED' } }),
      prisma.reportVersion.update({ where: { id: v.id }, data: { status: 'PUBLISHED' } }),
      prisma.report.update({ where: { id: report.id }, data: { status: 'PUBLISHED', customerVisible: true, currentVersion: v.version } }),
    ]);
    await notify(await vesselClientUserIds(report.vesselId), {
      type: 'NEW_REPORT',
      title: 'Yeni teknik rapor yayınlandı',
      body: report.title,
      link: `/reports/${report.id}`,
      entityType: 'Report',
      entityId: report.id,
      dedupeKey: `report-pub-${report.id}-v${v.version}`,
    });
    res.json({ ok: true });
  }),
);

reportsRouter.get(
  '/:id/pdf',
  requirePerm('reports.view', 'reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const r = await prisma.report.findFirst({ where: { id: req.params.id, ...scope(req.user) }, include: { versions: true } });
    if (!r) throw notFound('Rapor');
    let version = req.query.version ? Number(req.query.version) : undefined;
    if (!req.user.isStaff) {
      const pub = r.versions.filter((v) => v.status === 'PUBLISHED').sort((a, b) => b.version - a.version)[0];
      if (!pub) throw notFound('Rapor');
      version = pub.version;
    }
    const doc = await reportPdf(r.id, version, { includeInternalPhotos: req.user.isStaff });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${r.number}.pdf"`);
    doc.pipe(res);
    doc.end();
  }),
);

reportsRouter.delete(
  '/:id',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id } });
    if (r.status !== 'DRAFT') throw badRequest('Yalnızca taslak raporlar silinebilir');
    await prisma.report.delete({ where: { id: r.id } });
    res.json({ ok: true });
  }),
);
