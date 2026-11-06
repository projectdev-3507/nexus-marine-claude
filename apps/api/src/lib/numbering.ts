import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

type Tx = Prisma.TransactionClient | typeof prisma;

/** Atomik sıra numarası üretir: WO-2026-0001, INS-2026-0001 ... */
export async function nextNumber(prefix: string, tx: Tx = prisma): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(counter.value).padStart(4, '0')}`;
}
