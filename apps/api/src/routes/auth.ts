import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { ah, HttpError, badRequest } from '../lib/errors';
import { authenticate, signToken, type AuthedRequest } from '../lib/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'E-posta veya şifre hatalı');
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  ah<AuthedRequest>(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, include: { customer: true } });
    res.json({
      user: { ...publicUser(u), customer: u.customer ? { id: u.customer.id, name: u.customer.name } : null },
      permissions: [...req.user.permissions],
      vesselIds: req.user.vesselIds,
    });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  ah<AuthedRequest>(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(8) })
      .parse(req.body);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword, u.passwordHash))) throw badRequest('Mevcut şifre hatalı');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/push-token',
  authenticate,
  ah<AuthedRequest>(async (req, res) => {
    const { token, platform } = z.object({ token: z.string().min(10), platform: z.string().optional() }).parse(req.body);
    await prisma.pushToken.upsert({
      where: { token },
      create: { token, platform, userId: req.user.id },
      update: { userId: req.user.id, platform },
    });
    res.json({ ok: true });
  }),
);

export function publicUser(u: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  title: string | null;
  roles: string[];
  avatarUrl: string | null;
  customerId: string | null;
  isActive?: boolean;
  lastLoginAt?: Date | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    title: u.title,
    roles: u.roles,
    avatarUrl: u.avatarUrl,
    customerId: u.customerId,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
  };
}
