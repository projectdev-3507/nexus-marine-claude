import type { Prisma, WorkOrder, WorkOrderStatus as DbStatus } from '@prisma/client';
import { canTransition, TECHNICIAN_TRANSITIONS, WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from '@nexus/shared';
import { prisma } from '../db';
import type { AuthUser } from '../lib/auth';
import { badRequest, forbidden } from '../lib/errors';
import { managerIds, notify, vesselClientUserIds } from './notify';

/** Sorumlu veya ek teknisyen mi */
export const isAssigned = (wo: { technicianId: string | null; helperIds?: string[] }, userId: string) => wo.technicianId === userId || !!wo.helperIds?.includes(userId);

/**
 * İş emri durum geçişi. Her geçiş kullanıcı/zaman/eski/yeni durum ile kayıt altına alınır,
 * ilgili kişilere bildirim gönderilir.
 */
export async function transitionWorkOrder(
  user: AuthUser,
  wo: WorkOrder,
  to: WorkOrderStatus,
  opts: { note?: string; customerSummary?: string } = {},
) {
  const from = wo.status as WorkOrderStatus;
  if (from === to) return wo;
  if (!canTransition(from, to)) {
    throw badRequest(`"${WORK_ORDER_STATUS_LABELS[from]}" durumundan "${WORK_ORDER_STATUS_LABELS[to]}" durumuna geçilemez`);
  }
  if (!user.isManager) {
    const allowed = TECHNICIAN_TRANSITIONS.some(([f, t]) => f === from && t === to);
    if (!allowed || !user.permissions.has('workorders.execute') || !isAssigned(wo, user.id)) throw forbidden();
  }
  if (to === 'ASSIGNED' && !wo.technicianId) throw badRequest('Önce teknisyen atanmalı');
  if (to === 'PUBLISHED' && !(opts.customerSummary ?? wo.customerSummary)) {
    throw badRequest('Müşteriye yayınlamadan önce müşteri özeti girilmelidir');
  }

  const now = new Date();
  const data: Prisma.WorkOrderUncheckedUpdateInput = { status: to as DbStatus };
  if (to === 'IN_PROGRESS' && !wo.startedAt) data.startedAt = now;
  if (to === 'TECHNICAL_REVIEW') {
    data.finishedAt = now;
    if (wo.startedAt && wo.actualHours == null) {
      data.actualHours = Math.round(((now.getTime() - wo.startedAt.getTime()) / 36e5) * 10) / 10;
    }
  }
  if (to === 'PUBLISHED') data.publishedAt = now;
  if (opts.customerSummary !== undefined) data.customerSummary = opts.customerSummary;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.workOrder.update({ where: { id: wo.id }, data });
    await tx.workOrderHistory.create({
      data: { workOrderId: wo.id, userId: user.id, fromStatus: from as DbStatus, toStatus: to as DbStatus, note: opts.note },
    });
    if (to === 'COMPLETED') {
      // Bağlı bakım planını tamamla, tekrarlı ise bir sonrakini planla
      const plan = await tx.maintenancePlan.findUnique({ where: { workOrderId: wo.id } });
      if (plan && plan.status !== 'COMPLETED') {
        await tx.maintenancePlan.update({
          where: { id: plan.id },
          data: { status: 'COMPLETED', endDate: now, actualHours: u.actualHours ?? plan.actualHours },
        });
        await scheduleNextRecurrence(tx, plan, now);
      }
      await tx.fault.updateMany({ where: { workOrderId: wo.id, status: { not: 'RESOLVED' } }, data: { status: 'RESOLVED', resolvedAt: now } });
    }
    return u;
  });

  const link = `/work-orders/${wo.id}`;
  if (to === 'TECHNICAL_REVIEW') {
    await notify(await managerIds(), {
      type: 'REVIEW_REQUIRED',
      title: `Kontrol bekliyor: ${wo.number}`,
      body: `${wo.title} teknisyen tarafından tamamlandı ve teknik kontrol bekliyor.`,
      link,
      entityType: 'WorkOrder',
      entityId: wo.id,
      dedupeKey: `wo-review-${wo.id}-${now.toISOString().slice(0, 16)}`,
    }, user.id);
  }
  if (to === 'REVISION_REQUIRED' && wo.technicianId) {
    await notify([wo.technicianId, ...wo.helperIds], {
      type: 'TASK_ASSIGNED',
      title: `Revizyon gerekli: ${wo.number}`,
      body: opts.note ?? wo.title,
      link,
      entityType: 'WorkOrder',
      entityId: wo.id,
    });
  }
  if (to === 'PUBLISHED') {
    const fault = await prisma.fault.findFirst({ where: { workOrderId: wo.id }, select: { id: true } });
    await notify(await vesselClientUserIds(wo.vesselId), {
      type: 'SERVICE_COMPLETED',
      title: fault ? 'Arızanız giderildi' : 'Servis tamamlandı',
      body: `${wo.title} işlemi tamamlandı. Detayları inceleyebilirsiniz.`,
      link: fault ? `/faults/${fault.id}` : link,
      entityType: 'WorkOrder',
      entityId: wo.id,
      dedupeKey: `wo-published-${wo.id}`,
    });
  }
  return updated;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function scheduleNextRecurrence(
  tx: Tx,
  plan: { id: string; title: string; category: any; subType: string | null; vesselId: string; description: string | null; technicianId: string | null; helperIds: string[]; priority: any; intervalDays: number | null; intervalEngineHours: number | null; engineId: string | null; estimatedHours: number | null; plannedMaterials: any; repeatWeekdays: number[]; repeatMonthDay: number | null; repeatUntil: Date | null; checklist?: any },
  from: Date,
) {
  // Haftalık / aylık seriler zamanlayıcı tarafından önceden oluşturulur
  if (plan.repeatWeekdays.length || plan.repeatMonthDay) return;
  if (!plan.intervalDays && !plan.intervalEngineHours) return;
  let dueEngineHours: number | undefined;
  if (plan.intervalEngineHours && plan.engineId) {
    const engine = await tx.engine.findUnique({ where: { id: plan.engineId } });
    if (engine) dueEngineHours = engine.hours + plan.intervalEngineHours;
  }
  const plannedDate = new Date(from.getTime() + (plan.intervalDays ?? 180) * 864e5);
  // Bitiş tarihi geçtiyse periyodik bakım sona erer
  if (plan.repeatUntil && plannedDate > plan.repeatUntil && !plan.intervalEngineHours) return;
  await tx.maintenancePlan.create({
    data: {
      title: plan.title,
      category: plan.category,
      subType: plan.subType,
      vesselId: plan.vesselId,
      description: plan.description,
      technicianId: plan.technicianId,
      helperIds: plan.helperIds,
      priority: plan.priority,
      intervalDays: plan.intervalDays,
      repeatUntil: plan.repeatUntil,
      checklist: Array.isArray(plan.checklist) ? plan.checklist.map((x: any) => ({ label: x.label, done: false })) : undefined,
      intervalEngineHours: plan.intervalEngineHours,
      engineId: plan.engineId,
      estimatedHours: plan.estimatedHours,
      plannedMaterials: plan.plannedMaterials ?? undefined,
      dueEngineHours,
      plannedDate,
    },
  });
}

/** Müşteri tarafına iş emrinin güvenli görünümü — dahili notlar, maliyetler, yayınlanmamış fotoğraflar gizlenir */
export function sanitizeWorkOrderForClient<T extends Record<string, any>>(wo: T) {
  const published = ['PUBLISHED', 'CLOSED'].includes(wo.status);
  const { materials: _m, comments, checklist, plannedHours: _ph, actualHours, history, technician, helperIds: _h, ...rest } = wo;
  return {
    ...rest,
    technician: technician ? { id: technician.id, name: technician.name } : null,
    actualHours: published ? actualHours : undefined,
    checklist: published ? checklist : undefined,
    comments: Array.isArray(comments) ? comments.filter((c: any) => !c.internal) : undefined,
    history: Array.isArray(history) ? history.map((h: any) => ({ toStatus: h.toStatus, createdAt: h.createdAt })) : undefined,
    customerSummary: published ? rest.customerSummary : null,
  };
}
