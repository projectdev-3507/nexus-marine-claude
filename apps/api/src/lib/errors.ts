import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Kayıt') => new HttpError(404, `${what} bulunamadı`);
export const forbidden = (msg = 'Bu işlem için yetkiniz yok') => new HttpError(403, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);

/** async route handler sarmalayıcı */
export const ah =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as T, res, next).catch(next);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Geçersiz veri', details: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Kayıt bulunamadı' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Bu kayıt zaten mevcut' });
    if (err.code === 'P2003') return res.status(400).json({ error: 'İlişkili kayıt bulunamadı' });
  }
  if ((err as { code?: string })?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Dosya boyutu çok büyük' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Sunucu hatası' });
}
