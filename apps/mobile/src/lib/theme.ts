export const C = {
  navy: '#0B2342',
  deep: '#07182E',
  marine: '#1767AD',
  sky: '#EAF3FC',
  bg: '#F4F7FB',
  card: '#FFFFFF',
  text: '#13253B',
  text2: '#3F5268',
  muted: '#6B7C90',
  border: '#E2E9F1',
  ok: '#16A34A',
  okBg: '#E8F7EE',
  warn: '#E07B00',
  warnBg: '#FFF3E2',
  danger: '#DC2626',
  dangerBg: '#FDECEC',
  violet: '#6D4BD8',
  violetBg: '#F0ECFD',
  neutralBg: '#EEF2F6',
};

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'violet';
export const TONES: Record<Tone, [string, string]> = {
  ok: [C.okBg, '#13803C'],
  warn: [C.warnBg, '#B86200'],
  danger: [C.dangerBg, '#C11F1F'],
  info: [C.sky, C.marine],
  neutral: [C.neutralBg, '#55677C'],
  violet: [C.violetBg, C.violet],
};

export const WO_TONE: Record<string, Tone> = {
  REQUESTED: 'neutral', EVALUATION: 'violet', PLANNED: 'info', ASSIGNED: 'info', IN_PROGRESS: 'warn', TECHNICAL_REVIEW: 'violet',
  COMPLETED: 'ok', PUBLISHED: 'ok', CLOSED: 'neutral', ON_HOLD: 'warn', REVISION_REQUIRED: 'danger', CANCELLED: 'neutral',
};
export const PRIORITY_TONE: Record<string, Tone> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warn', CRITICAL: 'danger' };
export const MAINT_TONE: Record<string, Tone> = { PLANNED: 'info', IN_PROGRESS: 'warn', COMPLETED: 'ok', OVERDUE: 'danger', CANCELLED: 'neutral' };
export const RESULT_COLOR: Record<string, string> = { OK: C.ok, ATTENTION: C.warn, FAULT: C.danger, NA: '#8396AB' };

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtMoney = (n?: number | null, cur = 'EUR') => (n == null ? '—' : `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n)} ${cur === 'EUR' ? '€' : cur}`);
export function relTime(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 604800) return `${Math.floor(s / 86400)} gün önce`;
  return fmtDate(d);
}
export const initials = (n?: string) => (n ?? '?').replace(/^(Kpt\.|M\/Y)\s*/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR');
