import type { MaintenancePlan } from '@prisma/client';
import { prisma } from '../db';

/**
 * Periyodik bakım serileri: "her hafta Pzt", "haftada 2 · Çar, Per", "her ay 15'inde".
 * Serinin planları seriesId ile bağlıdır; ileriye dönük planlar (haftalıkta 4 hafta, aylıkta 3 ay)
 * otomatik oluşturulur ve takvimde / bakım listesinde görünür. Zamanlayıcı her çalıştığında seriyi uzatır.
 */

export type RepeatRule = { repeatWeekdays: number[]; repeatMonthDay: number | null };
export const hasRepeat = (r: Partial<RepeatRule>) => (r.repeatWeekdays?.length ?? 0) > 0 || !!r.repeatMonthDay;

const DAY = 864e5;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const withTime = (day: Date, time: Date) => { const x = new Date(day); x.setHours(time.getHours(), time.getMinutes(), 0, 0); return x; };

/** Kurala uyan ilk gün (dahil) — ilk planı seçilen güne oturtmak için */
export function snapToRule(rule: RepeatRule, date: Date): Date {
  if (rule.repeatWeekdays.length) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(date.getTime() + i * DAY);
      if (rule.repeatWeekdays.includes(d.getDay())) return d;
    }
  }
  if (rule.repeatMonthDay) {
    const d = monthDate(date.getFullYear(), date.getMonth(), rule.repeatMonthDay, date);
    return d >= startOfDay(date) ? d : monthDate(date.getFullYear(), date.getMonth() + 1, rule.repeatMonthDay, date);
  }
  return date;
}

function monthDate(y: number, m: number, day: number, time: Date) {
  const last = new Date(y, m + 1, 0).getDate();
  return withTime(new Date(y, m, Math.min(day, last)), time);
}

/** after (hariç) ile until (dahil) arasındaki tarihler */
export function occurrences(rule: RepeatRule, after: Date, until: Date, time: Date): Date[] {
  const out: Date[] = [];
  if (rule.repeatWeekdays.length) {
    for (let d = startOfDay(new Date(after.getTime() + DAY)); d <= until && out.length < 400; d = new Date(d.getTime() + DAY)) {
      if (rule.repeatWeekdays.includes(d.getDay())) out.push(withTime(d, time));
    }
  } else if (rule.repeatMonthDay) {
    for (let i = 0; i < 36 && out.length < 400; i++) {
      const d = monthDate(after.getFullYear(), after.getMonth() + i, rule.repeatMonthDay, time);
      if (d > after && d <= until) out.push(d);
      if (d > until) break;
    }
  }
  return out;
}

/** Bitiş tarihi varsa o güne kadar (en fazla ~13 ay), yoksa haftalıkta 4 hafta / aylıkta 3 ay ileriye */
const horizon = (rule: { repeatUntil?: Date | null }) => {
  if (rule.repeatUntil) { const end = new Date(rule.repeatUntil); end.setHours(23, 59, 59, 999); return new Date(Math.min(end.getTime(), Date.now() + 400 * DAY)); }
  // Bitiş tarihi girilmemişse 1 yıl ileriye
  return new Date(Date.now() + 365 * DAY);
};

/** Seriyi ileriye doğru uzatır (son planı şablon alır). Oluşturulan plan sayısını döner. */
export async function extendSeries(seriesId: string): Promise<number> {
  const last = await prisma.maintenancePlan.findFirst({ where: { seriesId }, orderBy: { plannedDate: 'desc' } });
  if (!last || !hasRepeat(last)) return 0;
  const after = new Date(Math.max(last.plannedDate.getTime(), startOfDay(new Date()).getTime() - 1));
  const dates = occurrences(last, after, horizon(last), last.plannedDate);
  if (!dates.length) return 0;
  await prisma.maintenancePlan.createMany({ data: dates.map((plannedDate) => copyOf(last, plannedDate)) });
  return dates.length;
}

function copyOf(p: MaintenancePlan, plannedDate: Date) {
  return {
    title: p.title,
    category: p.category,
    subType: p.subType,
    vesselId: p.vesselId,
    description: p.description,
    technicianId: p.technicianId,
    helperIds: p.helperIds,
    priority: p.priority,
    plannedMaterials: p.plannedMaterials ?? undefined,
    estimatedHours: p.estimatedHours,
    repeatWeekdays: p.repeatWeekdays,
    repeatMonthDay: p.repeatMonthDay,
    seriesId: p.seriesId,
    source: p.source,
    requestedById: p.requestedById,
    repeatUntil: p.repeatUntil,
    checklist: Array.isArray(p.checklist) ? (p.checklist as Array<{ label: string }>).map((x) => ({ label: x.label, done: false })) : undefined,
    plannedDate,
    startDate: plannedDate,
    status: 'PLANNED' as const,
  };
}

/** Serinin bu plandan sonraki, henüz işe dönüşmemiş planlarını siler (kural değişince / tekrar durdurulunca) */
export async function dropFuture(seriesId: string, afterDate: Date) {
  const r = await prisma.maintenancePlan.deleteMany({ where: { seriesId, plannedDate: { gt: afterDate }, status: 'PLANNED', workOrderId: null, completedAt: null, extraWorkOrders: { none: {} }, comments: { none: {} } } });
  return r.count;
}

/** Yeni plan tekrarlıysa seriyi başlatır */
export async function startSeries(planId: string) {
  const p = await prisma.maintenancePlan.update({ where: { id: planId }, data: { seriesId: planId } });
  return extendSeries(p.seriesId!);
}

/** Zamanlayıcı: tüm aktif serileri uzat */
export async function extendAllSeries() {
  const rows = await prisma.maintenancePlan.findMany({
    where: { seriesId: { not: null }, OR: [{ repeatWeekdays: { isEmpty: false } }, { repeatMonthDay: { not: null } }], AND: [{ OR: [{ repeatUntil: null }, { repeatUntil: { gte: startOfDay(new Date()) } }] }] },
    distinct: ['seriesId'],
    select: { seriesId: true },
  });
  let n = 0;
  for (const r of rows) n += await extendSeries(r.seriesId!);
  return n;
}

const WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const repeatLabel = (r: RepeatRule) =>
  r.repeatWeekdays.length ? `${r.repeatWeekdays.length === 1 ? 'Her hafta' : `Haftada ${r.repeatWeekdays.length}`} · ${[1, 2, 3, 4, 5, 6, 0].filter((d) => r.repeatWeekdays.includes(d)).map((d) => WD[d]).join(', ')}` : r.repeatMonthDay ? `Her ay ${r.repeatMonthDay}. gün` : '';
