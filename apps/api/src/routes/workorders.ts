import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { OPEN_WORK_ORDER_STATUSES, PRIORITIES, WORK_ORDER_STATUSES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { assertVesselAccess, can, isTechOnly, requirePerm, vesselFilter, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptDate, zOptNum, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { managerIds, notify, vesselClientUserIds } from '../services/notify';
import { sanitizeWorkOrderForClient, transitionWorkOrder, isAssigned } from '../services/workorders';
import { attachmentsFor } from './files';

export const workOrdersRouter = Router();

const checklistItem = z.object({ label: z.string().min(1), done: z.boolean().default(false) });

const createSchema = z.object({
  vesselId: z.string(),
  title: z.string().trim().min(2),
  description: zOptStr,
  category: z.string().trim().min(1).optional().nullable(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  technicianId: zOptStr,
  /** Ek teknisyenler */
  helperIds: z.array(z.string()).optional(),
  plannedStart: zOptDate,
  plannedEnd: zOptDate,
  plannedHours: zOptNum,
  checklist: z.array(checklistItem).optional(),
  projectId: zOptStr,
  /** Bağlı bakım (paket) — opsiyonel */
  parentPlanId: zOptStr,
});

export function workOrderScope(user: AuthUser): Prisma.WorkOrderWhereInput {
  return {
    ...vesselFilter(user),
    ...(isTechOnly(user) ? { OR: [{ technicianId: user.id }, { helperIds: { has: user.id } }] } : {}),
  };
}

async function loadAccessible(user: AuthUser, id: string) {
  const wo = await prisma.workOrder.findFirst({ where: { id, ...workOrderScope(user) } });
  if (!wo) throw notFound('İş emri');
  return wo;
}

workOrdersRouter.get(
  '/',
  requirePerm('workorders.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery
      .extend({
        status: z.string().optional(), // virgülle ayrılmış
        group: z.enum(['open', 'review', 'done', 'week']).optional(),
        vesselId: z.string().optional(),
        technicianId: z.string().optional(),
        priority: z.enum(PRIORITIES).optional(),
        category: z.string().optional(),
        projectId: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        mine: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    const statuses = q.status?.split(',').filter((s) => (WORK_ORDER_STATUSES as readonly string[]).includes(s));
    const now = new Date();
    const groupFilter: Prisma.WorkOrderWhereInput =
      q.group === 'open'
        ? { status: { in: OPEN_WORK_ORDER_STATUSES } }
        : q.group === 'review'
          ? { status: 'TECHNICAL_REVIEW' }
          : q.group === 'done'
            ? { status: { in: ['COMPLETED', 'PUBLISHED', 'CLOSED'] } }
            : q.group === 'week'
              ? { plannedStart: { gte: startOfWeek(now), lt: new Date(startOfWeek(now).getTime() + 7 * 864e5) } }
              : {};
    const where: Prisma.WorkOrderWhereInput = {
      AND: [
        workOrderScope(req.user),
        groupFilter,
        statuses?.length ? { status: { in: statuses as any } } : {},
        q.vesselId ? { vesselId: q.vesselId } : {},
        q.technicianId ? { OR: [{ technicianId: q.technicianId }, { helperIds: { has: q.technicianId } }] } : {},
        q.mine === 'true' ? { OR: [{ technicianId: req.user.id }, { helperIds: { has: req.user.id } }] } : {},
        q.priority ? { priority: q.priority } : {},
        q.category ? { category: q.category as any } : {},
        q.projectId ? { projectId: q.projectId } : {},
        q.from || q.to ? { plannedStart: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {},
        q.q
          ? {
              OR: [
                { number: { contains: q.q, mode: 'insensitive' } },
                { title: { contains: q.q, mode: 'insensitive' } },
                { vessel: { name: { contains: q.q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        ...paginate(q),
        orderBy: sortBy(q.sort, q.order, ['createdAt', 'plannedStart', 'priority', 'status', 'number'], 'createdAt'),
        include: {
          vessel: { select: { id: true, name: true, marina: true } },
          technician: { select: { id: true, name: true } },
        },
      }),
      prisma.workOrder.count({ where }),
    ]);
    const named = await withHelpers(items);
    res.json({
      items: req.user.isStaff ? named : named.map(sanitizeWorkOrderForClient),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  }),
);

workOrdersRouter.get(
  '/:id',
  requirePerm('workorders.view'),
  ah<AuthedRequest>(async (req, res) => {
    await loadAccessible(req.user, req.params.id);
    const wo = await prisma.workOrder.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        vessel: { select: { id: true, name: true, marina: true, berth: true } },
        technician: { select: { id: true, name: true, phone: true } },
        requestedBy: { select: { id: true, name: true } },
        history: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } },
        comments: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } },
        materials: { include: { material: { select: { id: true, name: true, unit: true } } } },
        faults: { select: { id: true, title: true, status: true, severity: true, source: true, description: true, createdAt: true } },
        maintenancePlan: { select: { id: true, title: true } },
        parentPlan: { select: { id: true, title: true, plannedDate: true, status: true } },
        project: { select: { id: true, name: true } },
        reports: { select: { id: true, number: true, title: true, status: true } },
      },
    });
    // Arızadan açılan işte müşterinin / denetimin arıza fotoğrafları da görünür
    const attachments = [...(await attachmentsFor(req.user, 'FAULT', wo.faults.map((f) => f.id))).map((a) => ({ ...a, fromFault: true, caption: a.caption ?? 'Arıza bildirimi' })), ...(await attachmentsFor(req.user, 'WORK_ORDER', wo.id))];
    const [withH] = await withHelpers([wo]);
    (wo as any).helpers = withH.helpers;
    const commentFiles = await attachmentsFor(req.user, 'COMMENT', wo.comments.map((c) => c.id));
    if (req.user.isStaff) {
      const showCost = can(req.user, 'finance.view');
      return res.json({
        ...wo,
        materials: wo.materials.map((m) => (showCost ? m : { ...m, unitCost: undefined })),
        attachments,
        commentFiles,
      });
    }
    res.json({ ...sanitizeWorkOrderForClient(wo), attachments, commentFiles });
  }),
);

workOrdersRouter.post(
  '/',
  requirePerm('workorders.manage', 'workorders.request'),
  ah<AuthedRequest>(async (req, res) => {
    const body = createSchema.parse(req.body);
    assertVesselAccess(req.user, body.vesselId);
    const isManagerCreate = can(req.user, 'workorders.manage');
    // Bakıma bağlı ek iş: tekne aynı olmalı, kategori bakımdan gelir
    const parent = body.parentPlanId ? await prisma.maintenancePlan.findUnique({ where: { id: body.parentPlanId }, select: { id: true, vesselId: true, category: true } }) : null;
    if (body.parentPlanId && (!parent || parent.vesselId !== body.vesselId)) throw badRequest('Seçilen bakım bu tekneye ait değil');
    const wo = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('WO', tx);
      const created = await tx.workOrder.create({
        data: {
          number,
          vesselId: body.vesselId,
          title: body.title,
          description: body.description,
          category: (body.category as any) ?? parent?.category ?? undefined,
          parentPlanId: isManagerCreate ? parent?.id ?? undefined : undefined,
          priority: body.priority,
          requestedById: req.user.id,
          ...(isManagerCreate
            ? {
                technicianId: body.technicianId ?? undefined,
                helperIds: body.helperIds ?? [],
                plannedStart: body.plannedStart ?? undefined,
                plannedEnd: body.plannedEnd ?? undefined,
                plannedHours: body.plannedHours ?? undefined,
                checklist: body.checklist,
                projectId: body.projectId ?? undefined,
                status: body.technicianId ? 'ASSIGNED' : body.plannedStart ? 'PLANNED' : 'REQUESTED',
              }
            : { status: 'REQUESTED' }),
        },
      });
      await tx.workOrderHistory.create({
        data: { workOrderId: created.id, userId: req.user.id, toStatus: created.status, note: 'İş emri oluşturuldu' },
      });
      return created;
    });
    const link = `/work-orders/${wo.id}`;
    await notify(
      await managerIds(),
      {
        type: isManagerCreate ? 'WORK_ORDER_CREATED' : 'CUSTOMER_REQUEST',
        title: isManagerCreate ? `Yeni iş emri: ${wo.number}` : `Yeni müşteri talebi: ${wo.title}`,
        body: wo.title,
        link,
        entityType: 'WorkOrder',
        entityId: wo.id,
        dedupeKey: `wo-created-${wo.id}`,
        fromClient: !req.user.isStaff,
      },
      req.user.id,
    );
    for (const uid of [wo.technicianId, ...wo.helperIds].filter(Boolean) as string[]) await notifyAssignment(wo.id, wo.number, wo.title, uid);
    res.status(201).json(wo);
  }),
);

async function notifyAssignment(id: string, number: string, title: string, technicianId: string) {
  await notify([technicianId], {
    type: 'TASK_ASSIGNED',
    title: `Size yeni görev atandı: ${number}`,
    body: title,
    link: `/work-orders/${id}`,
    entityType: 'WorkOrder',
    entityId: id,
    dedupeKey: `wo-assign-${id}-${technicianId}`,
  });
}

workOrdersRouter.put(
  '/:id',
  requirePerm('workorders.manage', 'workorders.execute'),
  ah<AuthedRequest>(async (req, res) => {
    const wo = await loadAccessible(req.user, req.params.id);
    if (can(req.user, 'workorders.manage')) {
      const body = createSchema.partial().extend({ actualHours: zOptNum, customerSummary: zOptStr }).parse(req.body);
      const { vesselId: _v, technicianId: _t, ...rest } = body;
      const updated = await prisma.workOrder.update({
        where: { id: wo.id },
        data: {
          ...rest,
          category: (rest.category as any) ?? undefined,
          plannedStart: rest.plannedStart ?? undefined,
          plannedEnd: rest.plannedEnd ?? undefined,
          plannedHours: rest.plannedHours ?? undefined,
          actualHours: rest.actualHours ?? undefined,
          projectId: rest.projectId ?? undefined,
          parentPlanId: rest.parentPlanId !== undefined ? rest.parentPlanId : undefined,
          ...(rest.parentPlanId ? { category: (await prisma.maintenancePlan.findUnique({ where: { id: rest.parentPlanId }, select: { category: true } }))?.category } : {}),
        },
      });
      for (const uid of (rest.helperIds ?? []).filter((h) => !wo.helperIds.includes(h))) await notifyAssignment(wo.id, wo.number, wo.title, uid);
      return res.json(updated);
    }
    // Teknisyen: yalnızca kendi işinde kontrol listesi ve gerçekleşen süre
    if (!isAssigned(wo, req.user.id)) throw forbidden();
    if (['COMPLETED', 'PUBLISHED', 'CLOSED', 'CANCELLED'].includes(wo.status)) throw badRequest('Kapanmış iş güncellenemez');
    const body = z.object({ checklist: z.array(checklistItem).optional(), actualHours: zOptNum }).parse(req.body);
    const updated = await prisma.workOrder.update({
      where: { id: wo.id },
      data: { checklist: body.checklist, actualHours: body.actualHours ?? undefined },
    });
    res.json(updated);
  }),
);

workOrdersRouter.post(
  '/:id/assign',
  requirePerm('workorders.assign'),
  ah<AuthedRequest>(async (req, res) => {
    const { technicianId, plannedStart, plannedEnd, helperIds } = z
      .object({ technicianId: z.string(), plannedStart: zOptDate, plannedEnd: zOptDate, helperIds: z.array(z.string()).optional() })
      .parse(req.body);
    const tech = await prisma.user.findFirst({ where: { id: technicianId, isActive: true, roles: { has: 'TECHNICIAN' } } });
    if (!tech) throw badRequest('Geçerli bir teknisyen seçin');
    let wo = await loadAccessible(req.user, req.params.id);
    wo = await prisma.workOrder.update({
      where: { id: wo.id },
      data: { technicianId, plannedStart: plannedStart ?? undefined, plannedEnd: plannedEnd ?? undefined, ...(helperIds ? { helperIds: helperIds.filter((h) => h !== technicianId) } : {}) },
    });
    if (['REQUESTED', 'EVALUATION'].includes(wo.status)) wo = await transitionWorkOrder(req.user, wo, 'PLANNED', { note: 'Planlandı' });
    if (wo.status === 'PLANNED') wo = await transitionWorkOrder(req.user, wo, 'ASSIGNED', { note: `${tech.name} atandı` });
    for (const uid of [technicianId, ...wo.helperIds]) await notifyAssignment(wo.id, wo.number, wo.title, uid);
    res.json(wo);
  }),
);

workOrdersRouter.post(
  '/:id/status',
  requirePerm('workorders.manage', 'workorders.execute', 'workorders.review'),
  ah<AuthedRequest>(async (req, res) => {
    const { status, note, customerSummary } = z
      .object({ status: z.enum(WORK_ORDER_STATUSES), note: zOptStr, customerSummary: zOptStr })
      .parse(req.body);
    const wo = await loadAccessible(req.user, req.params.id);
    let updated = await transitionWorkOrder(req.user, wo, status, {
      note: note ?? undefined,
      customerSummary: customerSummary ?? undefined,
    });
    // Teknisyen zaten atanmışsa "Planla" doğrudan "Teknisyen atandı"ya geçer (tekrar atama istenmez)
    if (status === 'PLANNED' && wo.status !== 'ASSIGNED' && updated.technicianId) {
      updated = await transitionWorkOrder(req.user, updated, 'ASSIGNED', { note: 'Teknisyen atandı' });
    }
    res.json(updated);
  }),
);

workOrdersRouter.post(
  '/:id/comments',
  requirePerm('workorders.view'),
  ah<AuthedRequest>(async (req, res) => {
    const wo = await loadAccessible(req.user, req.params.id);
    // Metin boş olabilir: yalnızca fotoğraf / video / belge içeren yorumlar (ekler ayrıca COMMENT olarak yüklenir)
    const { body, internal, withFiles } = z.object({ body: z.string().trim().default(''), internal: z.boolean().optional(), withFiles: z.boolean().optional() }).parse(req.body);
    if (!body && !withFiles) throw badRequest('Yorum boş olamaz');
    const c = await prisma.workOrderComment.create({
      data: { workOrderId: wo.id, userId: req.user.id, body, internal: req.user.isStaff ? (internal ?? true) : false },
      include: { user: { select: { id: true, name: true } } },
    });
    // Yorum bildirimi: personel (yöneticiler + atanan teknisyen) her zaman; müşteri tarafı yalnızca dahili olmayan yorumlarda.
    // Yorumu yazan kişi kendi bildirimini almaz.
    const staffTargets = [...(await managerIds()), wo.technicianId, ...wo.helperIds].filter(Boolean) as string[];
    const clientTargets = c.internal ? [] : await vesselClientUserIds(wo.vesselId);
    const preview = body ? (body.length > 140 ? body.slice(0, 140) + '…' : body) : '📎 Fotoğraf / video / belge ekledi';
    const base = { type: 'NEW_COMMENT' as const, fromClient: !req.user.isStaff, title: `${req.user.name} yorum yaptı · ${wo.number}`, body: `${wo.title}: ${preview}`, entityType: 'WorkOrder', entityId: wo.id };
    await notify(staffTargets, { ...base, link: `/work-orders/${wo.id}` }, req.user.id);
    // Arızadan açılan işte müşteri takibi arıza sayfasından yapar
    if (clientTargets.length) {
      const fault = await prisma.fault.findFirst({ where: { workOrderId: wo.id }, select: { id: true, title: true } });
      await notify(clientTargets, { ...base, ...(fault ? { title: `${req.user.name} yorum yaptı · ${fault.title}`, link: `/faults/${fault.id}` } : { link: `/work-orders/${wo.id}` }) }, req.user.id);
    }
    res.status(201).json(c);
  }),
);

/** Malzeme kullanımı — stoktan düşer */
workOrdersRouter.post(
  '/:id/materials',
  requirePerm('workorders.manage', 'workorders.execute'),
  ah<AuthedRequest>(async (req, res) => {
    const wo = await loadAccessible(req.user, req.params.id);
    if (!can(req.user, 'workorders.manage') && !isAssigned(wo, req.user.id)) throw forbidden();
    const { materialId, quantity } = z.object({ materialId: z.string(), quantity: z.coerce.number().positive() }).parse(req.body);
    const usage = await prisma.$transaction(async (tx) => {
      const m = await tx.material.findUniqueOrThrow({ where: { id: materialId } });
      await tx.material.update({ where: { id: m.id }, data: { stock: { decrement: quantity } } });
      return tx.materialUsage.create({
        data: { materialId, workOrderId: wo.id, quantity, unitCost: m.unitCost, userId: req.user.id },
        include: { material: { select: { id: true, name: true, unit: true } } },
      });
    });
    res.status(201).json(usage);
  }),
);

workOrdersRouter.delete(
  '/:id/materials/:usageId',
  requirePerm('workorders.manage'),
  ah<AuthedRequest>(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const u = await tx.materialUsage.findFirstOrThrow({ where: { id: req.params.usageId, workOrderId: req.params.id } });
      await tx.material.update({ where: { id: u.materialId }, data: { stock: { increment: u.quantity } } });
      await tx.materialUsage.delete({ where: { id: u.id } });
    });
    res.json({ ok: true });
  }),
);

/** Ek teknisyenlerin adları */
async function withHelpers<T extends { helperIds: string[] }>(rows: T[]) {
  const ids = [...new Set(rows.flatMap((r) => r.helperIds))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return rows.map((r) => ({ ...r, helpers: r.helperIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as { id: string; name: string }[] }));
}

export function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Pazartesi = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
