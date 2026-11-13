import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { MAINTENANCE_STATUSES, PRIORITIES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { assertVesselAccess, can, isTechOnly, requirePerm, vesselFilter, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptDate, zOptNum, zOptStr } from '../lib/validate';
import { managerIds, notify, vesselClientUserIds } from '../services/notify';
import { scheduleNextRecurrence } from '../services/workorders';
import { attachmentsFor } from './files';
import { dropFuture, extendSeries, hasRepeat, snapToRule, startSeries } from '../services/maintSeries';

export const maintenanceRouter = Router();

const schema = z.object({
  title: z.string().trim().min(2),
  category: z.string().trim().min(1),
  subType: zOptStr,
  vesselId: z.string(),
  description: zOptStr,
  plannedDate: z.coerce.date(),
  startDate: zOptDate,
  endDate: zOptDate,
  technicianId: zOptStr,
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  plannedMaterials: z.array(z.object({ materialId: z.string().optional(), name: z.string(), quantity: z.coerce.number(), unit: z.string().optional() })).optional(),
  estimatedHours: zOptNum,
  actualHours: zOptNum,
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  technicalNotes: zOptStr,
  intervalDays: zOptNum,
  engineId: zOptStr,
  intervalEngineHours: zOptNum,
  dueEngineHours: zOptNum,
  haulOutDate: zOptDate,
  launchDate: zOptDate,
  /** Periyodik: haftanın günleri (0=Paz … 6=Cmt) veya ayın günü */
  repeatWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  repeatMonthDay: z.number().int().min(1).max(31).nullable().optional(),
  /** Periyodik bakımın bitiş tarihi */
  repeatUntil: zOptDate,
  helperIds: z.array(z.string()).optional(),
  /** Bakım adımları (paket maddeleri) */
  checklist: z.array(z.object({ label: z.string().trim().min(1), done: z.boolean().default(false), doneAt: z.string().nullable().optional(), doneBy: z.string().nullable().optional() })).optional(),
  completionNote: zOptStr,
});
const userSel = { select: { id: true, name: true } };

const clean = (d: Partial<z.infer<typeof schema>>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (v !== undefined) out[k] = v;
  return out as any;
};

maintenanceRouter.get(
  '/',
  requirePerm('maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery
      .extend({
        vesselId: z.string().optional(),
        category: z.string().optional(),
        status: z.string().optional(),
        technicianId: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        upcoming: z.enum(['true']).optional(),
        source: z.enum(['CUSTOMER', 'STAFF']).optional(),
      })
      .parse(req.query);
    const where: Prisma.MaintenancePlanWhereInput = {
      ...vesselFilter(req.user),
      ...(isTechOnly(req.user) ? { AND: [{ OR: [{ technicianId: req.user.id }, { helperIds: { has: req.user.id } }] }] } : {}),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.category ? { category: q.category as any } : {}),
      ...(q.status ? { status: { in: q.status.split(',') as any } } : {}),
      ...(q.technicianId ? { OR: [{ technicianId: q.technicianId }, { helperIds: { has: q.technicianId } }] } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.upcoming ? { status: { in: ['PLANNED', 'OVERDUE'] } } : {}),
      ...(q.from || q.to ? { plannedDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
    if (q.q) where.AND = [...((where.AND as any[]) ?? []), { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] }];
    const [items, total] = await Promise.all([
      prisma.maintenancePlan.findMany({
        where,
        ...paginate(q),
        orderBy: sortBy(q.sort, q.sort ? q.order : 'asc', ['plannedDate', 'priority', 'status', 'title'], 'plannedDate'),
        include: {
          vessel: { select: { id: true, name: true, marina: true } },
          technician: { select: { id: true, name: true } },
          engine: { select: { id: true, position: true, hours: true } },
          workOrder: { select: { id: true, number: true, status: true } },
        },
      }),
      prisma.maintenancePlan.count({ where }),
    ]);
    res.json({ items: await withHelpers(items), total, page: q.page, pageSize: q.pageSize });
  }),
);

/** Ek teknisyenlerin adları */
async function withHelpers<T extends { helperIds: string[] }>(rows: T[]) {
  const ids = [...new Set(rows.flatMap((r) => r.helperIds))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return rows.map((r) => ({ ...r, helpers: r.helperIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) }));
}

async function notifyPlanAssigned(m: { id: string; title: string; technicianId: string | null; helperIds: string[] }) {
  for (const uid of [m.technicianId, ...m.helperIds].filter(Boolean) as string[]) {
    await notify([uid], { type: 'TASK_ASSIGNED', title: 'Yeni bakım planı atandı', body: m.title, link: `/maintenance/${m.id}`, entityType: 'MaintenancePlan', entityId: m.id, dedupeKey: `maint-assign-${m.id}-${uid}` });
  }
}

/** Müşteri portalından bakım planlama (tek seferlik veya periyodik) — Bakım Planları'na "Müşteri talebi" olarak düşer */
maintenanceRouter.post(
  '/request',
  requirePerm('workorders.request'),
  ah<AuthedRequest>(async (req, res) => {
    const b = z.object({
      vesselId: z.string(),
      title: z.string().trim().min(2),
      category: z.string().trim().min(1),
      description: zOptStr,
      plannedDate: z.coerce.date(),
      repeatWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
      repeatMonthDay: z.number().int().min(1).max(31).nullable().optional(),
      repeatUntil: zOptDate,
    }).parse(req.body);
    assertVesselAccess(req.user, b.vesselId);
    const rule = { repeatWeekdays: b.repeatWeekdays, repeatMonthDay: b.repeatWeekdays.length ? null : b.repeatMonthDay ?? null };
    const plannedDate = hasRepeat(rule) ? snapToRule(rule, b.plannedDate) : b.plannedDate;
    const m = await prisma.maintenancePlan.create({
      data: { vesselId: b.vesselId, title: b.title, category: b.category, description: b.description ?? undefined, plannedDate, startDate: plannedDate, endDate: hasRepeat(rule) ? null : plannedDate, repeatUntil: hasRepeat(rule) ? b.repeatUntil ?? null : null, ...rule, source: 'CUSTOMER', requestedById: req.user.id },
      include: { vessel: { select: { name: true } } },
    });
    if (hasRepeat(rule)) await startSeries(m.id);
    await notify(await managerIds(), {
      type: 'CUSTOMER_REQUEST',
      title: `Müşteri bakım planladı: ${m.vessel.name}`,
      body: m.title,
      link: `/maintenance/${m.id}`,
      entityType: 'MaintenancePlan',
      entityId: m.id,
      dedupeKey: `maint-request-${m.id}`,
      fromClient: true,
    }, req.user.id);
    res.status(201).json(m);
  }),
);

maintenanceRouter.get(
  '/packages',
  requirePerm('maintenance.manage'),
  ah(async (_req, res) => {
    res.json(await packages());
  }),
);

maintenanceRouter.get(
  '/:id',
  requirePerm('maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const m = await prisma.maintenancePlan.findFirst({
      where: { id: req.params.id, ...vesselFilter(req.user) },
      include: {
        vessel: { select: { id: true, name: true, marina: true, berth: true } },
        technician: { select: { id: true, name: true } },
        engine: true,
        workOrder: { select: { id: true, number: true, status: true } },
        extraWorkOrders: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, title: true, status: true, createdAt: true, technician: { select: { id: true, name: true } } } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!m) throw notFound('Bakım');
    const requester = m.requestedById ? await prisma.user.findUnique({ where: { id: m.requestedById }, ...userSel }) : null;
    const attachments = await attachmentsFor(req.user, 'MAINTENANCE', m.id);
    const series = m.seriesId
      ? await prisma.maintenancePlan.findMany({ where: { seriesId: m.seriesId }, orderBy: { plannedDate: 'asc' }, select: { id: true, plannedDate: true, status: true } })
      : [];
    const [withH] = await withHelpers([m]);
    const out = { ...withH, requester, attachments, series, canWork: canWork(req.user, m) };
    if (!req.user.isStaff) {
      // Müşteri: özet — dahili notlar ve dahili yorumlar gizli
      return res.json({ ...out, technicalNotes: undefined, comments: m.comments.filter((c) => !c.internal), plannedMaterials: undefined, estimatedHours: undefined, actualHours: undefined, canWork: false });
    }
    res.json(out);
  }),
);

maintenanceRouter.post(
  '/',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = schema.parse(req.body);
    if (body.engineId && body.intervalEngineHours && body.dueEngineHours == null) {
      const engine = await prisma.engine.findUnique({ where: { id: body.engineId } });
      if (engine) body.dueEngineHours = engine.hours + body.intervalEngineHours;
    }
    const rule = { repeatWeekdays: body.repeatWeekdays ?? [], repeatMonthDay: body.repeatWeekdays?.length ? null : body.repeatMonthDay ?? null };
    // Periyodik: ilk tarih başlangıçtan sonraki ilk uygun gün; her tekrar tek günlüktür, bitiş = seri bitişi
    if (hasRepeat(rule)) { body.plannedDate = snapToRule(rule, body.startDate ?? body.plannedDate); body.startDate = body.plannedDate; body.endDate = null; body.intervalDays = null; }
    const m = await prisma.maintenancePlan.create({ data: { ...clean(body), ...rule } });
    if (hasRepeat(rule)) await startSeries(m.id);
    await notifyPlanAssigned(m);
    res.status(201).json(m);
  }),
);

maintenanceRouter.put(
  '/:id',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = schema.partial().parse(req.body);
    const existing = await prisma.maintenancePlan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Bakım');
    const data = clean(body);
    if (body.repeatWeekdays?.length) data.repeatMonthDay = null;
    // Tarih ileri alınırsa gecikmiş durumu kaldır
    if (existing.status === 'OVERDUE' && body.plannedDate && body.plannedDate > new Date() && !body.status) data.status = 'PLANNED';
    const rule = { repeatWeekdays: (data.repeatWeekdays as number[] | undefined) ?? existing.repeatWeekdays, repeatMonthDay: data.repeatMonthDay !== undefined ? (data.repeatMonthDay as number | null) : existing.repeatMonthDay };
    // Seri: plan bilgisi veya tekrar kuralı değişince sonraki (işe dönüşmemiş) planlar bu plana göre yeniden oluşturulur
    const seriesFields = ['title', 'category', 'subType', 'description', 'technicianId', 'helperIds', 'priority', 'estimatedHours', 'plannedMaterials', 'repeatWeekdays', 'repeatMonthDay', 'repeatUntil', 'plannedDate'];
    const touchesSeries = seriesFields.some((k) => k in data);
    if (touchesSeries && existing.seriesId) await dropFuture(existing.seriesId, existing.plannedDate);
    if (hasRepeat(rule) && !existing.seriesId) data.seriesId = existing.id;
    if (hasRepeat(rule)) data.intervalDays = null;
    const updated = await prisma.maintenancePlan.update({ where: { id: existing.id }, data });
    if (touchesSeries && updated.seriesId && hasRepeat(rule)) await extendSeries(updated.seriesId);
    const newHelpers = (body.helperIds ?? []).filter((h) => !existing.helperIds.includes(h));
    if ((body.technicianId && body.technicianId !== existing.technicianId) || newHelpers.length) await notifyPlanAssigned({ ...updated, technicianId: body.technicianId !== existing.technicianId ? updated.technicianId : null, helperIds: newHelpers });
    res.json(updated);
  }),
);

maintenanceRouter.delete(
  '/:id',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const m = await prisma.maintenancePlan.findUnique({ where: { id: req.params.id } });
    if (!m) throw notFound('Bakım');
    // ?series=1 → bu plan ve serinin sonraki (işe dönüşmemiş) planları silinir, tekrar durur
    let removed = 0;
    if (req.query.series && m.seriesId) {
      removed = await dropFuture(m.seriesId, m.plannedDate);
      await prisma.maintenancePlan.updateMany({ where: { seriesId: m.seriesId }, data: { repeatWeekdays: [], repeatMonthDay: null } });
    }
    await prisma.maintenancePlan.delete({ where: { id: m.id } });
    res.json({ ok: true, removed: removed + 1 });
  }),
);

/** Bakımda çalışabilir mi: yönetici, atanan (sorumlu/ek) teknisyen; kimse atanmamışsa herhangi bir teknisyen */
function canWork(user: AuthUser, m: { technicianId: string | null; helperIds: string[] }) {
  if (can(user, 'maintenance.manage')) return true;
  if (!user.isStaff || !can(user, 'workorders.execute')) return false;
  if (m.technicianId === user.id || m.helperIds.includes(user.id)) return true;
  return !m.technicianId && m.helperIds.length === 0;
}

async function loadForWork(user: AuthUser, id: string) {
  const m = await prisma.maintenancePlan.findFirst({ where: { id, ...vesselFilter(user) } });
  if (!m) throw notFound('Bakım');
  if (!canWork(user, m)) throw forbidden();
  return m;
}

type Step = { label: string; done: boolean; doneAt?: string | null; doneBy?: string | null };
const steps = (c: unknown): Step[] => (Array.isArray(c) ? (c as Step[]) : []);

/** Tek adımı tamamlandı / tamamlanmadı işaretle */
maintenanceRouter.post(
  '/:id/steps',
  requirePerm('maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const b = z.object({ index: z.number().int().min(0), done: z.boolean() }).parse(req.body);
    const m = await loadForWork(req.user, req.params.id);
    const list = steps(m.checklist);
    if (!list[b.index]) throw badRequest('Adım bulunamadı');
    list[b.index] = { ...list[b.index], done: b.done, doneAt: b.done ? new Date().toISOString() : null, doneBy: b.done ? req.user.name : null };
    const started = b.done && ['PLANNED', 'OVERDUE'].includes(m.status);
    res.json(await prisma.maintenancePlan.update({ where: { id: m.id }, data: { checklist: list, ...(started ? { status: 'IN_PROGRESS', startDate: m.startDate ?? new Date() } : {}) } }));
  }),
);

/** Bakımı tamamla: tüm adımlar tamamlanır, gecikmiş bakım kapanır, müşteriye özet bildirimi gider */
maintenanceRouter.post(
  '/:id/complete',
  requirePerm('maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const b = z.object({ note: zOptStr, actualHours: zOptNum }).parse(req.body ?? {});
    const m = await loadForWork(req.user, req.params.id);
    if (m.status === 'COMPLETED') throw badRequest('Bakım zaten tamamlandı');
    const now = new Date();
    const list = steps(m.checklist).map((x) => (x.done ? x : { ...x, done: true, doneAt: now.toISOString(), doneBy: req.user.name }));
    const done = await prisma.$transaction(async (tx) => {
      const u = await tx.maintenancePlan.update({
        where: { id: m.id },
        data: { status: 'COMPLETED', checklist: list.length ? list : undefined, completedAt: now, completedById: req.user.id, completedBy: req.user.name, completionNote: b.note ?? m.completionNote, actualHours: b.actualHours ?? m.actualHours ?? undefined },
      });
      // Gün aralığı / motor saati tekrarı: sonraki bakım planlanır (haftalık / aylık seriler zaten önceden oluşturulur)
      await scheduleNextRecurrence(tx, m, now);
      return u;
    });
    const vessel = await prisma.vessel.findUnique({ where: { id: m.vesselId }, select: { name: true } });
    await notify(await vesselClientUserIds(m.vesselId), {
      type: 'SERVICE_COMPLETED',
      title: `Bakım tamamlandı: ${m.title}`,
      body: `${vessel?.name ?? ''} · ${list.length ? `${list.length} adım tamamlandı` : 'Bakım yapıldı'}${b.note ? ` · ${b.note}` : ''}`,
      link: `/maintenance/${m.id}`,
      entityType: 'MaintenancePlan',
      entityId: m.id,
      dedupeKey: `maint-done-${m.id}`,
    });
    res.json(done);
  }),
);

/** Tamamlanmış bakımı yeniden aç (yönetici) */
maintenanceRouter.post(
  '/:id/reopen',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const m = await prisma.maintenancePlan.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(await prisma.maintenancePlan.update({ where: { id: m.id }, data: { status: m.plannedDate < new Date() ? 'OVERDUE' : 'PLANNED', completedAt: null, completedBy: null, completedById: null } }));
  }),
);

/** Yorum: personel (dahili veya müşteriye açık) ve müşteri */
maintenanceRouter.post(
  '/:id/comments',
  requirePerm('maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const b = z.object({ body: z.string().trim().min(1), internal: z.boolean().optional() }).parse(req.body);
    const m = await prisma.maintenancePlan.findFirst({ where: { id: req.params.id, ...vesselFilter(req.user) } });
    if (!m) throw notFound('Bakım');
    const c = await prisma.maintenanceComment.create({ data: { planId: m.id, userId: req.user.id, userName: req.user.name, body: b.body, internal: req.user.isStaff ? (b.internal ?? false) : false } });
    const targets = req.user.isStaff ? (c.internal ? [] : await vesselClientUserIds(m.vesselId)) : [...(await managerIds()), m.technicianId, ...m.helperIds];
    await notify(targets, { type: 'NEW_COMMENT', fromClient: !req.user.isStaff, title: `${req.user.name} yorum yaptı · ${m.title}`, body: b.body.slice(0, 140), link: `/maintenance/${m.id}`, entityType: 'MaintenancePlan', entityId: m.id }, req.user.id);
    res.status(201).json(c);
  }),
);

/** Bakım paketi şablonları: adımlı bakımların son hali (ör. Silver Care) — formda "Paketten doldur" */
export async function packages() {
  const rows = await prisma.maintenancePlan.findMany({ where: { checklist: { not: Prisma.DbNull } }, orderBy: { updatedAt: 'desc' }, select: { title: true, category: true, subType: true, description: true, checklist: true, estimatedHours: true, repeatWeekdays: true, repeatMonthDay: true }, take: 500 });
  const seen = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!seen.has(r.title) && steps(r.checklist).length) seen.set(r.title, r);
  return [...seen.values()].map((r) => ({ ...r, checklist: steps(r.checklist).map((x) => x.label) }));
}
