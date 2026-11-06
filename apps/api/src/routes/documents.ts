import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ah, notFound } from '../lib/errors';
import { assertVesselAccess, requirePerm, type AuthedRequest, type AuthUser } from '../lib/auth';
import { paginate, paginationQuery, zOptDate, zOptStr } from '../lib/validate';

export const documentsRouter = Router();

const CATEGORIES = ['CONTRACT', 'CERTIFICATE', 'INSURANCE', 'TECHNICAL', 'WARRANTY', 'INVOICE', 'OTHER'] as const;

function scope(user: AuthUser): Prisma.DocumentWhereInput {
  if (user.isStaff) return {};
  return {
    customerVisible: true,
    OR: [
      { vesselId: { in: user.vesselIds ?? [] } },
      ...(user.customerId ? [{ customerId: user.customerId, vesselId: null }] : []),
    ],
  };
}

documentsRouter.get(
  '/',
  requirePerm('documents.view', 'documents.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const q = paginationQuery.extend({ vesselId: z.string().optional(), customerId: z.string().optional(), category: z.string().optional() }).parse(req.query);
    const where: Prisma.DocumentWhereInput = {
      AND: [
        scope(req.user),
        q.vesselId ? { vesselId: q.vesselId } : {},
        q.customerId ? { customerId: q.customerId } : {},
        q.category ? { category: q.category } : {},
        q.q ? { title: { contains: q.q, mode: 'insensitive' } } : {},
      ],
    };
    const [docs, total] = await Promise.all([
      prisma.document.findMany({ where, ...paginate(q), orderBy: { createdAt: 'desc' }, include: { vessel: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } } } }),
      prisma.document.count({ where }),
    ]);
    const attachments = await prisma.attachment.findMany({ where: { id: { in: docs.map((d) => d.attachmentId).filter(Boolean) as string[] } } });
    const items = docs.map((d) => ({ ...d, attachment: attachments.find((a) => a.id === d.attachmentId) ?? null }));
    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

const schema = z.object({
  title: z.string().trim().min(1),
  category: z.enum(CATEGORIES),
  vesselId: zOptStr,
  customerId: zOptStr,
  customerVisible: z.boolean().default(false),
  expiryDate: zOptDate,
  notes: zOptStr,
  attachmentId: zOptStr,
});

documentsRouter.post(
  '/',
  requirePerm('documents.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = schema.parse(req.body);
    if (body.vesselId) assertVesselAccess(req.user, body.vesselId);
    let customerId = body.customerId;
    if (!customerId && body.vesselId) customerId = (await prisma.vessel.findUnique({ where: { id: body.vesselId } }))?.ownerId;
    const d = await prisma.document.create({ data: { ...body, customerId: customerId ?? undefined, vesselId: body.vesselId ?? undefined, expiryDate: body.expiryDate ?? undefined, notes: body.notes ?? undefined, attachmentId: body.attachmentId ?? undefined, createdById: req.user.id } });
    res.status(201).json(d);
  }),
);

documentsRouter.put(
  '/:id',
  requirePerm('documents.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = schema.partial().parse(req.body);
    const d = await prisma.document.update({ where: { id: req.params.id }, data: { ...body, vesselId: body.vesselId ?? undefined, customerId: body.customerId ?? undefined, expiryDate: body.expiryDate ?? undefined, notes: body.notes ?? undefined, attachmentId: body.attachmentId ?? undefined } });
    if (d.attachmentId && body.customerVisible !== undefined) {
      await prisma.attachment.update({ where: { id: d.attachmentId }, data: { customerVisible: body.customerVisible } });
    }
    res.json(d);
  }),
);

documentsRouter.delete(
  '/:id',
  requirePerm('documents.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const d = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!d) throw notFound('Belge');
    await prisma.document.delete({ where: { id: d.id } });
    res.json({ ok: true });
  }),
);
