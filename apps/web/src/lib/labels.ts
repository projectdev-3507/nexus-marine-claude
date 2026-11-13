import {
  WORK_ORDER_STATUS_LABELS,
  PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  MAINTENANCE_CATEGORIES,
  QUOTE_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TYPES,
  INSPECTION_RESULT_LABELS,
  ROLE_LABELS,
} from '@nexus/shared';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'violet' | 'navy';

export const WO_TONE: Record<string, Tone> = {
  REQUESTED: 'neutral',
  EVALUATION: 'violet',
  PLANNED: 'info',
  ASSIGNED: 'info',
  IN_PROGRESS: 'warn',
  TECHNICAL_REVIEW: 'violet',
  COMPLETED: 'ok',
  PUBLISHED: 'ok',
  CLOSED: 'neutral',
  ON_HOLD: 'warn',
  REVISION_REQUIRED: 'danger',
  CANCELLED: 'neutral',
};
export const PRIORITY_TONE: Record<string, Tone> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warn', CRITICAL: 'danger' };
export const MAINT_TONE: Record<string, Tone> = { PLANNED: 'info', IN_PROGRESS: 'warn', COMPLETED: 'ok', OVERDUE: 'danger', CANCELLED: 'neutral' };
export const QUOTE_TONE: Record<string, Tone> = { DRAFT: 'neutral', SENT: 'info', APPROVED: 'ok', REJECTED: 'danger', EXPIRED: 'neutral' };
export const REPORT_TONE: Record<string, Tone> = { DRAFT: 'neutral', IN_REVIEW: 'violet', APPROVED: 'info', PUBLISHED: 'ok', SUPERSEDED: 'neutral' };
export const INSP_TONE: Record<string, Tone> = { DRAFT: 'neutral', SUBMITTED: 'warn', APPROVED: 'ok' };
export const RESULT_TONE: Record<string, Tone> = { OK: 'ok', ATTENTION: 'warn', FAULT: 'danger', NA: 'neutral' };
export const FAULT_TONE: Record<string, Tone> = { OPEN: 'danger', IN_PROGRESS: 'warn', RESOLVED: 'ok' };
export const PROJECT_TONE: Record<string, Tone> = { PLANNING: 'neutral', ACTIVE: 'info', ON_HOLD: 'warn', DELIVERED: 'ok', CANCELLED: 'neutral' };
export const PHASE_TONE: Record<string, Tone> = { NOT_STARTED: 'neutral', IN_PROGRESS: 'warn', DONE: 'ok' };
export const CR_TONE: Record<string, Tone> = { PENDING: 'warn', APPROVED: 'ok', REJECTED: 'danger' };
export const CUSTOMER_TONE: Record<string, Tone> = { ACTIVE: 'ok', PENDING: 'warn', INACTIVE: 'neutral' };

export const INSP_STATUS_LABELS: Record<string, string> = { DRAFT: 'Taslak', SUBMITTED: 'Onay Bekliyor', APPROVED: 'Admin onayladı' };
export const FAULT_STATUS_LABELS: Record<string, string> = { OPEN: 'Açık', IN_PROGRESS: 'İşlemde', RESOLVED: 'Giderildi' };
export const PROJECT_STATUS_LABELS: Record<string, string> = { PLANNING: 'Planlama', ACTIVE: 'Aktif', ON_HOLD: 'Beklemede', DELIVERED: 'Teslim Edildi', CANCELLED: 'İptal' };
export const PHASE_STATUS_LABELS: Record<string, string> = { NOT_STARTED: 'Başlamadı', IN_PROGRESS: 'Devam Ediyor', DONE: 'Tamamlandı' };
export const CR_STATUS_LABELS: Record<string, string> = { PENDING: 'Karar Bekliyor', APPROVED: 'Onaylandı', REJECTED: 'Reddedildi' };
export const CUSTOMER_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Aktif', PENDING: 'Beklemede', INACTIVE: 'Pasif' };
export const DOC_CATEGORY_LABELS: Record<string, string> = { CONTRACT: 'Sözleşme', CERTIFICATE: 'Sertifika', INSURANCE: 'Sigorta', TECHNICAL: 'Teknik Belge', WARRANTY: 'Garanti', INVOICE: 'Fatura', OTHER: 'Diğer' };
export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => [k, v.label]));
/** Bakım başlıkları dinamiktir (lib/maintCats.ts API'den gelen başlıklarla günceller) */
export const CATEGORY_SHORT: Record<string, string> = { MECHANICAL: 'Makine', ELECTRICAL: 'Elektrik', HAUL_OUT: 'Kara Bakımı', COSMETIC: 'Kozmetik' };
export const TECH_STATUS: Record<string, [string, Tone]> = { ON_TASK: ['Görevde', 'warn'], ASSIGNED: ['Atanmış iş var', 'info'], AVAILABLE: ['Müsait', 'ok'] };

export {
  WORK_ORDER_STATUS_LABELS,
  PRIORITY_LABELS,
  MAINTENANCE_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TYPES,
  INSPECTION_RESULT_LABELS,
  ROLE_LABELS,
};

/** Müşteri arıza durumu: iş emri açıldıysa onun ilerlemesine göre (iş emri müşteriye gösterilmez) */
export function faultClientStatus(f: { status: string; workOrder?: { status: string } | null; progress?: { status: string } | null }): [string, Tone] {
  if (f.status === 'RESOLVED') return ['Giderildi', 'ok'];
  const w = f.progress?.status ?? f.workOrder?.status;
  if (!w) return ['Talebiniz alındı', 'warn'];
  if (['REQUESTED', 'EVALUATION'].includes(w)) return ['İnceleniyor', 'warn'];
  if (['PLANNED', 'ASSIGNED'].includes(w)) return ['Planlandı', 'info'];
  if (['IN_PROGRESS', 'REVISION_REQUIRED'].includes(w)) return ['İşlemde', 'info'];
  if (w === 'ON_HOLD') return ['Beklemede', 'warn'];
  if (['TECHNICAL_REVIEW', 'COMPLETED'].includes(w)) return ['Kontrol ediliyor', 'info'];
  if (['PUBLISHED', 'CLOSED'].includes(w)) return ['Giderildi', 'ok'];
  if (w === 'CANCELLED') return ['İptal edildi', 'neutral'];
  return ['İşlemde', 'info'];
}
/** Son hareket zamanı (arıza açılışı, iş emri güncellemesi, giderilme) */
export const faultActivity = (f: any) => Math.max(+new Date(f.createdAt), f.resolvedAt ? +new Date(f.resolvedAt) : 0, f.workOrder?.updatedAt ? +new Date(f.workOrder.updatedAt) : 0);
