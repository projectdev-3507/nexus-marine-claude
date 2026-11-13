import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Layers, Wrench, CalendarCheck2, X } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { PageHeader } from '../components/ui';
import { addDays, fmtDate, sameDay, startOfWeek } from '../lib/format';
import { MAINTENANCE_STATUS_LABELS, PHASE_STATUS_LABELS, WORK_ORDER_STATUS_LABELS } from '../lib/labels';

/** Müşteri takvimi — ay görünümü + seçilen günün/ayın sade ajandası */
type Kind = 'WORK_ORDER' | 'MAINTENANCE' | 'PROJECT_PHASE';
type Ev = { kind: Kind; id: string; title: string; number?: string; start: string; end?: string | null; status: string; vessel?: { id?: string; name: string }; phase?: string; project?: string };

const KIND: Record<Kind, { label: string; cls: string; icon: ReactNode }> = {
  MAINTENANCE: { label: 'Bakım', cls: 'k-maint', icon: <CalendarClock /> },
  WORK_ORDER: { label: 'Servis', cls: 'k-wo', icon: <Wrench /> },
  PROJECT_PHASE: { label: 'Proje', cls: 'k-proj', icon: <Layers /> },
};
const WD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const day0 = (d: Date | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const diff = (a: Date, b: Date) => Math.round((+day0(a) - +day0(b)) / 864e5);
const covers = (e: Ev, d: Date) => day0(e.start) <= day0(d) && day0(e.end ?? e.start) >= day0(d);
const isDone = (e: Ev) => ['COMPLETED', 'PUBLISHED', 'CLOSED', 'DONE'].includes(e.status);
const statusText = (e: Ev) =>
  ((e.kind === 'WORK_ORDER' ? WORK_ORDER_STATUS_LABELS : e.kind === 'MAINTENANCE' ? MAINTENANCE_STATUS_LABELS : PHASE_STATUS_LABELS) as Record<string, string>)[e.status] ?? e.status;
const title = (e: Ev) => (e.kind === 'PROJECT_PHASE' ? `${e.project ?? ''} · ${e.phase ?? ''}` : e.title.split(' — ')[0]);
function when(e: Ev) {
  const n = diff(new Date(e.start), new Date());
  if (isDone(e)) return 'Tamamlandı';
  if (n === 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  if (n > 1) return `${n} gün sonra`;
  return day0(e.end ?? e.start) >= day0(new Date()) ? 'Devam ediyor' : `${-n} gün önce`;
}

const linkOf = (e: Ev) => (e.kind === 'WORK_ORDER' ? `/work-orders/${e.id}` : e.kind === 'PROJECT_PHASE' ? `/projects/${e.id}` : `/maintenance/${e.id}`);

/** Ajanda satırları (takvim sayfası + ana sayfa) */
function AgendaList({ list }: { list: Ev[] }) {
  const nav = useNavigate();
  return (
    <ul className="pcal-list">
      {list.map((e) => {
        const s = new Date(e.start);
        const multi = e.end && !sameDay(new Date(e.end), s);
        return (
          <li key={`${e.kind}-${e.id}-${e.phase ?? ''}-${e.start}`} className={`${KIND[e.kind].cls}${isDone(e) ? ' done' : ''}`} onClick={() => nav(linkOf(e))}>
            <div className="pcal-date"><b>{s.getDate()}</b><span>{s.toLocaleDateString('tr-TR', { month: 'short' })}</span></div>
            <div className="pcal-body">
              <div className="pcal-kind">{KIND[e.kind].icon}{KIND[e.kind].label}{e.vessel && <em>· {e.vessel.name}</em>}</div>
              <b>{title(e)}</b>
              <small>{multi ? `${fmtDate(e.start)} – ${fmtDate(e.end!)}` : fmtDate(e.start)} · {statusText(e)}</small>
            </div>
            <span className="pcal-when">{when(e)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Ana sayfa: bu ayın programı (seçili tekne) */
export function MonthAgenda({ vesselId }: { vesselId?: string }) {
  const nav = useNavigate();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const all = useApi<Ev[]>('/calendar', { from: from.toISOString(), to: to.toISOString() }).data;
  const list = (all ?? []).filter((e) => !vesselId || e.vessel?.id === vesselId).sort((a, b) => +new Date(a.start) - +new Date(b.start));
  return (
    <section className="card pcal-agenda home-agenda">
      <div className="pcal-agenda-head">
        <div>
          <span>Bu ayın programı</span>
          <h2>{now.toLocaleDateString('tr-TR', { month: 'long' })}</h2>
        </div>
        <button className="pcal-clear" onClick={() => nav('/calendar')}>Takvim <ChevronRight size={14} /></button>
      </div>
      {!all ? <div className="pcal-empty">Yükleniyor…</div> : list.length === 0 ? (
        <div className="pcal-empty"><CalendarCheck2 /><b>Bu ay planlı bir işlem yok</b></div>
      ) : <AgendaList list={list} />}
    </section>
  );
}

export default function PortalCalendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [sel, setSel] = useState<Date | null>(null);
  const [vessel, setVessel] = useState('');
  const vessels = useApi<any>('/vessels', { pageSize: 50 }).data?.items ?? [];

  const gridStart = startOfWeek(cursor);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [+gridStart]);
  const from = days[0];
  const to = addDays(days[41], 1);
  const all = useApi<Ev[]>('/calendar', { from: from.toISOString(), to: to.toISOString() }).data;
  const events = (all ?? []).filter((e) => !vessel || e.vessel?.id === vessel).sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const monthEvents = events.filter((e) => day0(e.start) <= monthEnd && day0(e.end ?? e.start) >= day0(cursor));
  const list = sel ? events.filter((e) => covers(e, sel)) : monthEvents;
  const today = new Date();
  const counts = (['MAINTENANCE', 'WORK_ORDER', 'PROJECT_PHASE'] as Kind[]).map((k) => [k, monthEvents.filter((e) => e.kind === k).length] as const);

  const move = (n: number) => { setSel(null); setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1)); };
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSel(day0(d)); };
  
  return (
    <div>
      <PageHeader title="Takvim" sub="Teknenizin bakım, servis ve proje programı tek bakışta" />

      {vessels.length > 1 && (
        <div className="chips mb-2">
          <button className={!vessel ? 'active' : ''} onClick={() => setVessel('')}>Tüm teknelerim</button>
          {vessels.map((v: any) => <button key={v.id} className={vessel === v.id ? 'active' : ''} onClick={() => setVessel(v.id)}>{v.name}</button>)}
        </div>
      )}

      <div className="pcal">
        <section className="card pcal-month">
          <div className="pcal-head">
            <button className="pcal-nav" onClick={() => move(-1)} aria-label="Önceki ay"><ChevronLeft /></button>
            <h2>{cursor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</h2>
            <button className="pcal-nav" onClick={() => move(1)} aria-label="Sonraki ay"><ChevronRight /></button>
            <button className="btn btn-sm pcal-today" onClick={goToday}>Bugün</button>
          </div>
          <div className="pcal-legend">
            {counts.map(([k, n]) => <span key={k} className={KIND[k].cls}><i />{KIND[k].label} <b>{n}</b></span>)}
            <span className="k-done"><i />Tamamlandı <b>{monthEvents.filter(isDone).length}</b></span>
          </div>
          <div className="pcal-wd">{WD.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="pcal-grid">
            {days.map((d) => {
              const evs = events.filter((e) => covers(e, d));
              const kinds = [...new Set(evs.map((e) => (isDone(e) ? 'DONE' : e.kind)))];
              const out = d.getMonth() !== cursor.getMonth();
              const cls = ['pcal-day', out && 'out', sameDay(d, today) && 'today', sel && sameDay(d, sel) && 'sel', evs.length && 'has'].filter(Boolean).join(' ');
              return (
                <button key={+d} className={cls} onClick={() => setSel(sel && sameDay(d, sel) ? null : day0(d))} aria-label={`${fmtDate(d)} — ${evs.length} kayıt`}>
                  <span className="n">{d.getDate()}</span>
                  <span className="dots">{kinds.map((k) => <i key={k} className={k === 'DONE' ? 'k-done done' : KIND[k as Kind].cls} />)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card pcal-agenda">
          <div className="pcal-agenda-head">
            <div>
              <span>{sel ? 'Seçilen gün' : 'Bu ayın programı'}</span>
              <h2>{sel ? sel.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : cursor.toLocaleDateString('tr-TR', { month: 'long' })}</h2>
            </div>
            {sel && <button className="pcal-clear" onClick={() => setSel(null)}><X size={14} /> Tüm ay</button>}
          </div>
          {!all ? <div className="pcal-empty">Yükleniyor…</div> : list.length === 0 ? (
            <div className="pcal-empty"><CalendarCheck2 /><b>{sel ? 'Bu gün için planlı bir işlem yok' : 'Bu ay planlı bir işlem yok'}</b><span>Yeni bir ihtiyaç için Bakımlar sayfasından servis talebi oluşturabilirsiniz.</span></div>
          ) : (
            <AgendaList list={list} />
          )}
        </section>
      </div>
    </div>
  );
}
