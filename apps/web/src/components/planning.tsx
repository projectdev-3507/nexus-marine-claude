import { X } from 'lucide-react';

/** Periyodik bakım: haftanın günleri (0=Paz … 6=Cmt), ayın günü veya gün aralığı */
export type RepeatMode = 'none' | 'weekly' | 'monthly' | 'interval';
export interface RepeatValue { mode: RepeatMode; weekdays: number[]; monthDay: string; intervalDays: string }

/** Pazartesi ile başlayan sıra */
export const WEEKDAYS: Array<[number, string, string]> = [
  [1, 'Pzt', 'Pazartesi'],
  [2, 'Sal', 'Salı'],
  [3, 'Çar', 'Çarşamba'],
  [4, 'Per', 'Perşembe'],
  [5, 'Cum', 'Cuma'],
  [6, 'Cmt', 'Cumartesi'],
  [0, 'Paz', 'Pazar'],
];

export const repeatFrom = (m: any): RepeatValue => ({
  mode: m?.repeatWeekdays?.length ? 'weekly' : m?.repeatMonthDay ? 'monthly' : m?.intervalDays ? 'interval' : 'none',
  weekdays: m?.repeatWeekdays ?? [],
  monthDay: m?.repeatMonthDay ? String(m.repeatMonthDay) : '',
  intervalDays: m?.intervalDays ? String(m.intervalDays) : '',
});

/** API gövdesi için alanlar */
export const repeatBody = (r: RepeatValue) => ({
  repeatWeekdays: r.mode === 'weekly' ? r.weekdays : [],
  repeatMonthDay: r.mode === 'monthly' && r.monthDay ? Number(r.monthDay) : null,
  intervalDays: r.mode === 'interval' && r.intervalDays ? Number(r.intervalDays) : null,
});

export const repeatValid = (r: RepeatValue) => (r.mode === 'weekly' ? r.weekdays.length > 0 : r.mode === 'monthly' ? Number(r.monthDay) >= 1 && Number(r.monthDay) <= 31 : r.mode === 'interval' ? Number(r.intervalDays) > 0 : true);

/** "Her hafta · Pzt", "Haftada 2 · Çar, Per", "Her ay 15. gün", "180 günde bir" */
export function repeatText(m: { repeatWeekdays?: number[]; repeatMonthDay?: number | null; intervalDays?: number | null }) {
  const wd = m.repeatWeekdays ?? [];
  if (wd.length) return `${wd.length === 1 ? 'Her hafta' : wd.length === 7 ? 'Her gün' : `Haftada ${wd.length}`} · ${WEEKDAYS.filter(([d]) => wd.includes(d)).map(([, s]) => s).join(', ')}`;
  if (m.repeatMonthDay) return `Her ay ${m.repeatMonthDay}. gün`;
  if (m.intervalDays) return `${m.intervalDays} günde bir`;
  return '';
}

export function RepeatPicker({ value, onChange, allowInterval = true }: { value: RepeatValue; onChange: (v: RepeatValue) => void; allowInterval?: boolean }) {
  const modes: Array<[RepeatMode, string]> = [['none', 'Tek seferlik'], ['weekly', 'Haftalık'], ['monthly', 'Aylık'], ...(allowInterval ? [['interval', 'Gün aralığı'] as [RepeatMode, string]] : [])];
  const toggle = (d: number) => onChange({ ...value, weekdays: value.weekdays.includes(d) ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d] });
  return (
    <div className="repeat-picker">
      <div className="seg">
        {modes.map(([k, l]) => <button type="button" key={k} className={value.mode === k ? 'active' : ''} onClick={() => onChange({ ...value, mode: k })}>{l}</button>)}
      </div>
      {value.mode === 'weekly' && (
        <div className="rp-row">
          <div className="weekday-chips">
            {WEEKDAYS.map(([d, s, full]) => <button type="button" key={d} title={full} className={value.weekdays.includes(d) ? 'on' : ''} onClick={() => toggle(d)}>{s}</button>)}
          </div>
          <span className="xs muted">{value.weekdays.length ? repeatText({ repeatWeekdays: value.weekdays }) : 'Bakımın yapılacağı günleri seçin (örn. haftada 2 için Çar + Per)'}</span>
        </div>
      )}
      {value.mode === 'monthly' && (
        <div className="rp-row">
          <span className="small">Her ayın</span>
          <input className="input sm" style={{ width: 70 }} type="number" min={1} max={31} value={value.monthDay} placeholder="1" onChange={(e) => onChange({ ...value, monthDay: e.target.value })} />
          <span className="small">. günü</span>
        </div>
      )}
      {value.mode === 'interval' && (
        <div className="rp-row">
          <input className="input sm" style={{ width: 90 }} type="number" min={1} value={value.intervalDays} placeholder="180" onChange={(e) => onChange({ ...value, intervalDays: e.target.value })} />
          <span className="small">günde bir (iş tamamlanınca sonraki planlanır)</span>
        </div>
      )}
      {(value.mode === 'weekly' || value.mode === 'monthly') && <div className="xs muted">Tüm tarihler bitiş tarihine kadar otomatik planlanır ve takvimde görünür (varsayılan 1 yıl; bitiş tarihini değiştirebilirsiniz).</div>}
    </div>
  );
}

/** Birden fazla teknisyen: sorumlu dışındaki ek teknisyenler */
export function HelperPicker({ techs, value, exclude, onChange, disabled }: { techs: Array<{ id: string; name: string }>; value: string[]; exclude?: string | null; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const free = techs.filter((t) => t.id !== exclude && !value.includes(t.id));
  return (
    <div className="helper-picker">
      {value.filter((id) => id !== exclude).map((id) => (
        <span key={id} className="chip">
          {techs.find((t) => t.id === id)?.name ?? 'Teknisyen'}
          {!disabled && <button type="button" aria-label="Kaldır" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>}
        </span>
      ))}
      {!disabled && free.length > 0 && (
        <select className="select sm" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">+ Teknisyen ekle</option>
          {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {disabled && !value.length && <span className="muted small">—</span>}
    </div>
  );
}

/** Sorumlu + ek teknisyen adları: "Ali Usta +2" */
export const teamText = (r: { technician?: { name: string } | null; helpers?: Array<{ name: string }> }) =>
  [r.technician?.name, ...(r.helpers ?? []).map((h) => h.name)].filter(Boolean).join(', ');

/** Yerel bugün (yyyy-mm-dd) */
export const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
/** yyyy-mm-dd + n ay */
export const addMonthsStr = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const x = new Date(y, m - 1 + n, Math.min(d, last));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
/** Periyot değişince bitiş: periyodikte başlangıç + 1 yıl, tek seferlikte başlangıç günü */
export const defaultEnd = (mode: RepeatMode, start: string) => (mode === 'none' ? start : addMonthsStr(start, 12));

/** Paket metni: "* madde" / "- madde" / "• madde" satırları adım, üstteki satırlar başlık + açıklama */
export function parsePackage(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isBullet = (l: string) => /^([*\-•·–]|\d+[.)])\s+/.test(l);
  const steps = lines.filter(isBullet).map((l) => l.replace(/^([*\-•·–]|\d+[.)])\s+/, '').trim()).filter(Boolean);
  const head = lines.filter((l) => !isBullet(l));
  return { title: head[0] ?? '', description: head.slice(1).join(' · '), steps, hasBullets: steps.length > 0 };
}
