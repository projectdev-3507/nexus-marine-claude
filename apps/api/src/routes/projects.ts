import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { HULL_RESTORATION_PHASES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { assertVesselAccess, can, requirePerm, vesselFilter, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, zOptDate, zOptNum, zOptStr } from '../lib/validate';
import { attachmentsFor } from './files';
import { managerIds, notify, vesselClientUserIds } from '../services/notify';

export const projectsRouter = Router();

type PhaseWithTasks = { status: string; tasks: { done: boolean; weight: number }[] };

/** İlerleme yüzdesi: tamamlanan iş kalemlerinin ağırlıklı oranı. Görevi olmayan aşamalar durumlarıyla sayılır. */
export function computeProgress(phases: PhaseWithTasks[]) {
  let total = 0;
  let done = 0;
  for (const p of phases) {
    if (p.tasks.length) {
      for (const t of p.tasks) {
        total += t.weight;
        if (t.done) done += t.weight;
      }
    } else {
      total += 1;
      done += p.status === 'DONE' ? 1 : p.status === 'IN_PROGRESS' ? 0.5 : 0;
    }
  }
  return total ? Math.round((done / total) * 1000) / 10 : 0;
}

const projectSchema = z.object({
  name: z.string().trim().min(2),
  vesselId: z.string(),
  managerId: zOptStr,
  description: zOptStr,
  startDate: zOptDate,
  endDate: zOptDate,
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'DELIVERED', 'CANCELLED']).optional(),
  budget: zOptNum,
  currency: z.string().optional(),
  template: z.enum(['HULL_RESTORATION', 'NONE']).optional(),
});

projectsRouter.get(
  '/',
  requirePerm('projects.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ vesselId: z.string().optional(), status: z.string().optional() }).parse(req.query);
    const where: Prisma.ProjectWhereInput = {
      ...vesselFilter(req.user),
      ...(q.vesselId ? { vesselId: q.vesselId } : {}),
      ...(q.status ? { status: { in: q.status.split(',') as any } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { vessel: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.project.findMany({
        where,
        ...paginate(q),
        orderBy: { startDate: 'desc' },
        include: {
          vessel: { select: { id: true, name: true } },
          manager: { select: { id: true, name: true } },
          phases: { select: { status: true, tasks: { select: { done: true, weight: true } } } },
          _count: { select: { changeRequests: { where: { status: 'PENDING' } } } },
        },
      }),
      prisma.project.count({ where }),
    ]);
    const finance = can(req.user, 'finance.view');
    const items = rows.map(({ phases, ...p }) => ({ ...p, budget: finance ? p.budget : undefined, progress: computeProgress(phases), phaseCount: phases.length }));
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

projectsRouter.get(
  '/:id',
  requirePerm('projects.view'),
  ah<AuthedRequest>(async (req, res) => {
    const p = await prisma.project.findFirst({
      where: { id: req.params.id, ...vesselFilter(req.user) },
      include: {
        vessel: { select: { id: true, name: true, marina: true, ownerId: true } },
        manager: { select: { id: true, name: true } },
        phases: { orderBy: { order: 'asc' }, include: { tasks: { orderBy: { id: 'asc' } }, responsible: { select: { id: true, name: true } } } },
        changeRequests: { orderBy: { createdAt: 'desc' } },
        workOrders: { select: { id: true, number: true, title: true, status: true, technician: { select: { name: true } } } },
        reports: { where: req.user.isStaff ? {} : { status: 'PUBLISHED' }, select: { id: true, number: true, title: true, status: true, type: true } },
        materials: { include: { material: { select: { name: true, unit: true } } } },
        payments: { orderBy: { date: 'asc' } },
        installments: { orderBy: { dueDate: 'asc' } },
      },
    });
    if (!p) throw notFound('Proje');
    const progress = computeProgress(p.phases);
    const approvedCR = p.changeRequests.filter((c) => c.status === 'APPROVED');
    const impact = { extraDays: approvedCR.reduce((s, c) => s + c.extraDays, 0), extraCost: approvedCR.reduce((s, c) => s + c.extraCost, 0) };
    const projectedEnd = p.endDate ? new Date(p.endDate.getTime() + impact.extraDays * 864e5) : null;
    const attachments = await attachmentsFor(req.user, 'PHASE', p.phases.map((ph) => ph.id));
    const projectFiles = await attachmentsFor(req.user, 'PROJECT', p.id);
    const finance = can(req.user, 'finance.view');
    const materialCost = p.materials.reduce((s, m) => s + m.quantity * m.unitCost, 0);
    const paid = p.payments.reduce((s, x) => s + x.amount, 0);
    const contract = (p.budget ?? 0) + impact.extraCost;
    res.json({
      ...p,
      progress,
      impact: { ...impact, extraCost: finance ? impact.extraCost : undefined, projectedEnd },
      attachments: [...projectFiles, ...attachments],
      changeRequests: p.changeRequests.map((c) => (finance || !req.user.isStaff ? c : { ...c, extraCost: undefined })),
      materials: finance ? p.materials : p.materials.map((m) => ({ ...m, unitCost: undefined })),
      budget: finance ? p.budget : undefined,
      payments: finance ? p.payments : undefined,
      installments: finance ? p.installments : undefined,
      finance: finance ? { contract, paid, balance: contract - paid, materialCost } : undefined,
    });
  }),
);

projectsRouter.post(
  '/',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { template, ...data } = projectSchema.parse(req.body);
    const p = await prisma.project.create({
      data: {
        ...data,
        managerId: data.managerId ?? undefined,
        budget: can(req.user, 'finance.manage') ? (data.budget ?? undefined) : undefined,
        startDate: data.startDate ?? undefined,
        endDate: data.endDate ?? undefined,
        phases: template === 'HULL_RESTORATION' ? { create: HULL_RESTORATION_PHASES.map((name, i) => ({ name, order: i + 1 })) } : undefined,
      },
    });
    res.status(201).json(p);
  }),
);

projectsRouter.put(
  '/:id',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { template: _t, vesselId: _v, ...data } = projectSchema.partial().parse(req.body);
    const before = await prisma.project.findUniqueOrThrow({ where: { id: req.params.id } });
    const p = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...data,
        managerId: data.managerId === null ? null : data.managerId,
        budget: can(req.user, 'finance.manage') ? data.budget : undefined,
        startDate: data.startDate === undefined ? undefined : data.startDate,
        endDate: data.endDate === undefined ? undefined : data.endDate,
      },
    });
    if (data.status === 'DELIVERED' && before.status !== 'DELIVERED') {
      await notify([...(await vesselClientUserIds(p.vesselId)), ...(await managerIds())], {
        type: 'PROJECT_DELIVERY',
        title: 'Proje teslim edildi',
        body: p.name,
        link: `/projects/${p.id}`,
        entityType: 'Project',
        entityId: p.id,
        dedupeKey: `project-delivered-${p.id}`,
      }, req.user.id);
    }
    res.json(p);
  }),
);

// Aşamalar
const phaseSchema = z.object({
  name: z.string().trim().min(1),
  order: z.coerce.number().int().optional(),
  responsibleId: zOptStr,
  startDate: zOptDate,
  endDate: zOptDate,
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'DONE']).optional(),
  materials: zOptStr,
  notes: zOptStr,
});

projectsRouter.post(
  '/:id/phases',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = phaseSchema.parse(req.body);
    const max = await prisma.projectPhase.aggregate({ where: { projectId: req.params.id }, _max: { order: true } });
    res.status(201).json(await prisma.projectPhase.create({ data: { ...body, order: body.order ?? (max._max.order ?? 0) + 1, projectId: req.params.id } as any }));
  }),
);

projectsRouter.put(
  '/:id/phases/:phaseId',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = phaseSchema.partial().parse(req.body);
    const ph = await prisma.projectPhase.findFirst({ where: { id: req.params.phaseId, projectId: req.params.id } });
    if (!ph) throw notFound('Aşama');
    res.json(await prisma.projectPhase.update({ where: { id: ph.id }, data: body as any }));
  }),
);

projectsRouter.delete(
  '/:id/phases/:phaseId',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    await prisma.projectPhase.deleteMany({ where: { id: req.params.phaseId, projectId: req.params.id } });
    res.json({ ok: true });
  }),
);

projectsRouter.post(
  '/:id/phases/:phaseId/tasks',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ title: z.string().trim().min(1), weight: z.coerce.number().positive().default(1) }).parse(req.body);
    const ph = await prisma.projectPhase.findFirst({ where: { id: req.params.phaseId, projectId: req.params.id } });
    if (!ph) throw notFound('Aşama');
    res.status(201).json(await prisma.projectTask.create({ data: { ...body, phaseId: ph.id } }));
  }),
);

projectsRouter.patch(
  '/:id/tasks/:taskId',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ done: z.boolean().optional(), title: z.string().optional(), weight: z.coerce.number().positive().optional() }).parse(req.body);
    const t = await prisma.projectTask.findFirst({ where: { id: req.params.taskId, phase: { projectId: req.params.id } }, include: { phase: { include: { tasks: true } } } });
    if (!t) throw notFound('Görev');
    const updated = await prisma.projectTask.update({ where: { id: t.id }, data: { ...body, doneAt: body.done === undefined ? undefined : body.done ? new Date() : null } });
    // Aşama durumunu görevlerden türet
    const tasks = t.phase.tasks.map((x) => (x.id === t.id ? updated : x));
    const status = tasks.every((x) => x.done) ? 'DONE' : tasks.some((x) => x.done) ? 'IN_PROGRESS' : 'NOT_STARTED';
    if (status !== t.phase.status) await prisma.projectPhase.update({ where: { id: t.phaseId }, data: { status } });
    res.json(updated);
  }),
);

projectsRouter.delete(
  '/:id/tasks/:taskId',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    await prisma.projectTask.deleteMany({ where: { id: req.params.taskId, phase: { projectId: req.params.id } } });
    res.json({ ok: true });
  }),
);

// Ek iş talepleri (kaptan / müşteri talep edebilir, yönetici karar verir)
projectsRouter.post(
  '/:id/change-requests',
  requirePerm('projects.view'),
  ah<AuthedRequest>(async (req, res) => {
    const p = await prisma.project.findUniqueOrThrow({ where: { id: req.params.id } });
    assertVesselAccess(req.user, p.vesselId);
    const body = z.object({ title: z.string().trim().min(2), description: zOptStr, extraDays: z.coerce.number().int().min(0).default(0), extraCost: z.coerce.number().min(0).default(0), requestedBy: zOptStr }).parse(req.body);
    const staff = can(req.user, 'projects.manage');
    const cr = await prisma.changeRequest.create({
      data: {
        projectId: p.id,
        title: body.title,
        description: body.description ?? undefined,
        extraDays: staff ? body.extraDays : 0,
        extraCost: staff && can(req.user, 'finance.manage') ? body.extraCost : 0,
        requestedBy: staff ? (body.requestedBy ?? req.user.name) : req.user.name,
      },
    });
    if (!staff) {
      await notify(await managerIds(), { type: 'CUSTOMER_REQUEST', title: `Ek iş talebi: ${p.name}`, body: cr.title, link: `/projects/${p.id}`, entityType: 'Project', entityId: p.id, dedupeKey: `cr-${cr.id}` });
    }
    res.status(201).json(cr);
  }),
);

projectsRouter.put(
  '/:id/change-requests/:crId',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(), extraDays: z.coerce.number().int().min(0).optional(), extraCost: z.coerce.number().min(0).optional(), title: z.string().optional(), description: zOptStr }).parse(req.body);
    const cr = await prisma.changeRequest.findFirst({ where: { id: req.params.crId, projectId: req.params.id } });
    if (!cr) throw notFound('Ek iş talebi');
    res.json(
      await prisma.changeRequest.update({
        where: { id: cr.id },
        data: {
          ...body,
          description: body.description ?? undefined,
          extraCost: can(req.user, 'finance.manage') ? body.extraCost : undefined,
          decidedAt: body.status && body.status !== 'PENDING' ? new Date() : undefined,
        },
      }),
    );
  }),
);

// Proje malzeme kullanımı
projectsRouter.post(
  '/:id/materials',
  requirePerm('projects.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { materialId, quantity } = z.object({ materialId: z.string(), quantity: z.coerce.number().positive() }).parse(req.body);
    const usage = await prisma.$transaction(async (tx) => {
      const m = await tx.material.findUniqueOrThrow({ where: { id: materialId } });
      await tx.material.update({ where: { id: m.id }, data: { stock: { decrement: quantity } } });
      return tx.materialUsage.create({ data: { materialId, projectId: req.params.id, quantity, unitCost: m.unitCost, userId: req.user.id } });
    });
    res.status(201).json(usage);
  }),
);

// Ödeme planı
projectsRouter.post(
  '/:id/installments',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ dueDate: z.coerce.date(), amount: z.coerce.number().positive(), note: zOptStr }).parse(req.body);
    res.status(201).json(await prisma.paymentInstallment.create({ data: { ...body, note: body.note ?? undefined, projectId: req.params.id } }));
  }),
);

projectsRouter.patch(
  '/:id/installments/:instId',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ paid: z.boolean() }).parse(req.body);
    const inst = await prisma.paymentInstallment.findFirst({ where: { id: req.params.instId, projectId: req.params.id } });
    if (!inst) throw badRequest('Taksit bulunamadı');
    res.json(await prisma.paymentInstallment.update({ where: { id: inst.id }, data: body }));
  }),
);
