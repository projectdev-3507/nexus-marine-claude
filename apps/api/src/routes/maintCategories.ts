import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah } from '../lib/errors';
import { requirePerm, type AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

/** Bakım başlıkları (kategoriler): Bakım Yönetimi'nden eklenir, adı / alt türleri düzenlenir, kaldırılır */
export const maintCategoriesRouter = Router();

/** Tüm başlıklar (pasifler de döner: eski kayıtların etiketleri için) */
maintCategoriesRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(await prisma.maintCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }));
  }),
);

const body = z.object({
  label: z.string().trim().min(2),
  short: z.string().trim().max(30).optional(),
  items: z.array(z.string().trim().min(1)).default([]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
});

/** "Makine Bakımları" → "MAKINE_BAKIMLARI" benzeri benzersiz anahtar */
async function makeKey(label: string) {
  const tr: Record<string, string> = { ç: 'C', ğ: 'G', ı: 'I', i: 'I', ö: 'O', ş: 'S', ü: 'U', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
  const base = label.replace(/[çğıiöşüÇĞİÖŞÜ]/g, (c) => tr[c] ?? c).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'BASLIK';
  let key = base;
  for (let i = 2; await prisma.maintCategory.findUnique({ where: { key } }); i++) key = `${base}_${i}`;
  return key;
}

maintCategoriesRouter.post(
  '/',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const b = body.parse(req.body);
    const last = await prisma.maintCategory.aggregate({ _max: { sortOrder: true } });
    const c = await prisma.maintCategory.create({
      data: { key: await makeKey(b.label), label: b.label, short: b.short || b.label.replace(/ Bakımları$| Kontrolleri$/i, ''), items: b.items, color: b.color ?? '#1767AD', sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await audit(req.user.id, 'maint-category.create', 'MaintCategory', c.key, { label: c.label });
    res.status(201).json(c);
  }),
);

maintCategoriesRouter.put(
  '/:key',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const b = body.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const c = await prisma.maintCategory.update({ where: { key: req.params.key }, data: { label: b.label, short: b.short, items: b.items, color: b.color, sortOrder: b.sortOrder, isActive: b.isActive } });
    res.json(c);
  }),
);

/** Kaldır: kayıtlarda kullanılıyorsa gizlenir (eski kayıtların etiketi korunur), kullanılmıyorsa silinir */
maintCategoriesRouter.delete(
  '/:key',
  requirePerm('maintenance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const key = req.params.key;
    const used = (await prisma.maintenancePlan.count({ where: { category: key } })) + (await prisma.workOrder.count({ where: { category: key } }));
    if (used) await prisma.maintCategory.update({ where: { key }, data: { isActive: false } });
    else await prisma.maintCategory.delete({ where: { key } });
    await audit(req.user.id, 'maint-category.delete', 'MaintCategory', key, { hidden: used > 0 });
    res.json({ ok: true, hidden: used > 0 });
  }),
);
