import type { Fault, Priority } from '@prisma/client';
import { prisma } from '../db';
import type { AuthUser } from '../lib/auth';
import { badRequest } from '../lib/errors';
import { nextNumber } from '../lib/numbering';
import { managerIds, notify } from './notify';

export async function notifyFault(fault: Fault, vesselName: string, excludeUserId?: string) {
  await notify(
    await managerIds(),
    {
      type: 'CRITICAL_FAULT',
      title: `${fault.severity === 'CRITICAL' ? 'KRİTİK ' : ''}Arıza: ${vesselName}`,
      body: fault.title,
      link: `/faults?id=${fault.id}`,
      entityType: 'Fault',
      entityId: fault.id,
      dedupeKey: `fault-${fault.id}`,
      fromClient: fault.source === 'CUSTOMER',
    },
    excludeUserId,
  );
}

/** Arızadan iş emri açar ve arızayı iş emrine bağlar. */
export async function createWorkOrderFromFault(user: AuthUser, faultId: string, opts: { technicianId?: string; priority?: Priority } = {}) {
  const fault = await prisma.fault.findUniqueOrThrow({ where: { id: faultId }, include: { inspectionItem: { include: { inspection: true } } } });
  if (fault.workOrderId) throw badRequest('Bu arıza için zaten iş emri açılmış');
  return prisma.$transaction(async (tx) => {
    const number = await nextNumber('WO', tx);
    const status = opts.technicianId ? 'ASSIGNED' : 'REQUESTED';
    const desc = [
      fault.description,
      fault.inspectionItem ? `Kaynak: Denetim ${fault.inspectionItem.inspection.number} · ${fault.inspectionItem.itemCode} ${fault.inspectionItem.label}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const wo = await tx.workOrder.create({
      data: {
        number,
        vesselId: fault.vesselId,
        title: `Arıza giderme: ${fault.title}`,
        description: desc || undefined,
        priority: opts.priority ?? fault.severity,
        technicianId: opts.technicianId,
        requestedById: user.id,
        status,
        checklist: [{ label: 'Arıza tespiti doğrulandı', done: false }, { label: 'Onarım yapıldı', done: false }, { label: 'Test edildi', done: false }],
      },
    });
    await tx.workOrderHistory.create({ data: { workOrderId: wo.id, userId: user.id, toStatus: status, note: 'Arıza kaydından oluşturuldu' } });
    await tx.fault.update({ where: { id: fault.id }, data: { workOrderId: wo.id, status: 'IN_PROGRESS' } });
    return wo;
  });
}
