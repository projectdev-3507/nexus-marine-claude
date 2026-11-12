import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { CURRENCIES } from '@nexus/shared';
import { prisma } from '../db';
import { ah, badRequest } from '../lib/errors';
import { requirePerm, type AuthedRequest } from '../lib/auth';
import { zOptStr } from '../lib/validate';
import { nextNumber } from '../lib/numbering';
import { audit } from '../lib/audit';
import { receiptPdf } from '../services/pdf';
import { contractTotals, loadContracts } from '../services/contractFinance';

/**
 * Finans ve tahsilat (basit): müşteri onayı alınmış sözleşmeler için
 * sözleşme bedeli, "ödeme alındı" işareti ve tahsilat makbuzu.
 */
export const collectionsRouter = Router();

collectionsRouter.get(
  '/',
  requirePerm('finance.view'),
  ah(async (req, res) => {
    const q = z.object({ status: z.enum(['all', 'pending', 'awaiting', 'paid']).default('all'), q: z.string().optional() }).parse(req.query);
    const rows = await loadContracts({ q: q.q });
    const { totals, counts } = contractTotals(rows);
    const items = rows.filter((i) => (q.status === 'paid' ? !!i.paidAt : q.status === 'pending' ? !i.paidAt && i.approved : q.status === 'awaiting' ? !i.paidAt && !i.approved : true));
    res.json({ items, totals, counts });
  }),
);

/** Sözleşme bedeli / para birimi / "ödeme alındı" işareti */
collectionsRouter.put(
  '/:reportId',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ amount: z.number().nonnegative().nullable().optional(), currency: z.enum(CURRENCIES).optional(), paid: z.boolean().optional() }).parse(req.body);
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.reportId } });
    const data: Prisma.ReportUpdateInput = {};
    if (body.amount !== undefined) data.contractAmount = body.amount;
    if (body.currency) data.contractCurrency = body.currency;
    if (body.paid !== undefined) {
      data.paidAt = body.paid ? new Date() : null;
      data.paidBy = body.paid ? req.user.name : null;
    }
    const updated = await prisma.report.update({ where: { id: r.id }, data });
    if (body.paid !== undefined) await audit(req.user.id, body.paid ? 'contract.paid' : 'contract.unpaid', 'Report', r.id, {});
    res.json(updated);
  }),
);

/** Tahsilat oluştur: makbuz numarası verilir, PDF'i /collections/payments/:id/pdf */
collectionsRouter.post(
  '/:reportId/payments',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.object({ amount: z.coerce.number().positive(), currency: z.enum(CURRENCIES).optional(), date: z.coerce.date().optional(), method: zOptStr, note: zOptStr, markPaid: z.boolean().optional() }).parse(req.body);
    const r = await prisma.report.findUniqueOrThrow({ where: { id: req.params.reportId }, include: { vessel: true } });
    if (r.approvalStatus !== 'APPROVED') throw badRequest('Yalnızca müşteri onayı alınmış sözleşmeler için tahsilat oluşturulur');
    if (!r.vessel.ownerId) throw badRequest('Teknenin sahibi (müşteri) tanımlı değil; önce tekne kartından tekne sahibini seçin');
    const payment = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('TAH', tx);
      const p = await tx.payment.create({
        data: { number, reportId: r.id, customerId: r.vessel.ownerId!, amount: body.amount, currency: body.currency ?? r.contractCurrency, date: body.date ?? new Date(), method: body.method ?? undefined, note: body.note ?? undefined, receivedBy: req.user.name },
      });
      if (body.markPaid) await tx.report.update({ where: { id: r.id }, data: { paidAt: new Date(), paidBy: req.user.name } });
      return p;
    });
    await audit(req.user.id, 'payment.create', 'Payment', payment.id, { reportId: r.id, amount: payment.amount });
    res.status(201).json(payment);
  }),
);

collectionsRouter.delete(
  '/payments/:id',
  requirePerm('finance.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const p = await prisma.payment.delete({ where: { id: req.params.id } });
    await audit(req.user.id, 'payment.delete', 'Payment', p.id, { number: p.number, amount: p.amount });
    res.json({ ok: true });
  }),
);

collectionsRouter.get(
  '/payments/:id/pdf',
  requirePerm('finance.view'),
  ah(async (req, res) => {
    const doc = await receiptPdf(req.params.id);
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: req.params.id }, select: { number: true } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${p.number ?? 'tahsilat'}.pdf"`);
    doc.pipe(res);
    doc.end();
  }),
);
