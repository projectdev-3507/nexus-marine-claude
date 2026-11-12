import { prisma } from '../db';
import { config } from '../config';
import { managerIds, notify } from './notify';
import { getSettings } from '../routes/settings';
import { autoWeeklyReports } from './weekly';

/**
 * Periyodik görevler:
 *  - Tarihi geçen bakımları "Gecikmiş" olarak işaretle
 *  - Yaklaşan (tarih bazlı) bakımlar için hatırlatma
 *  - Motor çalışma saati bazlı bakım hatırlatması
 *  - Planlanan bitişi geçmiş açık iş emirleri için gecikme bildirimi
 * Bildirimler dedupeKey ile tekrar üretilmez.
 */
export async function runScheduledJobs(now = new Date()) {
  const settings = await getSettings();
  const managers = await managerIds();
  const result = { overdueMarked: 0, upcomingNotified: 0, engineHourNotified: 0, overdueWorkOrders: 0 };

  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const overdue = await prisma.maintenancePlan.findMany({
    where: { status: { in: ['PLANNED', 'IN_PROGRESS'] }, plannedDate: { lt: today0 }, OR: [{ workOrderId: null }, { workOrder: { status: { notIn: ['COMPLETED', 'PUBLISHED', 'CLOSED'] } } }] },
    include: { vessel: { select: { name: true } } },
  });
  for (const m of overdue) {
    await prisma.maintenancePlan.update({ where: { id: m.id }, data: { status: 'OVERDUE' } });
    result.overdueMarked++;
    await notify([...managers, m.technicianId], {
      type: 'OVERDUE',
      title: `Gecikmiş bakım: ${m.vessel.name}`,
      body: m.title,
      link: `/maintenance?id=${m.id}`,
      entityType: 'MaintenancePlan',
      entityId: m.id,
      dedupeKey: `maint-overdue-${m.id}`,
    });
  }

  const horizon = new Date(now.getTime() + settings.reminders.upcomingMaintenanceDays * 864e5);
  const upcoming = await prisma.maintenancePlan.findMany({
    where: { status: 'PLANNED', plannedDate: { gte: today0, lte: horizon } },
    include: { vessel: { select: { id: true, name: true } } },
  });
  for (const m of upcoming) {
    result.upcomingNotified += await notify([...managers, m.technicianId], {
      type: 'MAINTENANCE_UPCOMING',
      title: `Yaklaşan bakım: ${m.vessel.name}`,
      body: `${m.title} · ${m.plannedDate.toLocaleDateString('tr-TR')}`,
      link: `/maintenance?id=${m.id}`,
      entityType: 'MaintenancePlan',
      entityId: m.id,
      dedupeKey: `maint-upcoming-${m.id}`,
    });
  }

  const hourPlans = await prisma.maintenancePlan.findMany({
    where: { status: { in: ['PLANNED', 'OVERDUE'] }, dueEngineHours: { not: null }, engineId: { not: null } },
    include: { engine: true, vessel: { select: { name: true } } },
  });
  for (const m of hourPlans) {
    if (!m.engine || m.dueEngineHours == null) continue;
    const remaining = m.dueEngineHours - m.engine.hours;
    if (remaining <= settings.reminders.engineHoursThreshold) {
      result.engineHourNotified += await notify([...managers, m.technicianId], {
        type: 'MAINTENANCE_UPCOMING',
        title: `Motor saati bakımı: ${m.vessel.name}`,
        body: `${m.title} · ${m.engine.position} ${m.engine.hours} / ${m.dueEngineHours} saat${remaining <= 0 ? ' (aşıldı)' : ''}`,
        link: `/maintenance?id=${m.id}`,
        entityType: 'MaintenancePlan',
        entityId: m.id,
        dedupeKey: `maint-hours-${m.id}-${remaining <= 0 ? 'over' : 'near'}`,
      });
      if (remaining <= 0 && m.status !== 'OVERDUE') await prisma.maintenancePlan.update({ where: { id: m.id }, data: { status: 'OVERDUE' } });
    }
  }

  const lateWOs = await prisma.workOrder.findMany({
    where: { status: { in: ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUIRED'] }, plannedEnd: { lt: now } },
    select: { id: true, number: true, title: true, technicianId: true },
  });
  for (const w of lateWOs) {
    result.overdueWorkOrders += await notify([...managers, w.technicianId], {
      type: 'OVERDUE',
      title: `Geciken iş: ${w.number}`,
      body: w.title,
      link: `/work-orders/${w.id}`,
      entityType: 'WorkOrder',
      entityId: w.id,
      dedupeKey: `wo-overdue-${w.id}`,
    });
  }
  // Pazartesi: geçen haftanın bakım ve servis raporları (taslak)
  (result as any).weeklyReports = await autoWeeklyReports(now);
  return result;
}

export function startScheduler() {
  const tick = () => runScheduledJobs().catch((e) => console.error('[scheduler]', e));
  setTimeout(tick, 5_000);
  return setInterval(tick, config.schedulerIntervalMin * 60_000);
}
