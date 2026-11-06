import { Router } from 'express';
import { z } from 'zod';
import { OPEN_WORK_ORDER_STATUSES, WORK_ORDER_STATUSES } from '@nexus/shared';
import { prisma } from '../db';
import { ah } from '../lib/errors';
import { requirePerm, vesselFilter, type AuthedRequest } from '../lib/auth';
import { startOfWeek, workOrderScope } from './workorders';

export const dashboardRouter = Router();
export const calendarRouter = Router();
export const analyticsRouter = Router();

dashboardRouter.get(
  '/',
  requirePerm('dashboard.view'),
  ah<AuthedRequest>(async (req, res) => {
    const user = req.user;
    const now = new Date();
    const wk0 = startOfWeek(now);
    const wk1 = new Date(wk0.getTime() + 7 * 864e5);
    const vf = vesselFilter(user);
    const wos = workOrderScope(user);
    const vesselWhere = user.vesselIds === null ? { isActive: true } : { id: { in: user.vesselIds }, isActive: true };

    const [activeVessels, weekMaint, weekWO, openWO, completedTasks, weekItems, upcoming, faults, statusGroups] = await Promise.all([
      prisma.vessel.count({ where: vesselWhere }),
      prisma.maintenancePlan.count({ where: { ...vf, plannedDate: { gte: wk0, lt: wk1 }, status: { not: 'CANCELLED' } } }),
      prisma.workOrder.count({ where: { ...wos, plannedStart: { gte: wk0, lt: wk1 } } }),
      prisma.workOrder.count({ where: { ...wos, status: { in: OPEN_WORK_ORDER_STATUSES } } }),
      prisma.workOrder.count({ where: { ...wos, status: { in: ['COMPLETED', 'PUBLISHED', 'CLOSED'] }, finishedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
      prisma.workOrder.findMany({
        where: { ...wos, plannedStart: { gte: wk0, lt: wk1 }, status: { not: 'CANCELLED' } },
        select: { id: true, number: true, title: true, status: true, priority: true, plannedStart: true, plannedEnd: true, vessel: { select: { name: true } }, technician: { select: { name: true } } },
        orderBy: { plannedStart: 'asc' },
      }),
      prisma.workOrder.findMany({
        where: { ...wos, status: { in: ['PLANNED', 'ASSIGNED', 'REQUESTED', 'EVALUATION'] }, plannedStart: { gte: now } },
        select: { id: true, number: true, title: true, status: true, priority: true, plannedStart: true, vessel: { select: { name: true, marina: true } }, technician: { select: { name: true } } },
        orderBy: { plannedStart: 'asc' },
        take: 6,
      }),
      user.isStaff
        ? prisma.fault.findMany({
            where: { ...vf, status: { not: 'RESOLVED' }, severity: { in: ['CRITICAL', 'HIGH'] } },
            select: { id: true, title: true, severity: true, status: true, createdAt: true, vessel: { select: { id: true, name: true } }, workOrder: { select: { id: true, number: true } } },
            orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
            take: 6,
          })
        : Promise.resolve([]),
      prisma.workOrder.groupBy({ by: ['status'], where: wos, _count: true }),
    ]);

    // Haftalık takvime bakım planlarını da ekle
    const weekMaintItems = await prisma.maintenancePlan.findMany({
      where: { ...vf, plannedDate: { gte: wk0, lt: wk1 }, workOrderId: null, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
      select: { id: true, title: true, plannedDate: true, status: true, priority: true, vessel: { select: { name: true } }, technician: { select: { name: true } } },
    });

    // Aylık servis istatistikleri (son 6 ay)
    const sixAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const [doneRecent, createdRecent] = await Promise.all([
      prisma.workOrder.findMany({ where: { ...wos, finishedAt: { gte: sixAgo } }, select: { finishedAt: true, category: true } }),
      prisma.workOrder.findMany({ where: { ...wos, createdAt: { gte: sixAgo } }, select: { createdAt: true } }),
    ]);
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const inMonth = (x: Date | null) => !!x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
      const done = doneRecent.filter((w) => inMonth(w.finishedAt));
      return {
        month: key,
        label: d.toLocaleDateString('tr-TR', { month: 'short' }),
        completed: done.length,
        created: createdRecent.filter((w) => inMonth(w.createdAt)).length,
        MECHANICAL: done.filter((w) => w.category === 'MECHANICAL').length,
        ELECTRICAL: done.filter((w) => w.category === 'ELECTRICAL').length,
        HAUL_OUT: done.filter((w) => w.category === 'HAUL_OUT').length,
        COSMETIC: done.filter((w) => w.category === 'COSMETIC').length,
      };
    });

    const technicians = user.isManager
      ? await (async () => {
          const techs = await prisma.user.findMany({ where: { roles: { has: 'TECHNICIAN' }, isActive: true }, select: { id: true, name: true, title: true, avatarUrl: true } });
          const [active, open] = await Promise.all([
            prisma.workOrder.findMany({ where: { status: 'IN_PROGRESS', technicianId: { in: techs.map((t) => t.id) } }, select: { technicianId: true, number: true, title: true, vessel: { select: { name: true } } } }),
            prisma.workOrder.groupBy({ by: ['technicianId'], where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'REVISION_REQUIRED'] } }, _count: true }),
          ]);
          return techs.map((t) => {
            const cur = active.find((a) => a.technicianId === t.id);
            const cnt = open.find((o) => o.technicianId === t.id)?._count ?? 0;
            return { ...t, status: cur ? 'ON_TASK' : cnt ? 'ASSIGNED' : 'AVAILABLE', current: cur ?? null, openCount: cnt };
          });
        })()
      : [];

    const statusDistribution = WORK_ORDER_STATUSES.map((s) => ({ status: s, count: statusGroups.find((g) => g.status === s)?._count ?? 0 })).filter((s) => s.count > 0);

    const overdueMaint = await prisma.maintenancePlan.count({ where: { ...vf, status: 'OVERDUE' } });
    const reviewPending = user.isManager ? await prisma.workOrder.count({ where: { status: 'TECHNICAL_REVIEW' } }) : 0;

    res.json({
      kpis: { activeVessels, weekMaintenance: weekMaint + weekWO, openWorkOrders: openWO, completedTasks, overdueMaintenance: overdueMaint, reviewPending },
      week: {
        start: wk0,
        items: [
          ...weekItems.map((w) => ({ kind: 'WORK_ORDER', id: w.id, title: w.title, number: w.number, date: w.plannedStart, end: w.plannedEnd, status: w.status, priority: w.priority, vessel: w.vessel.name, technician: w.technician?.name })),
          ...weekMaintItems.map((m) => ({ kind: 'MAINTENANCE', id: m.id, title: m.title, date: m.plannedDate, status: m.status, priority: m.priority, vessel: m.vessel.name, technician: m.technician?.name })),
        ],
      },
      upcoming,
      criticalFaults: faults,
      technicians,
      monthly: months,
      statusDistribution,
    });
  }),
);

/** Takvim: iş emirleri + bakım planları + proje aşamaları */
calendarRouter.get(
  '/',
  requirePerm('calendar.view', 'maintenance.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date(), technicianId: z.string().optional(), vesselId: z.string().optional() }).parse(req.query);
    const vf = vesselFilter(req.user);
    const extra = { ...(q.vesselId ? { vesselId: q.vesselId } : {}), ...(q.technicianId ? { technicianId: q.technicianId } : {}) };
    const [wos, plans, phases] = await Promise.all([
      prisma.workOrder.findMany({
        where: { ...workOrderScope(req.user), ...extra, status: { not: 'CANCELLED' }, OR: [{ plannedStart: { gte: q.from, lte: q.to } }, { plannedEnd: { gte: q.from, lte: q.to } }] },
        select: { id: true, number: true, title: true, status: true, priority: true, plannedStart: true, plannedEnd: true, vessel: { select: { id: true, name: true } }, technician: { select: { id: true, name: true } } },
      }),
      prisma.maintenancePlan.findMany({
        where: { ...vf, ...extra, workOrderId: null, status: { not: 'CANCELLED' }, plannedDate: { gte: q.from, lte: q.to } },
        select: { id: true, title: true, status: true, priority: true, plannedDate: true, category: true, vessel: { select: { id: true, name: true } }, technician: { select: { id: true, name: true } } },
      }),
      req.user.isStaff
        ? prisma.projectPhase.findMany({
            where: { project: { ...vf, ...(q.vesselId ? { vesselId: q.vesselId } : {}) }, startDate: { lte: q.to }, endDate: { gte: q.from } },
            select: { id: true, name: true, status: true, startDate: true, endDate: true, project: { select: { id: true, name: true, vessel: { select: { name: true } } } } },
          })
        : Promise.resolve([]),
    ]);
    res.json([
      ...wos.map((w) => ({ kind: 'WORK_ORDER', id: w.id, title: w.title, number: w.number, start: w.plannedStart, end: w.plannedEnd ?? w.plannedStart, status: w.status, priority: w.priority, vessel: w.vessel, technician: w.technician })),
      ...plans.map((m) => ({ kind: 'MAINTENANCE', id: m.id, title: m.title, start: m.plannedDate, end: m.plannedDate, status: m.status, priority: m.priority, category: m.category, vessel: m.vessel, technician: m.technician })),
      ...phases.map((p) => ({ kind: 'PROJECT_PHASE', id: p.project.id, title: `${p.project.name} · ${p.name}`, start: p.startDate, end: p.endDate, status: p.status, vessel: { name: p.project.vessel.name } })),
    ]);
  }),
);

/** Yönetim raporları */
analyticsRouter.get(
  '/',
  requirePerm('analytics.view'),
  ah<AuthedRequest>(async (req, res) => {
    const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getFullYear(), to.getMonth() - 11, 1);
    const wos = await prisma.workOrder.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { id: true, status: true, category: true, priority: true, createdAt: true, startedAt: true, finishedAt: true, plannedHours: true, actualHours: true, technicianId: true, vesselId: true, vessel: { select: { name: true } }, technician: { select: { name: true } } },
    });
    const done = wos.filter((w) => w.finishedAt);
    const avgLeadDays = done.length ? done.reduce((s, w) => s + (+w.finishedAt! - +w.createdAt) / 864e5, 0) / done.length : 0;
    const planned = done.filter((w) => w.plannedHours && w.actualHours);
    const effort = planned.length ? planned.reduce((s, w) => s + w.actualHours!, 0) / planned.reduce((s, w) => s + w.plannedHours!, 0) : null;
    const byCat = ['MECHANICAL', 'ELECTRICAL', 'HAUL_OUT', 'COSMETIC'].map((c) => ({ category: c, count: wos.filter((w) => w.category === c).length, hours: done.filter((w) => w.category === c).reduce((s, w) => s + (w.actualHours ?? 0), 0) }));
    const techMap = new Map<string, { name: string; completed: number; hours: number; planned: number }>();
    for (const w of done) {
      if (!w.technicianId) continue;
      const t = techMap.get(w.technicianId) ?? { name: w.technician?.name ?? '-', completed: 0, hours: 0, planned: 0 };
      t.completed++;
      t.hours += w.actualHours ?? 0;
      t.planned += w.plannedHours ?? 0;
      techMap.set(w.technicianId, t);
    }
    const vesselMap = new Map<string, { name: string; count: number }>();
    for (const w of wos) {
      const v = vesselMap.get(w.vesselId) ?? { name: w.vessel.name, count: 0 };
      v.count++;
      vesselMap.set(w.vesselId, v);
    }
    const [faultsBySource, inspections, maintOverdue] = await Promise.all([
      prisma.fault.groupBy({ by: ['source', 'status'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
      prisma.inspection.count({ where: { date: { gte: from, lte: to } } }),
      prisma.maintenancePlan.count({ where: { status: 'OVERDUE' } }),
    ]);
    const monthly: Array<{ month: string; label: string; created: number; completed: number }> = [];
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const m = (x: Date | null) => !!x && x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
      monthly.push({ month: d.toISOString().slice(0, 7), label: d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }), created: wos.filter((w) => m(w.createdAt)).length, completed: done.filter((w) => m(w.finishedAt)).length });
    }
    res.json({
      range: { from, to },
      totals: { workOrders: wos.length, completed: done.length, avgLeadDays: Math.round(avgLeadDays * 10) / 10, effortRatio: effort, inspections, maintenanceOverdue: maintOverdue },
      byCategory: byCat,
      byTechnician: [...techMap.entries()].map(([id, t]) => ({ id, ...t })).sort((a, b) => b.completed - a.completed),
      topVessels: [...vesselMap.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count).slice(0, 10),
      faults: faultsBySource,
      monthly,
    });
  }),
);
