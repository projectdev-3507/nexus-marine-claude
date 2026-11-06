import { Prisma } from '@prisma/client';
import type { NotificationType } from '@nexus/shared';
import { prisma } from '../db';
import { config } from '../config';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  /** Aynı anahtar + kullanıcı için ikinci bildirim üretilmez */
  dedupeKey?: string;
}

/** Bildirim oluşturur (tekrar engelli) ve kayıtlı cihazlara push gönderir. */
export async function notify(userIds: Array<string | null | undefined>, input: NotifyInput, excludeUserId?: string) {
  const targets = [...new Set(userIds.filter((u): u is string => !!u && u !== excludeUserId))];
  const created: string[] = [];
  for (const userId of targets) {
    try {
      await prisma.notification.create({ data: { userId, ...input } });
      created.push(userId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // tekrar
      throw e;
    }
  }
  if (created.length) void sendPush(created, input).catch((e) => console.error('push failed', e));
  return created.length;
}

async function sendPush(userIds: string[], input: NotifyInput) {
  if (!config.expoPushEnabled) return;
  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
  if (!tokens.length) return;
  const messages = tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: input.title,
    body: input.body ?? '',
    data: { link: input.link, entityType: input.entityType, entityId: input.entityId },
  }));
  for (let i = 0; i < messages.length; i += 100) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
}

export async function managerIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, roles: { hasSome: ['SUPER_ADMIN', 'OPERATIONS_MANAGER'] } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Teknenin müşteri tarafı kullanıcıları (sahip hesapları + kaptanlar). */
export async function vesselClientUserIds(vesselId: string): Promise<string[]> {
  const vessel = await prisma.vessel.findUnique({
    where: { id: vesselId },
    select: { ownerId: true, members: { select: { userId: true } } },
  });
  if (!vessel) return [];
  const owners = vessel.ownerId
    ? await prisma.user.findMany({ where: { customerId: vessel.ownerId, isActive: true }, select: { id: true } })
    : [];
  return [...new Set([...owners.map((o) => o.id), ...vessel.members.map((m) => m.userId)])];
}
