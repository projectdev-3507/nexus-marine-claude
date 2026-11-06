import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ah } from '../lib/errors';
import { requirePerm, type AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const settingsRouter = Router();

export const DEFAULT_SETTINGS = {
  company: { name: 'Nexus Marine', email: 'info@nexusmarine.com', phone: '', address: '', taxOffice: '', taxNumber: '' },
  reminders: { upcomingMaintenanceDays: 7, engineHoursThreshold: 25, overdueWorkOrderDays: 0 },
  finance: { defaultCurrency: 'EUR', defaultVatRate: 20 },
  reports: { footerNote: 'Bu rapor Nexus Marine teknik ekibi tarafından hazırlanmıştır.' },
};

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const out: Record<string, any> = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) out[r.key] = { ...(out[r.key] ?? {}), ...(r.value as object) };
  return out as typeof DEFAULT_SETTINGS;
}

settingsRouter.get('/', ah(async (_req, res) => res.json(await getSettings())));

settingsRouter.put(
  '/',
  requirePerm('settings.manage'),
  ah<AuthedRequest>(async (req, res) => {
    const body = z.record(z.record(z.any())).parse(req.body);
    for (const [key, value] of Object.entries(body)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await audit(req.user.id, 'settings.update', 'Setting', undefined, Object.keys(body));
    res.json(await getSettings());
  }),
);
