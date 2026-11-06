import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah } from '../lib/errors';
import { type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery } from '../lib/validate';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ unread: z.enum(['true']).optional(), type: z.string().optional() }).parse(req.query);
    const where = { userId: req.user.id, ...(q.unread ? { readAt: null } : {}), ...(q.type ? { type: q.type } : {}) };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, ...paginate(q), orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    res.json({ items, total, unread, page: q.page, pageSize: q.pageSize });
  }),
);

notificationsRouter.get(
  '/unread-count',
  ah<AuthedRequest>(async (req, res) => {
    res.json({ unread: await prisma.notification.count({ where: { userId: req.user.id, readAt: null } }) });
  }),
);

notificationsRouter.post(
  '/:id/read',
  ah<AuthedRequest>(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  ah<AuthedRequest>(async (req, res) => {
    const r = await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true, count: r.count });
  }),
);
