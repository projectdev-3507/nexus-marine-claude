import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, notFound, forbidden } from '../lib/errors';
import { assertVesselAccess, can, requirePerm, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptNum, zOptStr } from '../lib/validate';
import { audit } from '../lib/audit';

export const vesselsRouter = Router();

const engineSchema = z.object({
  id: z.string().optional(),
  position: z.string().min(1),
  make: zOptStr,
  model: zOptStr,
  serialNumber: zOptStr,
  hours: z.coerce.number().min(0).default(0),
});

const vesselSchema = z.object({
  name: z.string().trim().min(1),
  type: zOptStr,
  make: zOptStr,
  model: zOptStr,
  year: zOptNum,
  lengthM: zOptNum,
  flag: zOptStr,
  marina: zOptStr,
  berth: zOptStr,
  ownerId: zOptStr,
  contactPhone: zOptStr,
  contactEmail: zOptStr,
  generatorInfo: z.any().optional(),
  batteryInfo: z.any().optional(),
  equipment: z.any().optional(),
  notes: zOptStr,
  isActive: z.boolean().optional(),
  engines: z.array(engineSchema).optional(),
  captainIds: z.array(z.string()).optional(),
});

function scopeWhere(req: AuthedRequest): Prisma.VesselWhereInput {
  return req.user.vesselIds === null ? {} : { id: { in: req.user.vesselIds } };
}

vesselsRouter.get(
  '/',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery
      .extend({ marina: z.string().optional(), type: z.string().optional(), active: z.enum(['true', 'false']).optional() })
      .parse(req.query);
    const where: Prisma.VesselWhereInput = {
      ...scopeWhere(req),
      ...(q.marina ? { marina: q.marina } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.active ? { isActive: q.active === 'true' } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { make: { contains: q.q, mode: 'insensitive' } },
              { model: { contains: q.q, mode: 'insensitive' } },
              { marina: { contains: q.q, mode: 'insensitive' } },
              { owner: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.vessel.findMany({
        where,
        ...paginate(q),
        orderBy: sortBy(q.sort, q.sort ? q.order : 'asc', ['name', 'year', 'lengthM', 'marina', 'createdAt'], 'name'),
        include: {
          owner: { select: { id: true, name: true } },
          members: { where: { relation: 'CAPTAIN' }, include: { user: { select: { id: true, name: true, phone: true } } } },
          engines: { select: { id: true, position: true, hours: true } },
          _count: {
            select: {
              workOrders: { where: { status: { notIn: ['CLOSED', 'CANCELLED', 'PUBLISHED', 'COMPLETED'] } } },
              faults: { where: { status: { not: 'RESOLVED' } } },
            },
          },
        },
      }),
      prisma.vessel.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

vesselsRouter.get(
  '/marinas',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    const rows = await prisma.vessel.findMany({
      where: { ...scopeWhere(req), marina: { not: null } },
      distinct: ['marina'],
      select: { marina: true },
      orderBy: { marina: 'asc' },
    });
    res.json(rows.map((r) => r.marina));
  }),
);

vesselsRouter.get(
  '/:id',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    assertVesselAccess(req.user, req.params.id);
    const v = await prisma.vessel.findUnique({
      where: { id: req.params.id },
      include: {
        owner: true,
        engines: { orderBy: { position: 'asc' } },
        members: { include: { user: { select: { id: true, name: true, email: true, phone: true, roles: true } } } },
      },
    });
    if (!v) throw notFound('Tekne');
    const [openWorkOrders, openFaults, nextMaintenance, activeProject] = await Promise.all([
      prisma.workOrder.count({
        where: { vesselId: v.id, status: { notIn: ['CLOSED', 'CANCELLED', 'PUBLISHED', 'COMPLETED'] } },
      }),
      prisma.fault.count({ where: { vesselId: v.id, status: { not: 'RESOLVED' } } }),
      prisma.maintenancePlan.findFirst({
        where: { vesselId: v.id, status: { in: ['PLANNED', 'OVERDUE'] } },
        orderBy: { plannedDate: 'asc' },
        select: { id: true, title: true, plannedDate: true, status: true },
      }),
      prisma.project.findFirst({
        where: { vesselId: v.id, status: { in: ['ACTIVE', 'PLANNING'] } },
        select: { id: true, name: true, status: true },
      }),
    ]);
    // Müşteri tarafı: dahili not ve iletişim dışı alanları gizle
    const data = req.user.isStaff ? v : { ...v, notes: undefined, owner: v.owner ? { id: v.owner.id, name: v.owner.name } : null };
    res.json({ ...data, summary: { openWorkOrders, openFaults, nextMaintenance, activeProject } });
  }),
);

/** Servis geçmişi — teknenin tüm operasyonları tek zaman çizelgesinde */
vesselsRouter.get(
  '/:id/timeline',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    assertVesselAccess(req.user, req.params.id);
    const vesselId = req.params.id;
    const client = !req.user.isStaff;
    const [wos, maints, inspections, faults, reports, projects] = await Promise.all([
      prisma.workOrder.findMany({
        where: { vesselId, ...(client ? { status: { in: ['PUBLISHED', 'CLOSED'] } } : {}) },
        select: { id: true, number: true, title: true, status: true, createdAt: true, finishedAt: true, publishedAt: true, customerSummary: true },
      }),
      prisma.maintenancePlan.findMany({
        where: { vesselId, status: 'COMPLETED' },
        select: { id: true, title: true, category: true, endDate: true, plannedDate: true },
      }),
      prisma.inspection.findMany({
        where: { vesselId, ...(client ? { status: 'APPROVED' } : {}) },
        select: { id: true, number: true, date: true, status: true, _count: { select: { items: { where: { result: 'FAULT' } } } } },
      }),
      client
        ? Promise.resolve([])
        : prisma.fault.findMany({ where: { vesselId }, select: { id: true, title: true, severity: true, status: true, createdAt: true, source: true } }),
      prisma.report.findMany({
        where: { vesselId, ...(client ? { status: 'PUBLISHED', customerVisible: true } : {}) },
        select: { id: true, number: true, title: true, type: true, status: true, createdAt: true },
      }),
      prisma.project.findMany({ where: { vesselId }, select: { id: true, name: true, status: true, startDate: true, endDate: true } }),
    ]);
    const events = [
      ...wos.map((w) => ({ kind: 'WORK_ORDER', id: w.id, date: w.finishedAt ?? w.publishedAt ?? w.createdAt, title: `${w.number} · ${w.title}`, status: w.status, summary: w.customerSummary })),
      ...maints.map((m) => ({ kind: 'MAINTENANCE', id: m.id, date: m.endDate ?? m.plannedDate, title: m.title, status: 'COMPLETED', category: m.category })),
      ...inspections.map((i) => ({ kind: 'INSPECTION', id: i.id, date: i.date, title: `Teknik denetim ${i.number}`, status: i.status, faults: i._count.items })),
      ...faults.map((f) => ({ kind: 'FAULT', id: f.id, date: f.createdAt, title: f.title, status: f.status, severity: f.severity })),
      ...reports.map((r) => ({ kind: 'REPORT', id: r.id, date: r.createdAt, title: `${r.number} · ${r.title}`, status: r.status })),
      ...projects.map((p) => ({ kind: 'PROJECT', id: p.id, date: p.startDate ?? new Date(0), title: p.name, status: p.status })),
    ].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    res.json(events);
  }),
);

/** Maliyetler — yalnızca finans yetkisi */
vesselsRouter.get(
  '/:id/costs',
  requirePerm('finance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const vesselId = req.params.id;
    const [materials, quotes, projects] = await Promise.all([
      prisma.materialUsage.findMany({
        where: { OR: [{ workOrder: { vesselId } }, { project: { vesselId } }] },
        include: { material: { select: { name: true, unit: true } }, workOrder: { select: { number: true } } },
        orderBy: { usedAt: 'desc' },
      }),
      prisma.quote.findMany({ where: { vesselId }, include: { items: true }, orderBy: { createdAt: 'desc' } }),
      prisma.project.findMany({ where: { vesselId }, include: { payments: true, changeRequests: true } }),
    ]);
    const materialCost = materials.reduce((s, m) => s + m.quantity * m.unitCost, 0);
    const quoteTotals = quotes.map((q) => {
      const sub = q.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      return { id: q.id, number: q.number, title: q.title, status: q.status, currency: q.currency, subtotal: sub, total: sub * (1 + q.vatRate / 100) };
    });
    const paid = projects.flatMap((p) => p.payments).reduce((s, p) => s + p.amount, 0);
    res.json({ materialCost, materials, quotes: quoteTotals, paid, projects: projects.map((p) => ({ id: p.id, name: p.name, budget: p.budget, currency: p.currency })) });
  }),
);

vesselsRouter.post(
  '/',
  requirePerm('vessels.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { engines, captainIds, ...data } = vesselSchema.parse(req.body);
    const v = await prisma.vessel.create({
      data: {
        ...data,
        year: data.year ?? undefined,
        lengthM: data.lengthM ?? undefined,
        engines: engines?.length ? { create: engines.map(({ id: _id, ...e }) => e) } : undefined,
        members: captainIds?.length ? { create: captainIds.map((userId) => ({ userId, relation: 'CAPTAIN' as const })) } : undefined,
      },
    });
    await audit(req.user.id, 'vessel.create', 'Vessel', v.id);
    res.status(201).json(v);
  }),
);

vesselsRouter.put(
  '/:id',
  requirePerm('vessels.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { engines, captainIds, ...data } = vesselSchema.partial().parse(req.body);
    const id = req.params.id;
    const v = await prisma.$transaction(async (tx) => {
      const updated = await tx.vessel.update({ where: { id }, data: { ...data, year: data.year ?? undefined, lengthM: data.lengthM ?? undefined } });
      if (engines) {
        const keep = engines.filter((e) => e.id).map((e) => e.id!);
        await tx.engine.deleteMany({ where: { vesselId: id, id: { notIn: keep } } });
        for (const { id: eid, ...e } of engines) {
          if (eid) await tx.engine.update({ where: { id: eid }, data: e });
          else await tx.engine.create({ data: { ...e, vesselId: id } });
        }
      }
      if (captainIds) {
        await tx.vesselMember.deleteMany({ where: { vesselId: id, relation: 'CAPTAIN' } });
        if (captainIds.length)
          await tx.vesselMember.createMany({ data: captainIds.map((userId) => ({ userId, vesselId: id, relation: 'CAPTAIN' as const })) });
      }
      return updated;
    });
    await audit(req.user.id, 'vessel.update', 'Vessel', id);
    res.json(v);
  }),
);

/** Motor çalışma saati güncelleme — teknisyen veya yönetici */
vesselsRouter.patch(
  '/:id/engines/:engineId/hours',
  requirePerm('vessels.manage', 'workorders.execute'),
  ah<AuthedRequest>(async (req, res) => {
    const { hours } = z.object({ hours: z.coerce.number().min(0) }).parse(req.body);
    const engine = await prisma.engine.findFirst({ where: { id: req.params.engineId, vesselId: req.params.id } });
    if (!engine) throw notFound('Motor');
    if (hours < engine.hours && !can(req.user, 'vessels.manage')) throw forbidden('Motor saati geriye alınamaz');
    const updated = await prisma.engine.update({ where: { id: engine.id }, data: { hours, hoursUpdatedAt: new Date() } });
    res.json(updated);
  }),
);

vesselsRouter.post(
  '/:id/members',
  requirePerm('vessels.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { userId, relation } = z
      .object({ userId: z.string(), relation: z.enum(['OWNER', 'CAPTAIN', 'CREW']) })
      .parse(req.body);
    const m = await prisma.vesselMember.upsert({
      where: { userId_vesselId_relation: { userId, vesselId: req.params.id, relation } },
      create: { userId, vesselId: req.params.id, relation },
      update: {},
    });
    res.status(201).json(m);
  }),
);

vesselsRouter.delete(
  '/:id/members/:memberId',
  requirePerm('vessels.manage'),
  ah<AuthedRequest>(async (req, res) => {
    await prisma.vesselMember.deleteMany({ where: { id: req.params.memberId, vesselId: req.params.id } });
    res.json({ ok: true });
  }),
);
