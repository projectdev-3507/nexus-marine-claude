import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PRIORITIES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { assertVesselAccess, requirePerm, vesselFilter, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, zOptStr } from '../lib/validate';
import { createWorkOrderFromFault, notifyFault } from '../services/faults';
import { attachmentsFor } from './files';
import { managerIds, notify, vesselClientUserIds } from '../services/notify';

export const faultsRouter = Router();

faultsRouter.get(
  '/',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ vesselId: z.string().optional(), status: z.string().optional(), severity: z.string().optional() }).parse(req.query);
    const where: Prisma.FaultWhereInput = {
      ...vesselFilter(req.user),
      ...(req.user.isStaff ? {} : { source: 'CUSTOMER' }),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.status ? { status: { in: q.status.split(',') as any } } : {}),
      ...(q.severity ? { severity: { in: q.severity.split(',') as any } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.fault.findMany({
        where,
        ...paginate(q),
        // Açılış tarihine göre (en yeni üstte)
        orderBy: [{ createdAt: 'desc' }],
        include: {
          vessel: { select: { id: true, name: true, marina: true } },
          workOrder: { select: { id: true, number: true, status: true, updatedAt: true, technician: { select: { name: true } } } },
          inspectionItem: { select: { itemCode: true, inspection: { select: { id: true, number: true } } } },
        },
      }),
      prisma.fault.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

/** Arıza detayı: müşteri talebi, fotoğraflar, bağlı iş emri */
faultsRouter.get(
  '/:id',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    const fault = await prisma.fault.findFirst({
      where: { id: req.params.id, ...vesselFilter(req.user), ...(req.user.isStaff ? {} : { source: 'CUSTOMER' }) },
      include: {
        vessel: { select: { id: true, name: true, marina: true, berth: true, owner: { select: { id: true, name: true, phone: true, email: true } } } },
        workOrder: { select: { id: true, number: true, status: true, title: true, customerSummary: true, updatedAt: true, technician: { select: { id: true, name: true } }, helperIds: true } },
        comments: { orderBy: { createdAt: 'asc' } },
        inspectionItem: { select: { itemCode: true, label: true, inspection: { select: { id: true, number: true } } } },
      },
    });
    if (!fault) throw notFound('Arıza');
    const reporter = fault.reportedById ? await prisma.user.findUnique({ where: { id: fault.reportedById }, select: { id: true, name: true, phone: true, email: true } }) : null;
    const attachments = await attachmentsFor(req.user, 'FAULT', fault.id);
    const staff = req.user.isStaff;
    // Yorumlar: arıza yorumları + (iş emri açıldıysa) iş emri yorumları; müşteri dahili yorumları görmez
    const woComments = fault.workOrderId
      ? await prisma.workOrderComment.findMany({ where: { workOrderId: fault.workOrderId, ...(staff ? {} : { internal: false }) }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } })
      : [];
    const commentFiles = woComments.length ? await attachmentsFor(req.user, 'COMMENT', woComments.map((c) => c.id)) : [];
    const comments = [
      ...fault.comments.filter((c) => staff || !c.internal).map((c) => ({ id: c.id, userId: c.userId, userName: c.userName, body: c.body, internal: c.internal, createdAt: c.createdAt, files: [] as any[] })),
      ...woComments.map((c) => ({ id: c.id, userId: c.userId, userName: c.user.name, body: c.body, internal: c.internal, createdAt: c.createdAt, files: commentFiles.filter((a) => a.entityId === c.id) })),
    ].sort((a, b) => +a.createdAt - +b.createdAt);
    // Servis fotoğrafları (iş emrinden; müşteriye yalnızca onaylı olanlar)
    const serviceFiles = fault.workOrderId ? await attachmentsFor(req.user, 'WORK_ORDER', fault.workOrderId) : [];
    const wo = fault.workOrder;
    res.json({
      ...fault,
      // Müşteri iş emrini görmez; yalnızca ilerleme durumu
      workOrder: staff ? wo : null,
      progress: wo ? { status: wo.status, technician: wo.technician?.name ?? null, summary: ['PUBLISHED', 'CLOSED'].includes(wo.status) ? wo.customerSummary : null, updatedAt: wo.updatedAt } : null,
      reporter: staff ? reporter : reporter && { id: reporter.id, name: reporter.name },
      attachments,
      serviceFiles,
      comments,
    });
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
    const body = z.object({ technicianId: z.string().optional(), helperIds: z.array(z.string()).optional(), priority: z.enum(PRIORITIES).optional() }).parse(req.body ?? {});
    const wo = await createWorkOrderFromFault(req.user, req.params.id, body);
    for (const uid of [wo.technicianId, ...wo.helperIds].filter(Boolean) as string[]) {
      await notify([uid], { type: 'TASK_ASSIGNED', title: `Size yeni görev atandı: ${wo.number}`, body: wo.title, link: `/work-orders/${wo.id}`, entityType: 'WorkOrder', entityId: wo.id, dedupeKey: `wo-assign-${wo.id}-${uid}` });
    }
    res.status(201).json(wo);
  }),
);

/** Arıza yorumu: iş emri açıldıysa iş emrinin yorumlarına (müşteri kanalı / ekip içi) yazılır, açılmadıysa arızaya */
faultsRouter.post(
  '/:id/comments',
  requirePerm('vessels.view'),
  ah<AuthedRequest>(async (req, res) => {
    const { body, internal } = z.object({ body: z.string().trim().min(1, 'Yorum boş olamaz'), internal: z.boolean().optional() }).parse(req.body);
    const fault = await prisma.fault.findFirst({
      where: { id: req.params.id, ...vesselFilter(req.user), ...(req.user.isStaff ? {} : { source: 'CUSTOMER' }) },
      include: { workOrder: { select: { id: true, number: true, technicianId: true, helperIds: true } } },
    });
    if (!fault) throw notFound('Arıza');
    if (!body) throw badRequest('Yorum boş olamaz');
    const isInternal = req.user.isStaff ? !!internal : false;
    const wo = fault.workOrder;
    const c = wo
      ? await prisma.workOrderComment.create({ data: { workOrderId: wo.id, userId: req.user.id, body, internal: isInternal } })
      : await prisma.faultComment.create({ data: { faultId: fault.id, userId: req.user.id, userName: req.user.name, body, internal: isInternal } });
    const preview = body.length > 140 ? body.slice(0, 140) + '…' : body;
    const staffTargets = [...(await managerIds()), ...(wo ? [wo.technicianId, ...wo.helperIds] : [])].filter(Boolean) as string[];
    const clientTargets = isInternal ? [] : await vesselClientUserIds(fault.vesselId);
    const base = { type: 'NEW_COMMENT' as const, fromClient: !req.user.isStaff, title: `${req.user.name} yorum yaptı · ${fault.title}`, body: preview, entityType: 'Fault', entityId: fault.id };
    await notify(staffTargets, { ...base, link: wo ? `/work-orders/${wo.id}` : `/faults/${fault.id}` }, req.user.id);
    if (clientTargets.length) await notify(clientTargets, { ...base, link: `/faults/${fault.id}` }, req.user.id);
    res.status(201).json(c);
  }),
);
