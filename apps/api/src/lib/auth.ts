import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { permissionsFor, isManager, isStaff, type Permission, type Role } from '@nexus/shared';
import { config } from '../config';
import { prisma } from '../db';
import { forbidden, HttpError } from './errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  customerId: string | null;
  permissions: Set<Permission>;
  isStaff: boolean;
  isManager: boolean;
  /** null = tüm tekneler (personel). Aksi halde erişilebilir tekne ID'leri. */
  vesselIds: string[] | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type AuthedRequest = Request & { user: AuthUser };

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

/**
 * Kullanıcının erişebildiği tekneleri hesaplar.
 * Personel (admin/operasyon/teknisyen) tüm tekneleri görür.
 * Kaptan/sahip yalnızca bağlı olduğu tekneleri görür (VesselMember + müşteri sahipliği).
 */
export async function resolveVesselScope(user: { id: string; roles: Role[]; customerId: string | null }) {
  if (isStaff(user.roles)) return null;
  const [links, owned] = await Promise.all([
    prisma.vesselMember.findMany({ where: { userId: user.id }, select: { vesselId: true } }),
    user.customerId
      ? prisma.vessel.findMany({ where: { ownerId: user.customerId }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  return [...new Set([...links.map((l) => l.vesselId), ...owned.map((v) => v.id)])];
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !u.isActive) return null;
  const roles = u.roles as Role[];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roles,
    customerId: u.customerId,
    permissions: permissionsFor(roles),
    isStaff: isStaff(roles),
    isManager: isManager(roles),
    vesselIds: await resolveVesselScope({ id: u.id, roles, customerId: u.customerId }),
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
    if (!token) throw new HttpError(401, 'Oturum açmanız gerekiyor');
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, 'Oturum süresi doldu veya geçersiz');
    }
    const user = await loadAuthUser(String(payload.sub));
    if (!user) throw new HttpError(401, 'Kullanıcı bulunamadı veya pasif');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** En az bir yetkiyi gerektirir. */
export const requirePerm =
  (...perms: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(new HttpError(401, 'Oturum açmanız gerekiyor'));
    if (!perms.some((p) => user.permissions.has(p))) return next(forbidden());
    next();
  };

export const can = (user: AuthUser, perm: Permission) => user.permissions.has(perm);

/** Tekne erişimi kontrolü — URL/API manipülasyonu ile başka müşteri verisine erişimi engeller. */
export function assertVesselAccess(user: AuthUser, vesselId: string | null | undefined) {
  if (!vesselId) throw forbidden();
  if (user.vesselIds === null) return;
  if (!user.vesselIds.includes(vesselId)) throw new HttpError(404, 'Kayıt bulunamadı');
}

/** Prisma where parçası: tekne kapsamı */
export function vesselFilter(user: AuthUser, field = 'vesselId') {
  return user.vesselIds === null ? {} : { [field]: { in: user.vesselIds } };
}

/** Teknisyen (yönetici olmayan) sadece kendisine atanmış iş emirlerini görür. */
export const isTechOnly = (user: AuthUser) => user.roles.includes('TECHNICIAN') && !user.isManager;
