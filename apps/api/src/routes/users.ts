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

/**
 * Tek adımda kullanıcı kurulumu (oluşturma veya düzenleme).
 * Rol seçimine göre: tekne sahibi için müşteri kaydı otomatik açılır ve seçilen/yeni tekneler ona bağlanır;
 * kaptan için seçilen/yeni teknelere kaptan ilişkisi kurulur. Personel rollerinde tekne yoktur.
 */
const newVesselSchema = z.object({
  name: z.string().trim().min(1),
  type: zOptStr,
  make: zOptStr,
  model: zOptStr,
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  lengthM: z.coerce.number().min(0).optional().nullable(),
  marina: zOptStr,
  berth: zOptStr,
});
const setupSchema = z.object({
  id: z.string().optional(),
  role: z.enum(ROLES),
  name: z.string().trim().min(2),
  email: z.string().email().transform((e) => e.toLowerCase()),
  phone: zOptStr,
  title: zOptStr,
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
  company: zOptStr,
  taxNumber: zOptStr,
  address: zOptStr,
  vesselIds: z.array(z.string()).default([]),
  newVessels: z.array(newVesselSchema).default([]),
});

usersRouter.post(
  '/setup',
  requirePerm('users.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const b = setupSchema.parse(req.body);
    const clientRole = b.role === 'OWNER' || b.role === 'CAPTAIN';
    if (b.id === req.user.id && req.user.roles.includes('SUPER_ADMIN') && b.role !== 'SUPER_ADMIN') throw badRequest('Kendi yönetici rolünüzü kaldıramazsınız');
    const temp = !b.id && !b.password ? crypto.randomBytes(6).toString('base64url') : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const existing = b.id ? await tx.user.findUniqueOrThrow({ where: { id: b.id } }) : null;
      // Rol: yeni kullanıcıda tek rol; düzenlemede seçilen rol değiştiyse ana rol değişir, diğer roller korunur
      const roles = existing
        ? (existing.roles.includes(b.role) ? existing.roles : [b.role])
        : [b.role];

      // Tekne sahibi → müşteri kaydı (yoksa aç, varsa güncelle)
      let customerId = existing?.customerId ?? null;
      if (b.role === 'OWNER') {
        const cData = { name: b.company || b.name, company: b.company ?? null, email: b.email, phone: b.phone ?? null, taxNumber: b.taxNumber ?? null, address: b.address ?? null };
        customerId = customerId
          ? (await tx.customer.update({ where: { id: customerId }, data: cData })).id
          : (await tx.customer.create({ data: cData })).id;
      }

      const userData = {
        name: b.name, email: b.email, phone: b.phone ?? null, title: b.title ?? null, roles,
        customerId: b.role === 'OWNER' ? customerId : clientRole ? existing?.customerId ?? null : null,
        ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
      };
      const pw = b.password ?? temp;
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { ...userData, ...(pw ? { passwordHash: await bcrypt.hash(pw, 10) } : {}) } })
        : await tx.user.create({ data: { ...userData, passwordHash: await bcrypt.hash(pw!, 10) } });

      if (clientRole) {
        // Yeni tekneler
        const created = [];
        for (const nv of b.newVessels) {
          created.push(await tx.vessel.create({ data: { ...nv, year: nv.year ?? undefined, lengthM: nv.lengthM ?? undefined, ownerId: b.role === 'OWNER' ? customerId : undefined } }));
        }
        const ids = [...new Set([...b.vesselIds, ...created.map((v) => v.id)])];
        if (b.role === 'OWNER') {
          // Listeden çıkarılan tekneler sahipsiz kalır, seçilenler bu müşteriye geçer
          await tx.vessel.updateMany({ where: { ownerId: customerId!, id: { notIn: ids } }, data: { ownerId: null } });
          if (ids.length) await tx.vessel.updateMany({ where: { id: { in: ids } }, data: { ownerId: customerId } });
        } else {
          await tx.vesselMember.deleteMany({ where: { userId: user.id, relation: 'CAPTAIN', vesselId: { notIn: ids } } });
          for (const vesselId of ids) {
            await tx.vesselMember.upsert({
              where: { userId_vesselId_relation: { userId: user.id, vesselId, relation: 'CAPTAIN' } },
              create: { userId: user.id, vesselId, relation: 'CAPTAIN' },
              update: {},
            });
          }
        }
      }
      return user;
    });

    await audit(req.user.id, b.id ? 'user.update' : 'user.create', 'User', result.id, { role: b.role, vessels: b.vesselIds.length + b.newVessels.length });
    res.status(b.id ? 200 : 201).json({ user: publicUser(result), temporaryPassword: temp });
  }),
);

/** Düzenleme formu için: kullanıcının müşteri kaydı ve tekneleri */
usersRouter.get(
  '/:id/setup',
  requirePerm('users.manage'),
  ah(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { customer: { include: { vessels: { select: { id: true } } } }, vesselLinks: { where: { relation: 'CAPTAIN' }, select: { vesselId: true } } },
    });
    res.json({
      ...publicUser(u),
      company: u.customer?.company ?? null,
      taxNumber: u.customer?.taxNumber ?? null,
      address: u.customer?.address ?? null,
      ownedVesselIds: u.customer?.vessels.map((v) => v.id) ?? [],
      captainVesselIds: u.vesselLinks.map((l) => l.vesselId),
    });
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
