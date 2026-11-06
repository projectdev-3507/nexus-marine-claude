import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

export async function audit(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue,
) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entityType, entityId, meta } });
  } catch (e) {
    console.error('audit failed', e);
  }
}
