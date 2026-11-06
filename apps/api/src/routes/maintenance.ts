import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { MAINTENANCE_CATEGORY_KEYS, MAINTENANCE_STATUSES, PRIORITIES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { assertVesselAccess, isTechOnly, requirePerm, vesselFilter, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptDate, zOptNum, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { notify } from '../services/notify';

export const maintenanceRouter = Router();

const schema = z.object({
  title: z.string().trim().min(2),
  category: z.enum(MAINTENANCE_CATEGORY_KEYS as [string, ...string[]]),
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
});

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
      })
      .parse(req.query);
    const where: Prisma.MaintenancePlanWhereInput = {
      ...vesselFilter(req.user),
      ...(isTechOnly(req.user) ? { technicianId: req.user.id } : {}),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.category ? { category: q.category as any } : {}),
      ...(q.status ? { status: { in: q.status.split(',') as any } } : {}),
      ...(q.technicianId ? { technicianId: q.technicianId } : {}),
      ...(q.upcoming ? { status: { in: ['PLANNED', 'OVERDUE'] } } : {}),
      ...(q.from || q.to ? { plannedDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
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
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

maintenanceRouter.get(
  '/:id',
  requirePerm('maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const m = await prisma.maintenancePlan.findFirst({
      where: { id: req.params.id, ...vesselFilter(req.user) },
      include: {
        vessel: { select: { id: true, name: true } },
        technician: { select: { id: true, name: true } },
        engine: true,
        workOrder: { select: { id: true, number: true, status: true } },
      },
    });
    if (!m) throw notFound('Bakım');
    res.json(m);
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
    const m = await prisma.maintenancePlan.create({ data: clean(body) });
    if (m.technicianId) {
      await notify([m.technicianId], {
        type: 'TASK_ASSIGNED',
        title: 'Yeni bakım planı atandı',
        body: m.title,
        link: `/maintenance?id=${m.id}`,
        entityType: 'MaintenancePlan',
        entityId: m.id,
        dedupeKey: `maint-assign-${m.id}-${m.technicianId}`,
      });
    }
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
    // Tarih ileri alınırsa gecikmiş durumu kaldır
    if (existing.status === 'OVERDUE' && body.plannedDate && body.plannedDate > new Date() && !body.status) data.status = 'PLANNED';
    res.json(await prisma.maintenancePlan.update({ where: { id: existing.id }, data }));
  }),
);

maintenanceRouter.delete(
  '/:id',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    await prisma.maintenancePlan.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

/** Bakım planından iş emri oluştur */
maintenanceRouter.post(
  '/:id/work-order',
  requirePerm('workorders.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const plan = await prisma.maintenancePlan.findUnique({ where: { id: req.params.id } });
    if (!plan) throw notFound('Bakım');
    assertVesselAccess(req.user, plan.vesselId);
    if (plan.workOrderId) throw badRequest('Bu bakım için zaten iş emri mevcut');
    const wo = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('WO', tx);
      const status = plan.technicianId ? 'ASSIGNED' : 'PLANNED';
      const created = await tx.workOrder.create({
        data: {
          number,
          vesselId: plan.vesselId,
          title: plan.title,
          description: plan.description,
          category: plan.category,
          priority: plan.priority,
          technicianId: plan.technicianId,
          plannedStart: plan.startDate ?? plan.plannedDate,
          plannedEnd: plan.endDate,
          plannedHours: plan.estimatedHours,
          requestedById: req.user.id,
          status,
          checklist: plan.subType ? [{ label: plan.subType, done: false }] : undefined,
        },
      });
      await tx.workOrderHistory.create({ data: { workOrderId: created.id, userId: req.user.id, toStatus: status, note: 'Bakım planından oluşturuldu' } });
      await tx.maintenancePlan.update({ where: { id: plan.id }, data: { workOrderId: created.id, status: plan.status === 'OVERDUE' ? 'OVERDUE' : 'IN_PROGRESS' } });
      return created;
    });
    if (wo.technicianId) {
      await notify([wo.technicianId], {
        type: 'TASK_ASSIGNED',
        title: `Size yeni görev atandı: ${wo.number}`,
        body: wo.title,
        link: `/work-orders/${wo.id}`,
        entityType: 'WorkOrder',
        entityId: wo.id,
        dedupeKey: `wo-assign-${wo.id}-${wo.technicianId}`,
      });
    }
    res.status(201).json(wo);
  }),
);
