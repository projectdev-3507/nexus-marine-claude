import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, badRequest, notFound } from '../lib/errors';
import { can, requirePerm, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, zOptDate, zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { managerIds, notify } from '../services/notify';

export const quotesRouter = Router();
export const paymentsRouter = Router();

export function quoteTotals(q: { vatRate: number; items: { quantity: number; unitPrice: number }[] }) {
  const subtotal = q.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vat = (subtotal * q.vatRate) / 100;
  return { subtotal: round(subtotal), vat: round(vat), total: round(subtotal + vat) };
}
const round = (n: number) => Math.round(n * 100) / 100;

const itemSchema = z.object({ description: z.string().trim().min(1), quantity: z.coerce.number().positive(), unit: z.string().default('adet'), unitPrice: z.coerce.number().min(0) });
const quoteSchema = z.object({
  customerId: z.string(),
  vesselId: zOptStr,
  title: z.string().trim().min(2),
  currency: z.string().default('EUR'),
  vatRate: z.coerce.number().min(0).max(100).default(20),
  validUntil: zOptDate,
  notes: zOptStr,
  items: z.array(itemSchema).min(1),
});

/** Müşteri yalnızca kendisine gönderilmiş teklifleri görür */
function scope(user: AuthUser): Prisma.QuoteWhereInput {
  if (can(user, 'finance.view')) return {};
  if (can(user, 'quotes.respond') && user.customerId) return { customerId: user.customerId, status: { in: ['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] } };
  return { id: '__none__' };
}

quotesRouter.get(
  '/',
  requirePerm('finance.view', 'quotes.respond'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ status: z.string().optional(), customerId: z.string().optional(), vesselId: z.string().optional() }).parse(req.query);
    const where: Prisma.QuoteWhereInput = {
      AND: [
        scope(req.user),
        q.status ? { status: { in: q.status.split(',') as any } } : {},
        q.customerId ? { customerId: q.customerId } : {},
        q.vesselId ? { vesselId: q.vesselId } : {},
        q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { customer: { name: { contains: q.q, mode: 'insensitive' } } }] } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.quote.findMany({ where, ...paginate(q), orderBy: { createdAt: 'desc' }, include: { items: true, customer: { select: { id: true, name: true } }, vessel: { select: { id: true, name: true } } } }),
      prisma.quote.count({ where }),
    ]);
    res.json({ items: rows.map((r) => ({ ...r, ...quoteTotals(r) })), total, page: q.page, pageSize: q.pageSize });
  }),
);

quotesRouter.get(
  '/:id',
  requirePerm('finance.view', 'quotes.respond'),
  ah<AuthedRequest>(async (req, res) => {
    const r = await prisma.quote.findFirst({
      where: { AND: [{ id: req.params.id }, scope(req.user)] },
      include: { items: { orderBy: { order: 'asc' } }, customer: { select: { id: true, name: true, email: true, phone: true } }, vessel: { select: { id: true, name: true } }, payments: can(req.user, 'finance.view') } as any,
    });
    if (!r) throw notFound('Teklif');
    res.json({ ...r, ...quoteTotals(r as any) });
  }),
);

quotesRouter.post(
  '/',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { items, ...data } = quoteSchema.parse(req.body);
    const q = await prisma.$transaction(async (tx) =>
      tx.quote.create({
        data: { ...data, vesselId: data.vesselId ?? undefined, validUntil: data.validUntil ?? undefined, notes: data.notes ?? undefined, number: await nextNumber('TKF', tx), items: { create: items.map((i, order) => ({ ...i, order })) } },
        include: { items: true },
      }),
    );
    res.status(201).json(q);
  }),
);

quotesRouter.put(
  '/:id',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const { items, ...data } = quoteSchema.partial().parse(req.body);
    const q = await prisma.quote.findUniqueOrThrow({ where: { id: req.params.id } });
    if (['APPROVED', 'REJECTED'].includes(q.status)) throw badRequest('Yanıtlanmış teklif düzenlenemez');
    const updated = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.quoteItem.deleteMany({ where: { quoteId: q.id } });
        await tx.quoteItem.createMany({ data: items.map((i, order) => ({ ...i, order, quoteId: q.id })) });
      }
      return tx.quote.update({ where: { id: q.id }, data: { ...data, vesselId: data.vesselId ?? undefined, validUntil: data.validUntil ?? undefined, notes: data.notes ?? undefined }, include: { items: true } });
    });
    res.json(updated);
  }),
);

quotesRouter.post(
  '/:id/send',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const q = await prisma.quote.update({ where: { id: req.params.id }, data: { status: 'SENT', sentAt: new Date() } });
    const users = await prisma.user.findMany({ where: { customerId: q.customerId, isActive: true }, select: { id: true } });
    await notify(users.map((u) => u.id), { type: 'QUOTE_SENT', title: 'Yeni teklifiniz var', body: q.title, link: `/quotes/${q.id}`, entityType: 'Quote', entityId: q.id, dedupeKey: `quote-sent-${q.id}` });
    res.json(q);
  }),
);

/** Müşteri teklif onayı / reddi */
quotesRouter.post(
  '/:id/respond',
  requirePerm('quotes.respond'),
  ah<AuthedRequest>(async (req, res) => {
    const { decision, note } = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), note: zOptStr }).parse(req.body);
    const q = await prisma.quote.findFirst({ where: { AND: [{ id: req.params.id }, scope(req.user)] } });
    if (!q) throw notFound('Teklif');
    if (q.status !== 'SENT') throw badRequest('Bu teklif yanıtlanamaz');
    if (q.validUntil && q.validUntil < new Date()) throw badRequest('Teklifin geçerlilik süresi dolmuş');
    const updated = await prisma.quote.update({
      where: { id: q.id },
      data: { status: decision, responseNote: note ?? undefined, approvedAt: decision === 'APPROVED' ? new Date() : undefined, rejectedAt: decision === 'REJECTED' ? new Date() : undefined },
    });
    await notify(await managerIds(), {
      type: 'QUOTE_RESPONSE',
      fromClient: true,
      title: `Teklif ${decision === 'APPROVED' ? 'onaylandı' : 'reddedildi'}: ${q.number}`,
      body: `${q.title}${note ? ` — ${note}` : ''}`,
      link: `/quotes/${q.id}`,
      entityType: 'Quote',
      entityId: q.id,
      dedupeKey: `quote-resp-${q.id}`,
    });
    res.json(updated);
  }),
);

// Ödemeler / tahsilat (manuel)
paymentsRouter.get(
  '/',
  requirePerm('finance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ customerId: z.string().optional(), projectId: z.string().optional() }).parse(req.query);
    const where: Prisma.PaymentWhereInput = { ...(q.customerId ? { customerId: q.customerId } : {}), ...(q.projectId ? { projectId: q.projectId } : {}) };
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, ...paginate(q), orderBy: { date: 'desc' }, include: { customer: { select: { name: true } }, project: { select: { name: true } }, quote: { select: { number: true } } } }),
      prisma.payment.count({ where }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

paymentsRouter.post(
  '/',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ customerId: z.string(), projectId: zOptStr, quoteId: zOptStr, amount: z.coerce.number().positive(), currency: z.string().default('EUR'), date: z.coerce.date().optional(), method: zOptStr, note: zOptStr }).parse(req.body);
    res.status(201).json(await prisma.payment.create({ data: { ...body, projectId: body.projectId ?? undefined, quoteId: body.quoteId ?? undefined, method: body.method ?? undefined, note: body.note ?? undefined } }));
  }),
);

/** Finans özeti: proje bedeli, alınan ödemeler, kalan bakiye */
paymentsRouter.get(
  '/summary',
  requirePerm('finance.view'),
  ah<AuthedRequest>(async (_req, res) => {
    const [projects, quotes, payments] = await Promise.all([
      prisma.project.findMany({ include: { changeRequests: { where: { status: 'APPROVED' } }, payments: true, installments: true, vessel: { select: { name: true } } } }),
      prisma.quote.findMany({ where: { status: 'APPROVED' }, include: { items: true } }),
      prisma.payment.aggregate({ _sum: { amount: true } }),
    ]);
    const rows = projects.map((p) => {
      const contract = (p.budget ?? 0) + p.changeRequests.reduce((s, c) => s + c.extraCost, 0);
      const paid = p.payments.reduce((s, x) => s + x.amount, 0);
      const overdue = p.installments.filter((i) => !i.paid && i.dueDate < new Date()).reduce((s, i) => s + i.amount, 0);
      return { id: p.id, name: p.name, vessel: p.vessel.name, currency: p.currency, contract, paid, balance: contract - paid, overdue, status: paid >= contract && contract > 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID' };
    });
    res.json({
      projects: rows,
      approvedQuotesTotal: quotes.reduce((s, q) => s + quoteTotals(q).total, 0),
      collected: payments._sum.amount ?? 0,
      outstanding: rows.reduce((s, r) => s + Math.max(0, r.balance), 0),
    });
  }),
);
