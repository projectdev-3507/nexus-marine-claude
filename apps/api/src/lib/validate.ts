import { z } from 'zod';

export const zId = z.string().min(1);
export const zDate = z.coerce.date();
export const zOptDate = z
  .union([z.coerce.date(), z.literal('').transform(() => null), z.null()])
  .optional();
export const zOptStr = z.string().trim().optional().nullable();
export const zOptNum = z
  .union([z.coerce.number(), z.literal('').transform(() => null), z.null()])
  .optional();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export function paginate(p: { page: number; pageSize: number }) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function sortBy(sort: string | undefined, order: 'asc' | 'desc', allowed: string[], fallback: string) {
  const field = sort && allowed.includes(sort) ? sort : fallback;
  return { [field]: order };
}

/** Prisma JSON alanlarına `null` atamak için */
export const jsonOrUndefined = <T>(v: T | null | undefined) => (v === null ? undefined : v);
