import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PRIORITIES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, notFound } from '../lib/errors';
import { assertVesselAccess, requirePerm, vesselFilter, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, zOptStr } from '../lib/validate';
import { createWorkOrderFromFault, notifyFault } from '../services/faults';

export const faultsRouter = Router();

faultsRouter.get(
  '/',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ vesselId: z.string().optional(), status: z.string().optional(), severity: z.string().optional() }).parse(req.query);
    const where: Prisma.FaultWhereInput = {
      ...vesselFilter(req.user),
      ...(req.user.isStaff ? {} : { reportedById: req.user.id }),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.status ? { status: { in: q.status.split(',') as any } } : {}),
      ...(q.severity ? { severity: { in: q.severity.split(',') as any } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.fault.findMany({
        where,
        ...paginate(q),
        orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
        include: {
          vessel: { select: { id: true, name: true, marina: true } },
          workOrder: { select: { id: true, number: true, status: true } },
          inspectionItem: { select: { itemCode: true, inspection: { select: { id: true, number: true } } } },
        },
      }),
      prisma.fault.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

/** Arıza bildirimi — personel, kaptan veya tekne sahibi */
faultsRouter.post(
  '/',
  requirePerm('faults.report'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ vesselId: z.string(), title: z.string().trim().min(2), description: zOptStr, severity: z.enum(PRIORITIES).default('HIGH') }).parse(req.body);
    assertVesselAccess(req.user, body.vesselId);
    const fault = await prisma.fault.create({
      data: { ...body, description: body.description ?? undefined, source: req.user.isStaff ? 'MANUAL' : 'CUSTOMER', reportedById: req.user.id },
      include: { vessel: { select: { name: true } } },
    });
    await notifyFault(fault, fault.vessel.name, req.user.id);
    res.status(201).json(fault);
  }),
);

faultsRouter.put(
  '/:id',
  requirePerm('workorders.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(), severity: z.enum(PRIORITIES).optional(), description: zOptStr }).parse(req.body);
    const f = await prisma.fault.findFirst({ where: { id: req.params.id, ...vesselFilter(req.user) } });
    if (!f) throw notFound('Arıza');
    res.json(
      await prisma.fault.update({
        where: { id: f.id },
        data: { ...body, description: body.description ?? undefined, resolvedAt: body.status === 'RESOLVED' ? new Date() : body.status ? null : undefined },
      }),
    );
  }),
);

faultsRouter.post(
  '/:id/work-order',
  requirePerm('workorders.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ technicianId: z.string().optional(), priority: z.enum(PRIORITIES).optional() }).parse(req.body ?? {});
    res.status(201).json(await createWorkOrderFromFault(req.user, req.params.id, body));
  }),
);
