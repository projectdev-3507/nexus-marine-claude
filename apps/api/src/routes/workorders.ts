import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { MAINTENANCE_CATEGORY_KEYS, OPEN_WORK_ORDER_STATUSES, PRIORITIES, WORK_ORDER_STATUSES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { assertVesselAccess, can, isTechOnly, requirePerm, vesselFilter, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptDate, zOptNum, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { managerIds, notify } from '../services/notify';
import { sanitizeWorkOrderForClient, transitionWorkOrder } from '../services/workorders';
import { attachmentsFor } from './files';

export const workOrdersRouter = Router();

const checklistItem = z.object({ label: z.string().min(1), done: z.boolean().default(false) });

const createSchema = z.object({
  vesselId: z.string(),
  title: z.string().trim().min(2),
  description: zOptStr,
  category: z.enum(MAINTENANCE_CATEGORY_KEYS as [string, ...string[]]).optional().nullable(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  technicianId: zOptStr,
  plannedStart: zOptDate,
  plannedEnd: zOptDate,
  plannedHours: zOptNum,
  checklist: z.array(checklistItem).optional(),
  projectId: zOptStr,
});

export function workOrderScope(user: AuthUser): Prisma.WorkOrderWhereInput {
  return {
    ...vesselFilter(user),
    ...(isTechOnly(user) ? { technicianId: user.id } : {}),
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
        q.technicianId ? { technicianId: q.technicianId } : {},
        q.mine === 'true' ? { technicianId: req.user.id } : {},
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
    res.json({
      items: req.user.isStaff ? items : items.map(sanitizeWorkOrderForClient),
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
        faults: { select: { id: true, title: true, status: true, severity: true } },
        maintenancePlan: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
        reports: { select: { id: true, number: true, title: true, status: true } },
      },
    });
    const attachments = await attachmentsFor(req.user, 'WORK_ORDER', wo.id);
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
    const wo = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('WO', tx);
      const created = await tx.workOrder.create({
        data: {
          number,
          vesselId: body.vesselId,
          title: body.title,
          description: body.description,
          category: (body.category as any) ?? undefined,
          priority: body.priority,
          requestedById: req.user.id,
          ...(isManagerCreate
            ? {
                technicianId: body.technicianId ?? undefined,
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
      },
      req.user.id,
    );
    if (wo.technicianId) await notifyAssignment(wo.id, wo.number, wo.title, wo.technicianId);
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
        },
      });
      return res.json(updated);
    }
    // Teknisyen: yalnızca kendi işinde kontrol listesi ve gerçekleşen süre
    if (wo.technicianId !== req.user.id) throw forbidden();
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
    const { technicianId, plannedStart, plannedEnd } = z
      .object({ technicianId: z.string(), plannedStart: zOptDate, plannedEnd: zOptDate })
      .parse(req.body);
    const tech = await prisma.user.findFirst({ where: { id: technicianId, isActive: true, roles: { has: 'TECHNICIAN' } } });
    if (!tech) throw badRequest('Geçerli bir teknisyen seçin');
    let wo = await loadAccessible(req.user, req.params.id);
    wo = await prisma.workOrder.update({
      where: { id: wo.id },
      data: { technicianId, plannedStart: plannedStart ?? undefined, plannedEnd: plannedEnd ?? undefined },
    });
    if (['REQUESTED', 'EVALUATION'].includes(wo.status)) wo = await transitionWorkOrder(req.user, wo, 'PLANNED', { note: 'Planlandı' });
    if (wo.status === 'PLANNED') wo = await transitionWorkOrder(req.user, wo, 'ASSIGNED', { note: `${tech.name} atandı` });
    await notifyAssignment(wo.id, wo.number, wo.title, technicianId);
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
    const updated = await transitionWorkOrder(req.user, wo, status, {
      note: note ?? undefined,
      customerSummary: customerSummary ?? undefined,
    });
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
    if (!req.user.isStaff) {
      await notify(await managerIds(), {
        type: 'CUSTOMER_REQUEST',
        title: `Müşteri mesajı: ${wo.number}`,
        body: body || 'Müşteri dosya ekledi',
        link: `/work-orders/${wo.id}`,
        entityType: 'WorkOrder',
        entityId: wo.id,
      });
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
    if (!can(req.user, 'workorders.manage') && wo.technicianId !== req.user.id) throw forbidden();
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

export function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Pazartesi = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}
