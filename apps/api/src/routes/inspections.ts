import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { FINDING_PRIORITIES, INSPECTION_RESULTS, INSPECTION_TEMPLATE, INSPECTION_TEMPLATE_VERSION, OPERATIONAL_STATUSES, PRIORITIES, findTemplateItem, isCheckSection } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { assertVesselAccess, requirePerm, vesselFilter, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { createWorkOrderFromFault, notifyFault } from '../services/faults';
import { managerIds, notify } from '../services/notify';
import { attachmentsFor } from './files';
import { inspectionPdf } from '../services/pdf';

export const inspectionsRouter = Router();

function scope(user: AuthUser): Prisma.InspectionWhereInput {
  return { ...vesselFilter(user), ...(user.isStaff ? {} : { status: 'APPROVED' }) };
}

inspectionsRouter.get('/template', (_req, res) => res.json({ version: INSPECTION_TEMPLATE_VERSION, sections: INSPECTION_TEMPLATE }));

inspectionsRouter.get(
  '/',
  requirePerm('inspections.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ vesselId: z.string().optional(), status: z.string().optional(), mine: z.enum(['true']).optional() }).parse(req.query);
    const where: Prisma.InspectionWhereInput = {
      ...scope(req.user),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.mine ? { inspectorId: req.user.id } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.inspection.findMany({
        where,
        ...paginate(q),
        orderBy: { date: 'desc' },
        include: {
          vessel: { select: { id: true, name: true, marina: true } },
          inspector: { select: { id: true, name: true } },
          items: { select: { result: true, sectionCode: true } },
        },
      }),
      prisma.inspection.count({ where }),
    ]);
    const items = rows.map(({ items: all, ...r }) => ({ all, r })).map(({ all, r }) => ({ its: all.filter((i) => isCheckSection(i.sectionCode)), r })).map(({ its, r }) => ({
      ...r,
      stats: {
        total: its.length,
        filled: its.filter((i) => i.result).length,
        ok: its.filter((i) => i.result === 'OK').length,
        attention: its.filter((i) => i.result === 'ATTENTION').length,
        fault: its.filter((i) => i.result === 'FAULT').length,
        na: its.filter((i) => i.result === 'NA').length,
      },
    }));
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

inspectionsRouter.post(
  '/',
  requirePerm('inspections.perform'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ vesselId: z.string(), date: z.coerce.date().optional(), captainName: zOptStr }).parse(req.body);
    assertVesselAccess(req.user, body.vesselId);
    const vessel = await prisma.vessel.findUniqueOrThrow({
      where: { id: body.vesselId },
      include: { members: { where: { relation: 'CAPTAIN' }, include: { user: { select: { name: true } } } } },
    });
    // Bölüm 17: önceki haftanın değerleri otomatik gelir
    const prev = await prisma.inspection.findFirst({
      where: { vesselId: body.vesselId, status: { in: ['SUBMITTED', 'APPROVED'] } },
      orderBy: { date: 'desc' },
      include: { items: { where: { sectionCode: 'S17' } } },
    });
    const prevVal = (code: string) => prev?.items.find((i) => i.itemCode === code)?.measurement ?? null;
    const insp = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('INS', tx);
      return tx.inspection.create({
        data: {
          number,
          vesselId: body.vesselId,
          inspectorId: req.user.id,
          date: body.date ?? new Date(),
          captainName: body.captainName ?? vessel.members[0]?.user.name,
          templateVersion: INSPECTION_TEMPLATE_VERSION,
          location: vessel.marina,
          pier: vessel.berth,
          findings: Array.from({ length: 6 }, () => ({ description: '', priority: null, responsible: '', serviceStatus: '' })),
          items: {
            create: INSPECTION_TEMPLATE.flatMap((sec) =>
              sec.items.map((it) => ({
                sectionCode: sec.code,
                itemCode: it.code,
                label: it.label,
                description: it.description,
                unit: it.unit,
                previousMeasurement: sec.kind === 'READINGS' ? prevVal(it.code) : null,
              })),
            ),
          },
        },
      });
    });
    res.status(201).json(insp);
  }),
);

async function loadInspection(user: AuthUser, id: string) {
  const insp = await prisma.inspection.findFirst({ where: { id, ...scope(user) } });
  if (!insp) throw notFound('Denetim');
  return insp;
}

inspectionsRouter.get(
  '/:id',
  requirePerm('inspections.view'),
  ah<AuthedRequest>(async (req, res) => {
    await loadInspection(req.user, req.params.id);
    const insp = await prisma.inspection.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        vessel: { select: { id: true, name: true, marina: true, berth: true, make: true, model: true, flag: true, type: true } },
        inspector: { select: { id: true, name: true } },
        items: { orderBy: { itemCode: 'asc' }, include: { fault: { select: { id: true, status: true, workOrderId: true } } } },
        report: { select: { id: true, number: true, status: true } },
      },
    });
    // Bir önceki denetimin sonuçları (karşılaştırma için)
    const previous = await prisma.inspection.findFirst({
      where: { vesselId: insp.vesselId, id: { not: insp.id }, date: { lte: insp.date }, status: { in: ['SUBMITTED', 'APPROVED'] } },
      orderBy: { date: 'desc' },
      include: { items: { select: { itemCode: true, result: true, note: true, measurement: true } } },
    });
    const attachments = await attachmentsFor(req.user, 'INSPECTION_ITEM', insp.items.map((i) => i.id));
    const sections = INSPECTION_TEMPLATE.map((sec) => ({
      code: sec.code,
      title: sec.title,
      kind: sec.kind,
      items: insp.items
        .filter((i) => i.sectionCode === sec.code)
        .sort((a, b) => Number(a.itemCode.split('.')[1]) - Number(b.itemCode.split('.')[1]))
        .map((i) => ({ ...i, description: i.description ?? findTemplateItem(i.itemCode)?.item.description ?? null, attachments: attachments.filter((a) => a.entityId === i.id) })),
    }));
    const { items: _items, ...rest } = insp;
    const approver = insp.approvedById ? await prisma.user.findUnique({ where: { id: insp.approvedById }, select: { name: true } }) : null;
    res.json({
      ...rest,
      approverName: approver?.name ?? null,
      sections,
      previous: previous
        ? { id: previous.id, number: previous.number, date: previous.date, items: Object.fromEntries(previous.items.map((i) => [i.itemCode, i])) }
        : null,
    });
  }),
);

const itemUpdate = z.object({
  result: z.enum(INSPECTION_RESULTS).nullable().optional(),
  note: zOptStr,
  measurement: zOptStr,
  previousMeasurement: zOptStr,
});

/** Kontrol maddesi güncelleme. ARIZA → otomatik arıza kaydı + yönetici bildirimi */
async function updateItem(user: AuthUser, inspectionId: string, itemId: string, data: z.infer<typeof itemUpdate>) {
  const insp = await prisma.inspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { vessel: { select: { name: true } } } });
  if (insp.status === 'APPROVED') throw badRequest('Onaylanmış denetim değiştirilemez');
  if (!user.isManager && insp.inspectorId !== user.id) throw forbidden();
  const item = await prisma.inspectionItem.findFirst({ where: { id: itemId, inspectionId }, include: { fault: true } });
  if (!item) throw notFound('Kontrol maddesi');
  const updated = await prisma.inspectionItem.update({
    where: { id: item.id },
    data: {
      result: data.result === undefined ? undefined : data.result,
      note: data.note ?? undefined,
      measurement: data.measurement ?? undefined,
      previousMeasurement: data.previousMeasurement ?? undefined,
    },
  });
  if (updated.result === 'FAULT' && !item.fault) {
    const sec = INSPECTION_TEMPLATE.find((s) => s.code === item.sectionCode);
    const fault = await prisma.fault.create({
      data: {
        vesselId: insp.vesselId,
        title: `${item.label}`,
        description: [`Denetim ${insp.number} · ${sec?.title ?? ''} · ${item.itemCode}`, updated.note].filter(Boolean).join('\n'),
        severity: 'HIGH',
        source: 'INSPECTION',
        inspectionItemId: item.id,
        reportedById: user.id,
      },
    });
    await notifyFault(fault, insp.vessel.name, user.id);
  } else if (updated.result === 'FAULT' && item.fault && data.note) {
    await prisma.fault.update({ where: { id: item.fault.id }, data: { description: `Denetim ${insp.number} · ${item.itemCode}\n${data.note}` } });
  } else if (updated.result !== 'FAULT' && item.fault && item.fault.status === 'OPEN' && !item.fault.workOrderId) {
    // Hatalı işaretleme düzeltildi — henüz işlem görmemiş arıza kaydını kaldır
    await prisma.fault.delete({ where: { id: item.fault.id } });
  }
  return prisma.inspectionItem.findUniqueOrThrow({ where: { id: item.id }, include: { fault: { select: { id: true, status: true, workOrderId: true } } } });
}

inspectionsRouter.put(
  '/:id/items/:itemId',
  requirePerm('inspections.perform'),
  ah<AuthedRequest>(async (req, res) => {
    res.json(await updateItem(req.user, req.params.id, req.params.itemId, itemUpdate.parse(req.body)));
  }),
);

/** Toplu güncelleme (mobil formdan tek seferde gönderim) */
inspectionsRouter.put(
  '/:id/items',
  requirePerm('inspections.perform'),
  ah<AuthedRequest>(async (req, res) => {
    const { items } = z.object({ items: z.array(itemUpdate.extend({ id: z.string() })).max(300) }).parse(req.body);
    const out = [];
    for (const { id, ...data } of items) out.push(await updateItem(req.user, req.params.id, id, data));
    res.json(out);
  }),
);

inspectionsRouter.put(
  '/:id',
  requirePerm('inspections.perform'),
  ah<AuthedRequest>(async (req, res) => {
    const insp = await loadInspection(req.user, req.params.id);
    if (insp.status === 'APPROVED') throw badRequest('Onaylanmış denetim değiştirilemez');
    const body = z
      .object({
        generalNotes: zOptStr,
        captainName: zOptStr,
        date: z.coerce.date().optional(),
        location: zOptStr,
        pier: zOptStr,
        inspectorTitle: zOptStr,
        operationalStatus: z.enum(OPERATIONAL_STATUSES).nullable().optional(),
        pumpOutDone: z.boolean().optional(),
        findings: z
          .array(
            z.object({
              description: z.string().default(''),
              priority: z.enum(FINDING_PRIORITIES).nullable().optional(),
              responsible: z.string().optional().default(''),
              serviceStatus: z.string().optional().default(''),
            }),
          )
          .max(50)
          .optional(),
      })
      .parse(req.body);
    res.json(
      await prisma.inspection.update({
        where: { id: insp.id },
        data: {
          generalNotes: body.generalNotes,
          captainName: body.captainName,
          date: body.date,
          location: body.location,
          pier: body.pier,
          inspectorTitle: body.inspectorTitle,
          operationalStatus: body.operationalStatus,
          pumpOutDone: body.pumpOutDone,
          findings: body.findings,
        },
      }),
    );
  }),
);

const ENGINE_HOUR_ITEMS: Record<string, RegExp> = { 'S17.1': /iskele/i, 'S17.2': /sancak/i, 'S17.3': /jenerat/i };

inspectionsRouter.post(
  '/:id/submit',
  requirePerm('inspections.perform'),
  ah<AuthedRequest>(async (req, res) => {
    const insp = await prisma.inspection.findUniqueOrThrow({ where: { id: req.params.id }, include: { items: true, vessel: { include: { engines: true } } } });
    if (insp.status !== 'DRAFT') throw badRequest('Denetim zaten gönderilmiş');
    if (!req.user.isManager && insp.inspectorId !== req.user.id) throw forbidden();
    const missing = insp.items.filter((i) => isCheckSection(i.sectionCode) && !i.result);
    if (missing.length) throw badRequest(`${missing.length} kontrol maddesi değerlendirilmedi`, { missing: missing.map((m) => m.itemCode) });
    if (!insp.operationalStatus) throw badRequest('Bölüm 19: tekne genel operasyonel statüsünü seçin');
    // Ölçülen motor saatlerini tekne kaydına işle
    for (const [code, re] of Object.entries(ENGINE_HOUR_ITEMS)) {
      const it = insp.items.find((i) => i.itemCode === code);
      const val = it?.measurement ? Number(String(it.measurement).replace(',', '.')) : NaN;
      const engine = insp.vessel.engines.find((e) => re.test(e.position));
      if (engine && Number.isFinite(val) && val >= engine.hours) {
        await prisma.engine.update({ where: { id: engine.id }, data: { hours: val, hoursUpdatedAt: new Date() } });
      }
    }
    const updated = await prisma.inspection.update({ where: { id: insp.id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
    const faults = insp.items.filter((i) => i.result === 'FAULT').length;
    await notify(await managerIds(), {
      type: 'REVIEW_REQUIRED',
      title: `Denetim onay bekliyor: ${insp.vessel.name}`,
      body: `${insp.number} · ${faults} arıza, ${insp.items.filter((i) => i.result === 'ATTENTION').length} dikkat`,
      link: `/inspections/${insp.id}`,
      entityType: 'Inspection',
      entityId: insp.id,
      dedupeKey: `insp-submit-${insp.id}`,
    }, req.user.id);
    res.json(updated);
  }),
);

inspectionsRouter.post(
  '/:id/approve',
  requirePerm('inspections.review'),
  ah<AuthedRequest>(async (req, res) => {
    const insp = await prisma.inspection.findUniqueOrThrow({ where: { id: req.params.id }, include: { vessel: true, inspector: true } });
    if (insp.status !== 'SUBMITTED') throw badRequest('Yalnızca gönderilmiş denetimler onaylanabilir');
    const report = await prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id: insp.id }, data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() } });
      const number = await nextNumber('RPT', tx);
      return tx.report.create({
        data: {
          number,
          type: 'INSPECTION',
          title: `Haftalık Periyodik Teknik Denetim — ${insp.vessel.name}`,
          vesselId: insp.vesselId,
          inspectionId: insp.id,
          status: 'APPROVED',
          createdById: req.user.id,
          versions: {
            create: {
              version: 1,
              status: 'APPROVED',
              data: { inspectionId: insp.id, summary: insp.generalNotes ?? '' },
              createdById: req.user.id,
              approvedById: req.user.id,
              approvedAt: new Date(),
            },
          },
        },
      });
    });
    res.json({ ok: true, reportId: report.id });
  }),
);

/** Kontrol maddesinden (ARIZA) iş emri aç */
inspectionsRouter.post(
  '/:id/items/:itemId/work-order',
  requirePerm('workorders.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ technicianId: z.string().optional(), priority: z.enum(PRIORITIES).optional() }).parse(req.body ?? {});
    const item = await prisma.inspectionItem.findFirst({ where: { id: req.params.itemId, inspectionId: req.params.id }, include: { fault: true, inspection: { include: { vessel: true } } } });
    if (!item) throw notFound('Kontrol maddesi');
    let faultId = item.fault?.id;
    if (!faultId) {
      // DİKKAT maddesinden de iş emri açılabilir
      const f = await prisma.fault.create({
        data: { vesselId: item.inspection.vesselId, title: item.label, description: item.note, severity: item.result === 'FAULT' ? 'HIGH' : 'MEDIUM', source: 'INSPECTION', inspectionItemId: item.id, reportedById: req.user.id },
      });
      faultId = f.id;
    }
    const wo = await createWorkOrderFromFault(req.user, faultId, body);
    res.status(201).json(wo);
  }),
);

inspectionsRouter.get(
  '/:id/pdf',
  requirePerm('inspections.view'),
  ah<AuthedRequest>(async (req, res) => {
    await loadInspection(req.user, req.params.id);
    const doc = await inspectionPdf(req.params.id, { includeInternalPhotos: req.user.isStaff });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="denetim-${req.params.id}.pdf"`);
    doc.pipe(res);
    doc.end();
  }),
);
