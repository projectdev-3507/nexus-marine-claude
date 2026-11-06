import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ROLES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest } from '../lib/errors';
import { requirePerm, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, zOptStr } from '../lib/validate';
import { audit } from '../lib/audit';
import { publicUser } from './auth';

export const usersRouter = Router();
export const techniciansRouter = Router();

const schema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  name: z.string().trim().min(2),
  phone: zOptStr,
  title: zOptStr,
  roles: z.array(z.enum(ROLES)).min(1),
  customerId: zOptStr,
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
  vesselLinks: z.array(z.object({ vesselId: z.string(), relation: z.enum(['OWNER', 'CAPTAIN', 'CREW']) })).optional(),
});

usersRouter.get(
  '/',
  requirePerm('users.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ role: z.enum(ROLES).optional(), active: z.enum(['true', 'false']).optional() }).parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { roles: { has: q.role } } : {}),
      ...(q.active ? { isActive: q.active === 'true' } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, ...paginate(q), orderBy: { name: 'asc' }, include: { customer: { select: { id: true, name: true } }, vesselLinks: { include: { vessel: { select: { id: true, name: true } } } } } }),
      prisma.user.count({ where }),
    ]);
    res.json({ items: rows.map((u) => ({ ...publicUser(u), customer: u.customer, vesselLinks: u.vesselLinks })), total, page: q.page, pageSize: q.pageSize });
  }),
);

usersRouter.post(
  '/',
  requirePerm('users.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { password, vesselLinks, ...data } = schema.parse(req.body);
    if (data.roles.includes('OWNER') && !data.customerId) throw badRequest('Tekne sahibi rolü için müşteri kaydı seçilmelidir');
    const temp = password ?? crypto.randomBytes(6).toString('base64url');
    const u = await prisma.user.create({
      data: {
        ...data,
        customerId: data.customerId ?? undefined,
        passwordHash: await bcrypt.hash(temp, 10),
        vesselLinks: vesselLinks?.length ? { create: vesselLinks } : undefined,
      },
    });
    await audit(req.user.id, 'user.create', 'User', u.id, { roles: data.roles });
    res.status(201).json({ user: publicUser(u), temporaryPassword: password ? undefined : temp });
  }),
);

usersRouter.put(
  '/:id',
  requirePerm('users.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { password, vesselLinks, ...data } = schema.partial().parse(req.body);
    if (req.params.id === req.user.id && data.roles && !data.roles.includes('SUPER_ADMIN') && req.user.roles.includes('SUPER_ADMIN')) {
      throw badRequest('Kendi yönetici rolünüzü kaldıramazsınız');
    }
    const u = await prisma.$transaction(async (tx) => {
      if (vesselLinks) {
        await tx.vesselMember.deleteMany({ where: { userId: req.params.id } });
        if (vesselLinks.length) await tx.vesselMember.createMany({ data: vesselLinks.map((l) => ({ ...l, userId: req.params.id })), skipDuplicates: true });
      }
      return tx.user.update({
        where: { id: req.params.id },
        data: { ...data, customerId: data.customerId === undefined ? undefined : data.customerId, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      });
    });
    await audit(req.user.id, 'user.update', 'User', u.id, { roles: data.roles, isActive: data.isActive });
    res.json(publicUser(u));
  }),
);

usersRouter.post(
  '/:id/reset-password',
  requirePerm('users.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const temp = crypto.randomBytes(6).toString('base64url');
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: await bcrypt.hash(temp, 10) } });
    await audit(req.user.id, 'user.reset-password', 'User', req.params.id);
    res.json({ temporaryPassword: temp });
  }),
);

usersRouter.get(
  '/audit',
  requirePerm('users.manage'),
  ah(async (req, res) => {
    const q = paginationQuery.parse(req.query);
    const items = await prisma.auditLog.findMany({ ...paginate(q), orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } });
    res.json({ items });
  }),
);

/** Basit kişi listesi (atama seçimleri için) */
usersRouter.get(
  '/lookup',
  requirePerm('workorders.manage', 'projects.manage', 'vessels.manage', 'maintenance.manage'),
  ah(async (req, res) => {
    const role = z.enum(ROLES).optional().parse(req.query.role);
    const users = await prisma.user.findMany({ where: { isActive: true, ...(role ? { roles: { has: role } } : {}) }, select: { id: true, name: true, roles: true, title: true }, orderBy: { name: 'asc' } });
    res.json(users);
  }),
);

// Teknisyenler ve anlık durumları
techniciansRouter.get(
  '/',
  requirePerm('technicians.view', 'workorders.assign'),
  ah(async (_req, res) => {
    const techs = await prisma.user.findMany({ where: { roles: { has: 'TECHNICIAN' }, isActive: true }, orderBy: { name: 'asc' } });
    const ids = techs.map((t) => t.id);
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const monthStart = new Date(today0.getFullYear(), today0.getMonth(), 1);
    const [active, open, doneMonth, todays] = await Promise.all([
      prisma.workOrder.findMany({ where: { technicianId: { in: ids }, status: 'IN_PROGRESS' }, select: { id: true, number: true, title: true, technicianId: true, startedAt: true, vessel: { select: { name: true, marina: true } } } }),
      prisma.workOrder.groupBy({ by: ['technicianId'], where: { technicianId: { in: ids }, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUIRED', 'ON_HOLD'] } }, _count: true }),
      prisma.workOrder.groupBy({ by: ['technicianId'], where: { technicianId: { in: ids }, finishedAt: { gte: monthStart } }, _count: true, _sum: { actualHours: true } }),
      prisma.workOrder.groupBy({ by: ['technicianId'], where: { technicianId: { in: ids }, plannedStart: { gte: today0, lt: new Date(today0.getTime() + 864e5) } }, _count: true }),
    ]);
    res.json(
      techs.map((t) => {
        const current = active.find((a) => a.technicianId === t.id) ?? null;
        const openCount = open.find((o) => o.technicianId === t.id)?._count ?? 0;
        return {
          id: t.id,
          name: t.name,
          title: t.title,
          phone: t.phone,
          email: t.email,
          avatarUrl: t.avatarUrl,
          status: current ? 'ON_TASK' : openCount ? 'ASSIGNED' : 'AVAILABLE',
          current,
          openCount,
          todayCount: todays.find((o) => o.technicianId === t.id)?._count ?? 0,
          completedThisMonth: doneMonth.find((o) => o.technicianId === t.id)?._count ?? 0,
          hoursThisMonth: doneMonth.find((o) => o.technicianId === t.id)?._sum.actualHours ?? 0,
        };
      }),
    );
  }),
);
