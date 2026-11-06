import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../db';
import { config } from '../config';
import { ah, badRequest, forbidden, notFound } from '../lib/errors';
import { assertVesselAccess, can, type AuthedRequest, type AuthUser } from '../lib/auth';

export const filesRouter = Router();

fs.mkdirSync(config.storageDir, { recursive: true });

const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|application\/vnd\.openxmlformats-officedocument\..+|application\/msword|text\/plain)$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(config.storageDir, new Date().toISOString().slice(0, 7));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase().slice(0, 10)),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.test(file.mimetype)),
});

export const ENTITY_TYPES = ['WORK_ORDER', 'INSPECTION_ITEM', 'VESSEL', 'PROJECT', 'PHASE', 'REPORT', 'DOCUMENT', 'FAULT'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

/** Varlık için tekne kimliğini sunucu tarafında çözer ve yükleme yetkisini doğrular. */
async function resolveEntity(user: AuthUser, type: EntityType, id: string): Promise<string> {
  switch (type) {
    case 'WORK_ORDER': {
      const wo = await prisma.workOrder.findUnique({ where: { id }, select: { vesselId: true, technicianId: true } });
      if (!wo) throw notFound();
      assertVesselAccess(user, wo.vesselId);
      if (user.isStaff && !user.isManager && wo.technicianId !== user.id) throw forbidden();
      return wo.vesselId;
    }
    case 'INSPECTION_ITEM': {
      const it = await prisma.inspectionItem.findUnique({ where: { id }, select: { inspection: { select: { vesselId: true, status: true } } } });
      if (!it) throw notFound();
      if (!can(user, 'inspections.perform')) throw forbidden();
      return it.inspection.vesselId;
    }
    case 'VESSEL':
      if (!can(user, 'vessels.manage')) throw forbidden();
      return id;
    case 'PROJECT':
    case 'PHASE': {
      if (!can(user, 'projects.manage')) throw forbidden();
      const p =
        type === 'PROJECT'
          ? await prisma.project.findUnique({ where: { id }, select: { vesselId: true } })
          : (await prisma.projectPhase.findUnique({ where: { id }, select: { project: { select: { vesselId: true } } } }))?.project;
      if (!p) throw notFound();
      return p.vesselId;
    }
    case 'REPORT': {
      if (!can(user, 'reports.manage')) throw forbidden();
      const r = await prisma.report.findUnique({ where: { id }, select: { vesselId: true } });
      if (!r) throw notFound();
      return r.vesselId;
    }
    case 'DOCUMENT': {
      if (!can(user, 'documents.manage')) throw forbidden();
      const d = await prisma.document.findUnique({ where: { id }, select: { vesselId: true } });
      if (!d) throw notFound();
      return d.vesselId ?? '';
    }
    case 'FAULT': {
      const f = await prisma.fault.findUnique({ where: { id }, select: { vesselId: true } });
      if (!f) throw notFound();
      assertVesselAccess(user, f.vesselId);
      return f.vesselId;
    }
  }
}

filesRouter.post(
  '/',
  upload.array('files', 10),
  ah<AuthedRequest>(async (req, res) => {
    const meta = z
      .object({
        entityType: z.enum(ENTITY_TYPES),
        entityId: z.string().min(1),
        caption: z.string().optional(),
        tag: z.enum(['BEFORE', 'AFTER', 'GENERAL']).optional(),
        customerVisible: z.enum(['true', 'false']).optional(),
      })
      .parse(req.body);
    const files = (req.files as Express.Multer.File[]) ?? [];
    try {
      if (!files.length) throw badRequest('Desteklenen bir dosya seçilmedi (JPG, PNG, WEBP, HEIC, PDF, DOCX)');
      const vesselId = await resolveEntity(req.user, meta.entityType, meta.entityId);
      // Müşteriye görünürlük yalnızca yönetici onayıyla
      const customerVisible = req.user.isManager ? meta.customerVisible === 'true' : !req.user.isStaff;
      const created = await prisma.$transaction(
        files.map((f) =>
          prisma.attachment.create({
            data: {
              entityType: meta.entityType,
              entityId: meta.entityId,
              vesselId: vesselId || null,
              fileName: f.originalname,
              mimeType: f.mimetype,
              size: f.size,
              storageKey: path.relative(config.storageDir, f.path),
              caption: meta.caption,
              tag: meta.tag,
              customerVisible,
              uploadedById: req.user.id,
            },
          }),
        ),
      );
      res.status(201).json(created);
    } catch (e) {
      for (const f of files) fs.promises.unlink(f.path).catch(() => {});
      throw e;
    }
  }),
);

export async function attachmentsFor(user: AuthUser, entityType: string, entityId: string | string[]) {
  return prisma.attachment.findMany({
    where: {
      entityType,
      entityId: Array.isArray(entityId) ? { in: entityId } : entityId,
      ...(user.isStaff ? {} : { customerVisible: true }),
    },
    orderBy: { createdAt: 'asc' },
  });
}

filesRouter.get(
  '/',
  ah<AuthedRequest>(async (req, res) => {
    const q = z.object({ entityType: z.string().optional(), entityId: z.string().optional(), vesselId: z.string().optional() }).parse(req.query);
    if (!q.vesselId && !(q.entityType && q.entityId)) throw badRequest('vesselId veya entityType+entityId gerekli');
    if (q.vesselId) assertVesselAccess(req.user, q.vesselId);
    const items = await prisma.attachment.findMany({
      where: {
        ...(q.vesselId ? { vesselId: q.vesselId } : {}),
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(req.user.vesselIds === null ? {} : { vesselId: { in: req.user.vesselIds } }),
        ...(req.user.isStaff ? {} : { customerVisible: true }),
        mimeType: q.vesselId ? { startsWith: 'image/' } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(items);
  }),
);

/** Dosya indirme / görüntüleme — erişim kontrollü */
filesRouter.get(
  '/:id/raw',
  ah<AuthedRequest>(async (req, res) => {
    const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!a) throw notFound('Dosya');
    if (!req.user.isStaff) {
      if (!a.customerVisible || !a.vesselId) throw notFound('Dosya');
      assertVesselAccess(req.user, a.vesselId);
    }
    const full = path.join(config.storageDir, a.storageKey);
    if (!full.startsWith(config.storageDir) || !fs.existsSync(full)) throw notFound('Dosya');
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`);
    fs.createReadStream(full).pipe(res);
  }),
);

/** Müşteriye görünürlük onayı / açıklama */
filesRouter.patch(
  '/:id',
  ah<AuthedRequest>(async (req, res) => {
    if (!req.user.isManager) throw forbidden();
    const body = z.object({ customerVisible: z.boolean().optional(), caption: z.string().optional(), tag: z.string().optional() }).parse(req.body);
    res.json(await prisma.attachment.update({ where: { id: req.params.id }, data: body }));
  }),
);

filesRouter.delete(
  '/:id',
  ah<AuthedRequest>(async (req, res) => {
    const a = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!a) throw notFound('Dosya');
    if (!req.user.isManager && a.uploadedById !== req.user.id) throw forbidden();
    await prisma.attachment.delete({ where: { id: a.id } });
    fs.promises.unlink(path.join(config.storageDir, a.storageKey)).catch(() => {});
    res.json({ ok: true });
  }),
);
