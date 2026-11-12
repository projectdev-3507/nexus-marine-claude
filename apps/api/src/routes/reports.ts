import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { APPROVAL_REPORT_TYPES, REPORT_TYPES, HULL_RESTORATION_PHASES, customTemplate, migrateSections, protocolTemplate, proposalTemplate, scrapingSections, type ReportType } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { assertVesselAccess, requirePerm, vesselFilter, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { CLAUSE_CATALOG, reportPdf } from '../services/pdf';
import { managerIds, notify, vesselClientUserIds } from '../services/notify';
import { audit } from '../lib/audit';
import { upsertWeeklyReport, weekStartOf } from '../services/weekly';

export const reportsRouter = Router();

const TYPE_KEYS = Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]];

function scope(user: AuthUser): Prisma.ReportWhereInput {
  return { ...vesselFilter(user), ...(user.isStaff ? {} : { status: 'PUBLISHED', customerVisible: true }) };
}

reportsRouter.get('/clauses', (_req, res) => res.json(CLAUSE_CATALOG));

// ───────────────────────── Rapor başlıkları (kategoriler) ─────────────────────────
const BUILTIN: { type: ReportType; group: string; tone: string; sortOrder: number; description: string }[] = [
  { type: 'WEEKLY_SERVICE', group: 'reports', tone: 'teal', sortOrder: 1, description: 'İş emirlerinden otomatik' },
  { type: 'POST_SCRAPING', group: 'reports', tone: 'violet', sortOrder: 2, description: 'Bulgular ve başlıklar serbest' },
  { type: 'HULL_RESTORATION', group: 'reports', tone: 'navy', sortOrder: 3, description: 'Aşamalar ve ilerleme' },
  { type: 'TEAK_CARPENTRY', group: 'reports', tone: 'amber', sortOrder: 4, description: 'Alan / m² tablosu' },
  { type: 'DELIVERY_PROTOCOL', group: 'contracts', tone: 'blue', sortOrder: 1, description: 'Teslim, garanti ve ibra' },
  { type: 'PROJECT_PROPOSAL', group: 'contracts', tone: 'violet', sortOrder: 2, description: 'Gerekçe, kapsam ve süre' },
];
let builtinsReady = false;
/** Hazır başlıkları ilk kullanımda oluşturur, kategorisi olmayan belge ve şablonları bağlar */
async function ensureCategories() {
  if (!builtinsReady) {
    const have = await prisma.reportCategory.findMany({ where: { builtIn: true }, select: { baseType: true } });
    const missing = BUILTIN.filter((b) => !have.some((h) => h.baseType === b.type));
    if (missing.length) await prisma.reportCategory.createMany({ data: missing.map((b) => ({ name: REPORT_TYPES[b.type], description: b.description, tone: b.tone, baseType: b.type, group: b.group, sortOrder: b.sortOrder, builtIn: true })) });
    builtinsReady = true;
  }
  const cats = await prisma.reportCategory.findMany({ where: { builtIn: true } });
  for (const c of cats) {
    await prisma.report.updateMany({ where: { categoryId: null, type: c.baseType }, data: { categoryId: c.id } });
    await prisma.reportTemplate.updateMany({ where: { categoryId: null, type: c.baseType }, data: { categoryId: c.id } });
  }
}

reportsRouter.get(
  '/categories',
  requirePerm('reports.view', 'reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    await ensureCategories();
    const group = z.string().optional().parse(req.query.group);
    const cats = await prisma.reportCategory.findMany({ where: { isActive: true, ...(group ? { group } : {}) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const [byCat, pending] = await Promise.all([
      prisma.report.groupBy({ by: ['categoryId'], where: { ...scope(req.user), categoryId: { in: cats.map((c) => c.id) } }, _count: true }),
      prisma.report.groupBy({ by: ['categoryId'], where: { ...scope(req.user), categoryId: { in: cats.map((c) => c.id) }, approvalStatus: 'PENDING' }, _count: true }),
    ]);
    const cnt = Object.fromEntries(byCat.map((b) => [b.categoryId, b._count]));
    const pen = Object.fromEntries(pending.map((b) => [b.categoryId, b._count]));
    res.json(cats.map((c) => ({ ...c, count: cnt[c.id] ?? 0, pending: pen[c.id] ?? 0 })));
  }),
);

const categoryBody = z.object({ name: z.string().trim().min(2), description: zOptStr, tone: z.string().optional(), group: z.enum(['reports', 'contracts']).default('reports'), fromCategoryId: zOptStr, sortOrder: z.number().int().optional() });

/** Yeni rapor başlığı: boş (serbest bölümlü) ya da var olan bir başlığın şablonundan */
reportsRouter.post(
  '/categories',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const body = categoryBody.parse(req.body);
    const from = body.fromCategoryId ? await prisma.reportCategory.findUnique({ where: { id: body.fromCategoryId } }) : null;
    if (from?.baseType === 'WEEKLY_SERVICE' || from?.baseType === 'INSPECTION') throw badRequest('Otomatik oluşturulan raporlar kopyalanamaz');
    const last = await prisma.reportCategory.aggregate({ where: { group: body.group }, _max: { sortOrder: true } });
    const cat = await prisma.reportCategory.create({
      data: { name: body.name, description: body.description ?? null, tone: body.tone ?? from?.tone ?? 'navy', group: body.group, baseType: from?.baseType ?? 'CUSTOM', sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    // Kaynak başlığın varsayılan şablonu yeni başlığa da varsayılan olarak kopyalanır
    if (from) {
      const tpl = await prisma.reportTemplate.findFirst({ where: { categoryId: from.id, isDefault: true } });
      if (tpl) await prisma.reportTemplate.create({ data: { name: body.name, type: tpl.type, data: tpl.data as Prisma.InputJsonValue, isDefault: true, categoryId: cat.id, createdById: req.user.id } });
    }
    await audit(req.user.id, 'category.create', 'ReportCategory', cat.id, { name: cat.name });
    res.status(201).json(cat);
  }),
);

reportsRouter.put(
  '/categories/:cid',
  requirePerm('reports.approve'),
  ah(async (req, res) => {
    const body = categoryBody.omit({ fromCategoryId: true, group: true }).partial().parse(req.body);
    res.json(await prisma.reportCategory.update({ where: { id: req.params.cid }, data: { name: body.name, description: body.description, tone: body.tone, sortOrder: body.sortOrder } }));
  }),
);

/** Başlığı kaldır: belgesi varsa gizlenir (belgeler korunur), yoksa silinir */
reportsRouter.delete(
  '/categories/:cid',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const cat = await prisma.reportCategory.findUniqueOrThrow({ where: { id: req.params.cid } });
    const used = await prisma.report.count({ where: { categoryId: cat.id } });
    if (used || cat.builtIn) await prisma.reportCategory.update({ where: { id: cat.id }, data: { isActive: false } });
    else {
      await prisma.reportTemplate.deleteMany({ where: { categoryId: cat.id } });
      await prisma.reportCategory.delete({ where: { id: cat.id } });
    }
    await audit(req.user.id, 'category.delete', 'ReportCategory', cat.id, { name: cat.name, hidden: !!(used || cat.builtIn) });
    res.json({ ok: true, hidden: !!(used || cat.builtIn) });
  }),
);

/** Tür başına belge sayıları ve onay bekleyenler (kategori kartları için) */
reportsRouter.get(
  '/counts',
  requirePerm('reports.view', 'reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const [byType, pending] = await Promise.all([
      prisma.report.groupBy({ by: ['type'], where: scope(req.user), _count: true }),
      prisma.report.groupBy({ by: ['type'], where: { ...scope(req.user), approvalStatus: 'PENDING' }, _count: true }),
    ]);
    res.json({
      byType: Object.fromEntries(byType.map((b) => [b.type, b._count])),
      pendingByType: Object.fromEntries(pending.map((b) => [b.type, b._count])),
    });
  }),
);

reportsRouter.get(
  '/',
  requirePerm('reports.view', 'reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery
      .extend({ vesselId: z.string().optional(), type: z.enum(TYPE_KEYS).optional(), status: z.string().optional(), projectId: z.string().optional(), approval: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), types: z.string().optional(), categoryIds: z.string().optional(), vesselIds: z.string().optional(), statuses: z.string().optional(), approvals: z.string().optional() })
      .parse(req.query);
    if (q.categoryIds) await ensureCategories();
    const list = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
    const approvals = list(q.approvals);
    const where: Prisma.ReportWhereInput = {
      ...scope(req.user),
      ...(q.approval ? { approvalStatus: q.approval } : {}),
      ...(approvals.length ? { OR: [...(approvals.includes('NONE') ? [{ approvalStatus: null }] : []), { approvalStatus: { in: approvals.filter((a) => a !== 'NONE') as any } }] } : {}),
      ...(q.categoryIds ? { categoryId: { in: list(q.categoryIds) } } : {}),
      ...(q.vesselIds ? { vesselId: { in: list(q.vesselIds) } } : {}),
      ...(q.statuses ? { status: { in: list(q.statuses) as any } } : {}),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.type ? { type: q.type } : q.types ? { type: { in: q.types.split(',').filter((t) => (TYPE_KEYS as readonly string[]).includes(t)) as ReportType[] } } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.q ? { AND: [{ OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.report.findMany({ where, ...paginate(q), orderBy: { updatedAt: 'desc' }, include: { vessel: { select: { id: true, name: true } } } }),
      prisma.report.count({ where }),
    ]);
    const cats = await prisma.reportCategory.findMany({ where: { id: { in: [...new Set(items.map((i) => i.categoryId).filter(Boolean) as string[])] } }, select: { id: true, name: true, tone: true } });
    const byId = new Map(cats.map((c) => [c.id, c]));
    res.json({ items: items.map((i) => ({ ...i, category: i.categoryId ? byId.get(i.categoryId) ?? null : null })), total, page: q.page, pageSize: q.pageSize });
  }),
);

/** Taslak verisini ilgili tekne / iş emri / projeden otomatik doldurur */
async function prefill(type: ReportType, vesselId: string, workOrderId?: string | null, projectId?: string | null, user?: AuthUser, categoryName?: string) {
  const base: Record<string, any> = { reportDate: new Date().toISOString(), preparedBy: user?.name };
  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (type === 'POST_SCRAPING') {
    // Örnek belge (kazıma sonrası teknik inceleme raporu) birebir şablon
    return { ...base, ...scrapingSections(vessel?.name), inspectionDate: new Date().toISOString(), location: vessel?.marina, inspector: user?.name };
  }
  if (type === 'PROJECT_PROPOSAL') {
    return { ...base, ...proposalTemplate(vessel?.name) };
  }
  if (type === 'CUSTOM') {
    return { ...base, ...customTemplate(categoryName ?? 'Rapor', vessel?.name ?? ''), location: vessel?.marina };
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
    // Örnek sözleşme (Nihai Birleşik Teslim Protokolü) birebir şablon
    return { ...base, ...protocolTemplate(vessel?.name) };
  }
  if ((type as string) === 'DELIVERY_PROTOCOL_LEGACY') {
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

// ───────────────────────── Şablonlar ─────────────────────────
/** Metin içindeki tekneye özgü değerleri yer tutuculara çevirir ({TEKNE}, {MARINA}) ve geri doldurur ({TARIH} dahil) */
function mapStrings(v: unknown, fn: (s: string) => string): any {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn)]));
  return v;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function toTemplate(data: Record<string, any>, vessel: { name: string; marina: string | null }) {
  const { reportDate: _r, inspectionDate: _i, ...rest } = data;
  const names = [vessel.name, vessel.name.replace(/^M\/Y\s+/i, '')].filter((n) => n.length > 2).sort((a, b) => b.length - a.length);
  // "SEA RODS" ↔ "SEA ROD'S" gibi kesme işaretli yazımlar da eşleşsin
  const loose = (n: string) => new RegExp(n.split('').map(escapeRe).join("['’]?"), 'gi');
  return mapStrings(rest, (s) => {
    let out = s;
    for (const n of names) out = out.replace(loose(n), n === vessel.name ? '{TEKNE}' : '{TEKNE_KISA}');
    if (vessel.marina && vessel.marina.length > 3) out = out.replace(new RegExp(escapeRe(vessel.marina), 'g'), '{MARINA}');
    return out;
  });
}
function fromTemplate(data: Record<string, any>, vessel: { name: string; marina: string | null }) {
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, ' / ');
  return mapStrings(data, (s) => s.replace(/\{TEKNE\}/g, vessel.name).replace(/\{TEKNE_KISA\}/g, vessel.name.replace(/^M\/Y\s+/i, '')).replace(/\{MARINA\}/g, vessel.marina ?? '').replace(/\{TARIH\}/g, today));
}

reportsRouter.get(
  '/templates',
  requirePerm('reports.manage'),
  ah(async (req, res) => {
    const type = z.enum(TYPE_KEYS).optional().parse(req.query.type);
    const categoryId = z.string().optional().parse(req.query.categoryId);
    if (categoryId) await ensureCategories();
    res.json(await prisma.reportTemplate.findMany({ where: categoryId ? { categoryId } : type ? { type } : {}, orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }] }));
  }),
);

const templateBody = z.object({ name: z.string().trim().min(2), description: zOptStr, isDefault: z.boolean().optional() });

/** Bir belgeyi şablon olarak kaydet (tekne adı / marina yer tutucuya çevrilir) */
reportsRouter.post(
  '/:id/save-template',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const body = templateBody.parse(req.body);
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id }, include: { vessel: true, versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (['INSPECTION', 'WEEKLY_SERVICE'].includes(r.type)) throw badRequest('Bu belge türü otomatik oluşturulur, şablon gerekmez');
    const data = toTemplate((r.versions[0]?.data ?? {}) as Record<string, any>, r.vessel);
    const t = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.reportTemplate.updateMany({ where: r.categoryId ? { categoryId: r.categoryId } : { type: r.type }, data: { isDefault: false } });
      return tx.reportTemplate.create({ data: { name: body.name, description: body.description ?? null, isDefault: !!body.isDefault, type: r.type, categoryId: r.categoryId, data, createdById: req.user.id } });
    });
    await audit(req.user.id, 'template.create', 'ReportTemplate', t.id, { type: r.type });
    res.status(201).json(t);
  }),
);

reportsRouter.put(
  '/templates/:tid',
  requirePerm('reports.approve'),
  ah(async (req, res) => {
    const body = templateBody.partial().parse(req.body);
    const t = await prisma.reportTemplate.findUniqueOrThrow({ where: { id: req.params.tid } });
    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.reportTemplate.updateMany({ where: { ...(t.categoryId ? { categoryId: t.categoryId } : { type: t.type }), id: { not: t.id } }, data: { isDefault: false } });
      return tx.reportTemplate.update({ where: { id: t.id }, data: { name: body.name, description: body.description, isDefault: body.isDefault } });
    });
    res.json(updated);
  }),
);

reportsRouter.delete(
  '/templates/:tid',
  requirePerm('reports.approve'),
  ah(async (req, res) => {
    await prisma.reportTemplate.delete({ where: { id: req.params.tid } });
    res.json({ ok: true });
  }),
);

// ───────────────────────── Haftalık bakım ve servis raporu ─────────────────────────
/** Tek tekne veya tüm aktif tekneler için haftalık rapor oluştur / taslağı yenile */
reportsRouter.post(
  '/weekly',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ vesselId: z.string().optional(), weekStart: z.coerce.date().optional() }).parse(req.body ?? {});
    const week = body.weekStart ?? new Date(weekStartOf(new Date()).getTime() - 7 * 864e5);
    if (body.vesselId) {
      assertVesselAccess(req.user, body.vesselId);
      const r = await upsertWeeklyReport(body.vesselId, week, req.user.id);
      return res.status(r?.created ? 201 : 200).json({ created: r?.created ? 1 : 0, reportId: r?.report.id });
    }
    const vessels = await prisma.vessel.findMany({ where: { isActive: true }, select: { id: true } });
    let created = 0;
    let refreshed = 0;
    for (const v of vessels) {
      const r = await upsertWeeklyReport(v.id, week, req.user.id, { onlyIfActivity: true });
      if (r?.created) created++;
      else if (r) refreshed++;
    }
    res.json({ created, refreshed });
  }),
);

/** Taslak haftalık raporun verilerini iş emirlerinden yeniden çek */
reportsRouter.post(
  '/:id/refresh-weekly',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (r.type !== 'WEEKLY_SERVICE') throw badRequest('Yalnızca haftalık raporlar yenilenebilir');
    if (r.versions[0]?.status !== 'DRAFT') throw badRequest('Onaylı rapor yenilenemez; önce düzenleyip yeni sürüm açın');
    const start = new Date(((r.versions[0].data ?? {}) as any).weekStart ?? Date.now());
    await upsertWeeklyReport(r.vesselId, start, req.user.id);
    res.json({ ok: true });
  }),
);

reportsRouter.post(
  '/',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const raw = z.object({ type: z.enum(TYPE_KEYS).optional(), categoryId: zOptStr, vesselId: z.string(), title: zOptStr, workOrderId: zOptStr, projectId: zOptStr, templateId: zOptStr, data: z.record(z.any()).optional() }).parse(req.body);
    await ensureCategories();
    const cat = raw.categoryId
      ? await prisma.reportCategory.findUniqueOrThrow({ where: { id: raw.categoryId } })
      : raw.type
        ? await prisma.reportCategory.findFirst({ where: { builtIn: true, baseType: raw.type } })
        : null;
    if (!cat && !raw.type) throw badRequest('Rapor başlığı seçin');
    const body = { ...raw, type: (cat?.baseType ?? raw.type) as ReportType };
    if (body.type === 'INSPECTION') throw badRequest('Denetim raporları denetim onayı ile otomatik oluşturulur');
    if (body.type === 'WEEKLY_SERVICE') throw badRequest('Haftalık raporlar "Haftalık rapor oluştur" ile hazırlanır');
    assertVesselAccess(req.user, body.vesselId);
    const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: body.vesselId } });
    // Şablon: seçilen → türün varsayılanı → sistemdeki örnek belge
    const tpl = body.templateId === 'SYSTEM'
      ? null
      : body.templateId
        ? await prisma.reportTemplate.findUnique({ where: { id: body.templateId } })
        : await prisma.reportTemplate.findFirst({ where: cat ? { categoryId: cat.id, isDefault: true } : { type: body.type, isDefault: true } });
    const base = await prefill(body.type, body.vesselId, body.workOrderId, body.projectId, req.user, cat?.name);
    const data = migrateSections({ ...base, ...(tpl ? fromTemplate(tpl.data as Record<string, any>, vessel) : {}), reportDate: base.reportDate, ...(body.data ?? {}) });
    const report = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('RPT', tx);
      return tx.report.create({
        data: {
          number,
          type: body.type,
          title: body.title || `${cat?.name ?? REPORT_TYPES[body.type]} — ${vessel.name}`,
          categoryId: cat?.id,
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
    const category = r.categoryId ? await prisma.reportCategory.findUnique({ where: { id: r.categoryId } }) : null;
    res.json({ ...r, category, versions, users: Object.fromEntries(users.map((u) => [u.id, u.name])) });
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
    const result = await saveData(req.params.id, body.data, req.user.id, { title: body.title, changeNote: body.changeNote, customerVisible: body.customerVisible });
    await audit(req.user.id, 'report.update', 'Report', req.params.id, { version: result.currentVersion });
    res.json(result);
  }),
);

async function saveData(reportId: string, data: Record<string, any>, userId: string, opts: { title?: string | null; changeNote?: string | null; customerVisible?: boolean; forceNew?: boolean } = {}) {
  const r = await prisma.report.findUniqueOrThrow({ where: { id: reportId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (r.type === 'INSPECTION') throw badRequest('Denetim raporu denetim kaydı üzerinden düzenlenir');
  const latest = r.versions[0];
  return prisma.$transaction(async (tx) => {
    if (latest && ['DRAFT', 'IN_REVIEW'].includes(latest.status)) {
      await tx.reportVersion.update({ where: { id: latest.id }, data: { data, changeNote: opts.changeNote ?? latest.changeNote } });
    } else {
      await tx.reportVersion.create({ data: { reportId: r.id, version: (latest?.version ?? 0) + 1, data, createdById: userId, changeNote: opts.changeNote ?? 'Onaylı rapor üzerinde revizyon' } });
    }
    const fresh = await tx.reportVersion.findFirstOrThrow({ where: { reportId: r.id }, orderBy: { version: 'desc' } });
    return tx.report.update({
      where: { id: r.id },
      data: { title: opts.title ?? undefined, currentVersion: fresh.version, customerVisible: opts.customerVisible, status: fresh.status === 'DRAFT' && r.status !== 'DRAFT' ? r.status : fresh.status },
    });
  });
}

/** Seçilen şablonu (veya sistem örneğini) belgeye uygula; mevcut taslak güncellenir ya da yeni sürüm açılır */
reportsRouter.post(
  '/:id/apply-template',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { templateId } = z.object({ templateId: z.string() }).parse(req.body);
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id }, include: { vessel: true, versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (['INSPECTION', 'WEEKLY_SERVICE'].includes(r.type)) throw badRequest('Bu belge türüne şablon uygulanmaz');
    const category = r.categoryId ? await prisma.reportCategory.findUnique({ where: { id: r.categoryId } }) : null;
    const cur = (r.versions[0]?.data ?? {}) as Record<string, any>;
    const base = await prefill(r.type, r.vesselId, r.workOrderId, r.projectId, req.user, category?.name);
    let name = 'Sistem şablonu';
    let data: Record<string, any> = base;
    if (templateId !== 'SYSTEM') {
      const tpl = await prisma.reportTemplate.findUniqueOrThrow({ where: { id: templateId } });
      name = tpl.name;
      data = { ...base, ...fromTemplate(tpl.data as Record<string, any>, r.vessel) };
    }
    data = migrateSections({ ...data, reportDate: cur.reportDate ?? base.reportDate, preparedBy: cur.preparedBy ?? base.preparedBy });
    const result = await saveData(r.id, data, req.user.id, { changeNote: `"${name}" şablonu uygulandı` });
    await audit(req.user.id, 'report.apply-template', 'Report', r.id, { templateId });
    res.json(result);
  }),
);

/** Eski bir sürümün içeriğini geri yükle (yeni taslak / güncel taslak olarak) */
reportsRouter.post(
  '/:id/restore',
  requirePerm('reports.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { version } = z.object({ version: z.number().int() }).parse(req.body);
    const v = await prisma.reportVersion.findFirstOrThrow({ where: { reportId: req.params.id, version } });
    const result = await saveData(req.params.id, v.data as Record<string, any>, req.user.id, { changeNote: `Sürüm ${version} geri yüklendi` });
    await audit(req.user.id, 'report.restore', 'Report', req.params.id, { version });
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

/** Yayından kaldır: müşteri portalında artık görünmez (onaylı sürüm korunur) */
reportsRouter.post(
  '/:id/unpublish',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const report = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.$transaction([
      prisma.reportVersion.updateMany({ where: { reportId: report.id, status: 'PUBLISHED' }, data: { status: 'APPROVED' } }),
      prisma.report.update({ where: { id: report.id }, data: { status: report.status === 'PUBLISHED' ? 'APPROVED' : report.status, customerVisible: false } }),
    ]);
    await audit(req.user.id, 'report.unpublish', 'Report', report.id, {});
    res.json({ ok: true });
  }),
);

/**
 * Müşteri onayına gönder (sözleşme / teslim protokolü / proje teklif dosyası).
 * Onaylı sürüm müşteri portalında yayınlanır ve tekne sahibi / kaptana "Onay talebi" bildirimi gider.
 */
reportsRouter.post(
  '/:id/request-approval',
  requirePerm('reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const report = await prisma.report.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!(APPROVAL_REPORT_TYPES as readonly string[]).includes(report.type)) throw badRequest('Bu belge türü müşteri onayına gönderilemez');
    const v = await prisma.reportVersion.findFirst({ where: { reportId: report.id }, orderBy: { version: 'desc' } });
    if (!v || !['APPROVED', 'PUBLISHED'].includes(v.status)) throw badRequest('Önce belgenin son sürümünü onaylayın');
    await prisma.$transaction([
      prisma.reportVersion.updateMany({ where: { reportId: report.id, status: 'PUBLISHED', id: { not: v.id } }, data: { status: 'SUPERSEDED' } }),
      prisma.reportVersion.update({ where: { id: v.id }, data: { status: 'PUBLISHED' } }),
      prisma.report.update({
        where: { id: report.id },
        data: { status: 'PUBLISHED', customerVisible: true, currentVersion: v.version, approvalStatus: 'PENDING', approvalRequestedAt: new Date(), approvalDecidedAt: null, approvalDecidedById: null, approvalDecidedBy: null, approvalNote: null },
      }),
    ]);
    await notify(await vesselClientUserIds(report.vesselId), {
      type: 'APPROVAL_REQUEST',
      title: 'Onayınız bekleniyor',
      body: report.title,
      link: `/reports/${report.id}`,
      entityType: 'Report',
      entityId: report.id,
      dedupeKey: `report-approval-${report.id}-v${v.version}`,
    });
    await audit(req.user.id, 'report.request-approval', 'Report', report.id, { version: v.version });
    res.json({ ok: true });
  }),
);

/** Müşteri kararı: onayla / reddet (tekne sahibi veya kaptan; personel müşteri adına kaydedebilir) */
reportsRouter.post(
  '/:id/decision',
  requirePerm('reports.view', 'reports.approve'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: zOptStr }).parse(req.body);
    const report = await prisma.report.findFirst({ where: { id: req.params.id, ...scope(req.user) } });
    if (!report) throw notFound('Belge');
    if (report.approvalStatus !== 'PENDING') throw badRequest('Bu belge için bekleyen bir onay talebi yok');
    if (req.user.isStaff && !req.user.isManager) throw badRequest('Onay kararını müşteri veya yönetici verebilir');
    if (body.decision === 'REJECTED' && !body.note?.trim()) throw badRequest('Reddetme nedeni yazın');
    const who = req.user.isStaff ? `${req.user.name} (müşteri adına)` : req.user.name;
    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { approvalStatus: body.decision, approvalDecidedAt: new Date(), approvalDecidedById: req.user.id, approvalDecidedBy: who, approvalNote: body.note ?? null },
    });
    await notify(
      await managerIds(),
      {
        type: 'APPROVAL_RESPONSE',
        title: body.decision === 'APPROVED' ? `Onay alındı: ${report.title}` : `Reddedildi: ${report.title}`,
        body: [who, body.note].filter(Boolean).join(' · '),
        link: `/reports/${report.id}`,
        entityType: 'Report',
        entityId: report.id,
        fromClient: !req.user.isStaff,
      },
      req.user.id,
    );
    await audit(req.user.id, `report.${body.decision.toLowerCase()}`, 'Report', report.id, { note: body.note });
    res.json(updated);
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
