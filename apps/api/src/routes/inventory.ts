import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah } from '../lib/errors';
import { can, requirePerm, type AuthedRequest } from '../lib/auth';
import { paginate, paginationQuery, sortBy, zOptStr } from '../lib/validate';

export const inventoryRouter = Router();

const schema = z.object({
  name: z.string().trim().min(1),
  sku: zOptStr,
  category: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  stock: z.coerce.number().default(0),
  minStock: z.coerce.number().default(0),
  unitCost: z.coerce.number().min(0).default(0),
  currency: z.string().default('EUR'),
});

inventoryRouter.get(
  '/',
  requirePerm('inventory.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ category: z.string().optional(), low: z.enum(['true']).optional() }).parse(req.query);
    const where: Prisma.MaterialWhereInput = {
      ...(q.category ? { category: q.category } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    let items = await prisma.material.findMany({
      where,
      orderBy: sortBy(q.sort, q.sort ? q.order : 'asc', ['name', 'category', 'stock', 'unitCost'], 'name'),
      include: { _count: { select: { usages: true } } },
    });
    if (q.low) items = items.filter((m) => m.stock <= m.minStock);
    const total = items.length;
    const page = items.slice(paginate(q).skip, paginate(q).skip + q.pageSize);
    const showCost = can(req.user, 'finance.view');
    res.json({ items: page.map((m) => (showCost ? m : { ...m, unitCost: undefined })), total, page: q.page, pageSize: q.pageSize });
  }),
);

inventoryRouter.get(
  '/categories',
  requirePerm('inventory.view'),
  ah(async (_req, res) => {
    const rows = await prisma.material.findMany({ distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } });
    res.json(rows.map((r) => r.category));
  }),
);

inventoryRouter.get(
  '/:id/usages',
  requirePerm('inventory.view'),
  ah<AuthedRequest>(async (req, res) => {
    const usages = await prisma.materialUsage.findMany({
      where: { materialId: req.params.id },
      orderBy: { usedAt: 'desc' },
      take: 100,
      include: { workOrder: { select: { id: true, number: true, vessel: { select: { name: true } } } }, project: { select: { id: true, name: true } } },
    });
    res.json(can(req.user, 'finance.view') ? usages : usages.map((u) => ({ ...u, unitCost: undefined })));
  }),
);

inventoryRouter.post(
  '/',
  requirePerm('inventory.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = schema.parse(req.body);
    if (!can(req.user, 'finance.manage')) body.unitCost = 0;
    res.status(201).json(await prisma.material.create({ data: { ...body, sku: body.sku ?? undefined } }));
  }),
);

inventoryRouter.put(
  '/:id',
  requirePerm('inventory.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = schema.partial().parse(req.body);
    if (!can(req.user, 'finance.manage')) delete body.unitCost;
    res.json(await prisma.material.update({ where: { id: req.params.id }, data: { ...body, sku: body.sku ?? undefined } }));
  }),
);

/** Stok girişi / sayım düzeltmesi */
inventoryRouter.post(
  '/:id/adjust',
  requirePerm('inventory.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { delta } = z.object({ delta: z.coerce.number() }).parse(req.body);
    res.json(await prisma.material.update({ where: { id: req.params.id }, data: { stock: { increment: delta } } }));
  }),
);
