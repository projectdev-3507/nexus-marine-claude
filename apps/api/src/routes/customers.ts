import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { OPEN_WORK_ORDER_STATUSES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, notFound } from '../lib/errors';
import { can, requirePerm, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptStr } from '../lib/validate';

export const customersRouter = Router();

const schema = z.object({
  name: z.string().trim().min(2),
  company: zOptStr,
  email: z.string().email().optional().nullable().or(z.literal('').transform(() => null)),
  phone: zOptStr,
  address: zOptStr,
  taxNumber: zOptStr,
  status: z.enum(['ACTIVE', 'PENDING', 'INACTIVE']).optional(),
});

customersRouter.get(
  '/',
  requirePerm('customers.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ status: z.string().optional(), marina: z.string().optional() }).parse(req.query);
    const where: Prisma.CustomerWhereInput = {
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.marina ? { vessels: { some: { marina: q.marina } } } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { company: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
              { vessels: { some: { name: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        ...paginate(q),
        orderBy: sortBy(q.sort, q.sort ? q.order : 'asc', ['name', 'createdAt', 'status'], 'name'),
        include: { vessels: { select: { id: true, name: true, marina: true } } },
      }),
      prisma.customer.count({ where }),
    ]);
    const vesselIds = rows.flatMap((r) => r.vessels.map((v) => v.id));
    const [lastServices, nextMaint] = await Promise.all([
      prisma.workOrder.groupBy({ by: ['vesselId'], where: { vesselId: { in: vesselIds }, finishedAt: { not: null } }, _max: { finishedAt: true } }),
      prisma.maintenancePlan.groupBy({ by: ['vesselId'], where: { vesselId: { in: vesselIds }, status: { in: ['PLANNED', 'OVERDUE'] } }, _min: { plannedDate: true } }),
    ]);
    const items = rows.map((c) => {
      const ids = c.vessels.map((v) => v.id);
      const last = lastServices.filter((l) => ids.includes(l.vesselId)).map((l) => l._max.finishedAt!).sort((a, b) => +b - +a)[0] ?? null;
      const next = nextMaint.filter((l) => ids.includes(l.vesselId)).map((l) => l._min.plannedDate!).sort((a, b) => +a - +b)[0] ?? null;
      return { ...c, lastServiceAt: last, nextMaintenanceAt: next };
    });
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

customersRouter.get(
  '/:id',
  requirePerm('customers.view'),
  ah<AuthedRequest>(async (req, res) => {
    const c = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        vessels: { include: { engines: { select: { position: true, hours: true } } } },
        users: { select: { id: true, name: true, email: true, phone: true, roles: true, isActive: true } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!c) throw notFound('Müşteri');
    const vesselIds = c.vessels.map((v) => v.id);
    const finance = can(req.user, 'finance.view');
    const [history, openWork, upcoming, quotes, payments] = await Promise.all([
      prisma.workOrder.findMany({ where: { vesselId: { in: vesselIds }, status: { in: ['COMPLETED', 'PUBLISHED', 'CLOSED'] } }, orderBy: { finishedAt: 'desc' }, take: 30, select: { id: true, number: true, title: true, status: true, finishedAt: true, vessel: { select: { name: true } } } }),
      prisma.workOrder.findMany({ where: { vesselId: { in: vesselIds }, status: { in: OPEN_WORK_ORDER_STATUSES } }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, title: true, status: true, priority: true, vessel: { select: { name: true } } } }),
      prisma.maintenancePlan.findMany({ where: { vesselId: { in: vesselIds }, status: { in: ['PLANNED', 'OVERDUE'] } }, orderBy: { plannedDate: 'asc' }, take: 20, select: { id: true, title: true, plannedDate: true, status: true, vessel: { select: { name: true } } } }),
      finance ? prisma.quote.findMany({ where: { customerId: c.id }, include: { items: true }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
      finance ? prisma.payment.findMany({ where: { customerId: c.id }, orderBy: { date: 'desc' } }) : Promise.resolve([]),
    ]);
    res.json({ ...c, history, openWork, upcoming, quotes, payments });
  }),
);

customersRouter.post(
  '/',
  requirePerm('customers.manage'),
  ah<AuthedRequest>(async (req, res) => {
    res.status(201).json(await prisma.customer.create({ data: schema.parse(req.body) as any }));
  }),
);

customersRouter.put(
  '/:id',
  requirePerm('customers.manage'),
  ah<AuthedRequest>(async (req, res) => {
    res.json(await prisma.customer.update({ where: { id: req.params.id }, data: schema.partial().parse(req.body) as any }));
  }),
);

customersRouter.post(
  '/:id/notes',
  requirePerm('customers.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { body } = z.object({ body: z.string().trim().min(1) }).parse(req.body);
    res.status(201).json(await prisma.customerNote.create({ data: { body, customerId: req.params.id, authorId: req.user.id }, include: { author: { select: { name: true } } } }));
  }),
);
