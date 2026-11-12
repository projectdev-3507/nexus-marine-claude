import { prisma } from '../db';
import { nextNumber } from '../lib/numbering';
import { managerIds, notify } from './notify';

/**
 * Haftalık Bakım ve Servis Raporu — tekne başına, haftalık (Pazartesi–Pazar).
 * Veriler iş emirleri, bakım planları, arızalar, malzeme kullanımı ve denetimlerden otomatik toplanır.
 */

const DONE = ['COMPLETED', 'PUBLISHED', 'CLOSED'] as const;
const OPEN = ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'ON_HOLD', 'REVISION_REQUIRED'] as const;

export function weekStartOf(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** ISO hafta anahtarı: 2026-W45 */
export function weekKey(start: Date) {
  const d = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate() + 3));
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const statusTRShort = (s: string) =>
  (({ REQUESTED: 'Talep', EVALUATION: 'Değerlendirmede', PLANNED: 'Planlandı', ASSIGNED: 'Atandı', IN_PROGRESS: 'Devam ediyor', TECHNICAL_REVIEW: 'Kontrolde', ON_HOLD: 'Beklemede', REVISION_REQUIRED: 'Revizyon' }) as Record<string, string>)[s] ?? s;

const fmt = (d?: Date | null) => (d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export async function buildWeeklyData(vesselId: string, weekStart: Date) {
  const start = weekStartOf(weekStart);
  const end = new Date(start.getTime() + 7 * 864e5);
  const nextEnd = new Date(end.getTime() + 7 * 864e5);
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId }, include: { owner: true } });

  const [completed, active, upcoming, maint, faults, openFaults, usages, inspections] = await Promise.all([
    prisma.workOrder.findMany({
      where: { vesselId, status: { in: [...DONE] }, finishedAt: { gte: start, lt: end } },
      include: { technician: { select: { name: true } } },
      orderBy: { finishedAt: 'asc' },
    }),
    prisma.workOrder.findMany({
      where: { vesselId, status: { in: [...OPEN] }, OR: [{ plannedStart: { lt: end } }, { createdAt: { lt: end } }] },
      include: { technician: { select: { name: true } } },
      orderBy: { plannedStart: 'asc' },
    }),
    prisma.workOrder.findMany({
      where: { vesselId, status: { in: [...OPEN] }, plannedStart: { gte: end, lt: nextEnd } },
      include: { technician: { select: { name: true } } },
      orderBy: { plannedStart: 'asc' },
    }),
    prisma.maintenancePlan.findMany({
      where: { vesselId, OR: [{ plannedDate: { gte: start, lt: end } }, { status: 'OVERDUE' }] },
      orderBy: { plannedDate: 'asc' },
    }),
    prisma.fault.findMany({ where: { vesselId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'asc' } }),
    prisma.fault.count({ where: { vesselId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.materialUsage.findMany({
      where: { usedAt: { gte: start, lt: end }, workOrder: { vesselId } },
      include: { material: { select: { name: true, unit: true } } },
    }),
    prisma.inspection.findMany({ where: { vesselId, date: { gte: start, lt: end } }, include: { items: { select: { result: true } } }, orderBy: { date: 'desc' } }),
  ]);
  const activeOnly = active.filter((w) => !upcoming.some((u) => u.id === w.id));
  const nextMaint = await prisma.maintenancePlan.findMany({ where: { vesselId, plannedDate: { gte: end, lt: nextEnd }, status: { not: 'CANCELLED' } }, select: { plannedDate: true, title: true }, orderBy: { plannedDate: 'asc' } });

  // ── Haftalık zaman çizelgesi (Pzt–Paz) ve iki haftalık iş yükü grafiği ──
  const dayIdx = (d: Date, base: Date) => Math.floor((+new Date(d.getFullYear(), d.getMonth(), d.getDate()) - +base) / 864e5);
  const clip = (a: number, b: number) => [Math.max(0, Math.min(6, a)), Math.max(0, Math.min(6, b))] as const;
  type TL = { ref?: string; title: string; kind: 'done' | 'active' | 'maint' | 'planned'; from: number; to: number; status: string };
  const timeline: TL[] = [];
  for (const w of completed) {
    const s0 = w.startedAt ?? w.plannedStart ?? w.finishedAt!;
    const [a, b] = clip(dayIdx(s0, start), dayIdx(w.finishedAt!, start));
    timeline.push({ ref: w.number, title: w.title.split(' — ')[0], kind: 'done', from: a, to: Math.max(a, b), status: 'Tamamlandı' });
  }
  for (const w of activeOnly) {
    const s0 = w.startedAt ?? w.plannedStart ?? w.createdAt;
    const e0 = w.plannedEnd ?? w.plannedStart ?? end;
    if (+s0 >= +end) continue;
    const [a, b] = clip(dayIdx(s0, start), dayIdx(e0, start));
    timeline.push({ ref: w.number, title: w.title.split(' — ')[0], kind: 'active', from: a, to: Math.max(a, b), status: statusTRShort(w.status) });
  }
  for (const m of maint.filter((x) => x.plannedDate >= start && x.plannedDate < end)) {
    const a = clip(dayIdx(m.plannedDate, start), 0)[0];
    timeline.push({ title: m.title, kind: 'maint', from: a, to: a, status: m.status === 'COMPLETED' ? 'Tamamlandı' : 'Bakım' });
  }
  const thisWeek = Array(7).fill(0) as number[];
  for (const t of timeline) for (let d = t.from; d <= t.to; d++) thisWeek[d]++;
  const nextWeek = Array(7).fill(0) as number[];
  for (const w of upcoming) {
    const a = dayIdx(w.plannedStart!, end);
    const b = w.plannedEnd ? dayIdx(w.plannedEnd, end) : a;
    for (let d = Math.max(0, a); d <= Math.min(6, Math.max(a, b)); d++) nextWeek[d]++;
  }
  for (const m of nextMaint) { const d = dayIdx(m.plannedDate, end); if (d >= 0 && d < 7) nextWeek[d]++; }
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 864e5).toISOString());
  // ── Gelecek hafta yapılacak işler zaman çizelgesi ──
  const nextDays = Array.from({ length: 7 }, (_, i) => new Date(end.getTime() + i * 864e5).toISOString());
  const nextTimeline: TL[] = [];
  for (const w of upcoming) {
    const a = dayIdx(w.plannedStart!, end);
    const b = w.plannedEnd ? dayIdx(w.plannedEnd, end) : a;
    if (a > 6 || b < 0) continue;
    const [x, y] = clip(a, b);
    nextTimeline.push({ ref: w.number, title: w.title.split(' — ')[0], kind: 'planned', from: x, to: Math.max(x, y), status: w.technician?.name ?? 'Planlı' });
  }
  for (const m of nextMaint) {
    const d = dayIdx(m.plannedDate, end);
    if (d >= 0 && d < 7) nextTimeline.push({ title: m.title, kind: 'maint', from: d, to: d, status: 'Bakım' });
  }

  const mats = new Map<string, { name: string; quantity: number; unit: string }>();
  for (const u of usages) {
    const cur = mats.get(u.materialId) ?? { name: u.material.name, quantity: 0, unit: u.material.unit };
    cur.quantity += u.quantity;
    mats.set(u.materialId, cur);
  }
  const hours = completed.reduce((s, w) => s + (w.actualHours ?? 0), 0);
  const insp = inspections[0];
  const statusTR: Record<string, string> = {
    REQUESTED: 'Talep', EVALUATION: 'Değerlendirmede', PLANNED: 'Planlandı', ASSIGNED: 'Atandı', IN_PROGRESS: 'Devam ediyor', TECHNICAL_REVIEW: 'Kontrolde', ON_HOLD: 'Beklemede', REVISION_REQUIRED: 'Revizyon',
    COMPLETED: 'Tamamlandı', PUBLISHED: 'Yayınlandı', CLOSED: 'Kapatıldı', CANCELLED: 'İptal', OVERDUE: 'Gecikmiş', DONE: 'Tamamlandı',
    OPEN: 'Açık', RESOLVED: 'Giderildi',
  };
  const opTR: Record<string, string> = { READY: 'Sefere hazır', FOLLOW_UP: 'Takip gerektirir', NOT_READY: 'Sefere uygun değil' };

  const summaryParts = [
    `${fmt(start)} – ${fmt(new Date(end.getTime() - 864e5))} haftasında ${vessel.name} teknesinde ${completed.length} iş tamamlandı`,
    activeOnly.length ? `${activeOnly.length} iş devam ediyor` : null,
    upcoming.length ? `gelecek hafta ${upcoming.length} iş planlı` : null,
    faults.length ? `${faults.length} yeni arıza bildirildi` : 'yeni arıza bildirilmedi',
  ].filter(Boolean);

  return {
    weekKey: weekKey(start),
    weekStart: start.toISOString(),
    weekEnd: new Date(end.getTime() - 864e5).toISOString(),
    generatedAt: new Date().toISOString(),
    vessel: { name: vessel.name, model: [vessel.make, vessel.model].filter(Boolean).join(' '), marina: [vessel.marina, vessel.berth].filter(Boolean).join(' · '), owner: vessel.owner?.name ?? '' },
    summary: summaryParts.join(', ') + '.',
    stats: {
      completed: completed.length,
      active: activeOnly.length,
      upcoming: upcoming.length,
      hours: Math.round(hours * 10) / 10,
      newFaults: faults.length,
      openFaults,
      maintenanceDone: maint.filter((m) => m.status === 'COMPLETED').length,
      maintenanceOverdue: maint.filter((m) => m.status === 'OVERDUE').length,
    },
    days,
    timeline,
    nextDays,
    nextTimeline,
    workload: { thisWeek, nextWeek, nextWeekTotal: upcoming.length + nextMaint.length },
    completed: completed.map((w) => ({ ref: w.number, title: w.title.split(' — ')[0], technician: w.technician?.name ?? '', date: w.finishedAt?.toISOString() ?? null, hours: w.actualHours ?? null, note: w.customerSummary ?? '' })),
    active: activeOnly.map((w) => ({ ref: w.number, title: w.title.split(' — ')[0], technician: w.technician?.name ?? '', date: w.plannedStart?.toISOString() ?? null, status: statusTR[w.status] ?? w.status })),
    upcoming: upcoming.map((w) => ({ ref: w.number, title: w.title.split(' — ')[0], technician: w.technician?.name ?? '', date: w.plannedStart?.toISOString() ?? null, status: statusTR[w.status] ?? w.status })),
    maintenance: maint.map((m) => ({ title: m.title, date: m.plannedDate.toISOString(), status: statusTR[m.status] ?? m.status })),
    faults: faults.map((f) => ({ title: f.title, severity: f.severity, status: statusTR[f.status] ?? f.status, date: f.createdAt.toISOString() })),
    materials: [...mats.values()].map((m) => ({ ...m, quantity: Math.round(m.quantity * 100) / 100 })),
    inspection: insp
      ? {
          number: insp.number,
          date: insp.date.toISOString(),
          status: insp.status === 'APPROVED' ? 'Onaylandı' : insp.status === 'SUBMITTED' ? 'Onay bekliyor' : 'Taslak',
          operational: insp.operationalStatus ? opTR[insp.operationalStatus] : '',
          ok: insp.items.filter((i) => i.result === 'OK').length,
          attention: insp.items.filter((i) => i.result === 'ATTENTION').length,
          fault: insp.items.filter((i) => i.result === 'FAULT').length,
        }
      : null,
    notes: '',
  };
}

/** Aktivitesi olan haftalar için rapor oluşturur / taslak ise verileri yeniler */
export async function upsertWeeklyReport(vesselId: string, weekStart: Date, userId?: string | null, opts: { onlyIfActivity?: boolean } = {}) {
  const data = await buildWeeklyData(vesselId, weekStart);
  const hasActivity = data.stats.completed + data.stats.active + data.stats.upcoming + data.stats.newFaults + data.maintenance.length > 0 || !!data.inspection;
  if (opts.onlyIfActivity && !hasActivity) return null;
  const existing = await prisma.report.findFirst({ where: { vesselId, type: 'WEEKLY_SERVICE', periodKey: data.weekKey }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (existing) {
    const v = existing.versions[0];
    // Yalnızca taslak sürüm yenilenir; kullanıcı notu korunur
    if (v && v.status === 'DRAFT') {
      const old = v.data as Record<string, any>;
      const keep = Object.fromEntries(((old.edited ?? []) as string[]).filter((k) => k in old).map((k) => [k, old[k]]));
      await prisma.reportVersion.update({ where: { id: v.id }, data: { data: { ...data, ...keep, edited: old.edited ?? [], titles: old.titles ?? {}, hidden: old.hidden ?? [], extraSections: old.extraSections ?? [], summary: old.summaryEdited ? old.summary : data.summary, summaryEdited: !!old.summaryEdited, notes: old.notes ?? '' } } });
    }
    return { report: existing, created: false };
  }
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const report = await prisma.$transaction(async (tx) => {
    const number = await nextNumber('RPT', tx);
    return tx.report.create({
      data: {
        number,
        type: 'WEEKLY_SERVICE',
        title: `Haftalık Bakım ve Servis Raporu — ${vessel.name} — ${data.weekKey}`,
        vesselId,
        periodKey: data.weekKey,
        createdById: userId ?? undefined,
        versions: { create: { version: 1, data, createdById: userId ?? undefined, changeNote: userId ? 'Haftalık rapor oluşturuldu' : 'Haftalık rapor otomatik oluşturuldu' } },
      },
    });
  });
  return { report, created: true };
}

/** Zamanlayıcı: her Pazartesi bir önceki haftanın raporlarını hazırla (aktivitesi olan tekneler) */
export async function autoWeeklyReports(now = new Date()) {
  if (now.getDay() !== 1 || now.getHours() < 6) return 0;
  const prevWeek = new Date(weekStartOf(now).getTime() - 7 * 864e5);
  const vessels = await prisma.vessel.findMany({ where: { isActive: true }, select: { id: true } });
  let created = 0;
  for (const v of vessels) {
    const r = await upsertWeeklyReport(v.id, prevWeek, null, { onlyIfActivity: true });
    if (r?.created) created++;
  }
  if (created) {
    await notify(await managerIds(), {
      type: 'NEW_REPORT',
      title: `${created} haftalık bakım raporu hazırlandı`,
      body: `${weekKey(prevWeek)} haftası · kontrol edip onaylayın`,
      link: '/reports?type=WEEKLY_SERVICE',
      dedupeKey: `weekly-${weekKey(prevWeek)}`,
    });
  }
  return created;
}
