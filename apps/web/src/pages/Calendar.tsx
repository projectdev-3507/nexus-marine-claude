import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarDays, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, GanttChart, Layers, Plus, Ship, Wrench } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Card, PageHeader, Seg } from '../components/ui';
import { WorkOrderQuick } from '../components/WorkOrderQuick';
import { MaintenanceForm } from './Maintenance';
import { usePeople, useVesselOptions } from '../lib/lookups';
import { addDays, fmtDate, fmtTime, sameDay, startOfWeek, toInputDate } from '../lib/format';
import { MAINTENANCE_STATUS_LABELS, PHASE_STATUS_LABELS, PRIORITY_LABELS, WORK_ORDER_STATUS_LABELS } from '../lib/labels';
import '../styles/calendar.css';

type Kind = 'WORK_ORDER' | 'MAINTENANCE' | 'PROJECT_PHASE';
type View = 'month' | 'week' | 'timeline';
type Span = 'month' | 'quarter';
type Ev = {
  kind: Kind;
  id: string;
  title: string;
  number?: string;
  start: string;
  end?: string | null;
  status: string;
  priority?: string;
  vessel?: { id?: string; name: string };
  technician?: { id: string; name: string } | null;
  phase?: string;
  project?: string;
};

const KINDS: Record<Kind, { label: string; plural: string; color: string; icon: ReactNode }> = {
  WORK_ORDER: { label: 'İş emri', plural: 'İş emirleri', color: 'var(--marine)', icon: <Wrench /> },
  MAINTENANCE: { label: 'Bakım', plural: 'Bakım planları', color: 'var(--violet)', icon: <CalendarClock /> },
  PROJECT_PHASE: { label: 'Proje aşaması', plural: 'Proje aşamaları', color: '#0e9488', icon: <Layers /> },
};
const KIND_ORDER: Kind[] = ['MAINTENANCE', 'WORK_ORDER', 'PROJECT_PHASE'];
const statusLabel = (e: Ev) =>
  (e.kind === 'WORK_ORDER' ? (WORK_ORDER_STATUS_LABELS as Record<string, string>) : e.kind === 'MAINTENANCE' ? (MAINTENANCE_STATUS_LABELS as Record<string, string>) : PHASE_STATUS_LABELS)[e.status] ?? e.status;
const isLate = (e: Ev) => e.status === 'OVERDUE' || (e.kind === 'WORK_ORDER' && !!e.end && new Date(e.end) < new Date() && !['COMPLETED', 'PUBLISHED', 'CLOSED'].includes(e.status));
const isDone = (e: Ev) => ['COMPLETED', 'PUBLISHED', 'CLOSED', 'DONE'].includes(e.status);
const shortVessel = (n?: string) => (n ?? '').replace(/^M\/Y\s+/, '');
const evKey = (e: Ev) => `${e.kind}-${e.id}-${e.phase ?? ''}-${e.start}`;
const evText = (e: Ev) => (e.kind === 'PROJECT_PHASE' ? e.phase ?? e.title : e.title.split(' — ')[0]);
const day0 = (d: Date | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dayDiff = (a: Date, b: Date) => Math.round((+day0(a) - +day0(b)) / 864e5);
const tooltip = (e: Ev) =>
  [`${e.vessel?.name ?? ''} — ${KINDS[e.kind].label}`, e.title, `${fmtDate(e.start)}${e.end && !sameDay(new Date(e.end), new Date(e.start)) ? ' → ' + fmtDate(e.end) : ''}`, `Durum: ${statusLabel(e)}`, e.priority ? `Öncelik: ${(PRIORITY_LABELS as Record<string, string>)[e.priority] ?? e.priority}` : '', e.technician ? `Teknisyen: ${e.technician.name}` : '']
    .filter(Boolean)
    .join('\n');

export default function CalendarPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || (window.innerWidth < 760 ? 'week' : 'month');
  const vessel = params.get('vessel') ?? '';
  const setParam = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); v ? n.set(k, v) : n.delete(k); return n; }, { replace: true });
  const [span, setSpan] = useState<Span>('month');
  const [cursor, setCursor] = useState(new Date());
  const [tech, setTech] = useState('');
  const [kinds, setKinds] = useState<Record<Kind, boolean>>({ WORK_ORDER: true, MAINTENANCE: true, PROJECT_PHASE: true });
  const [quick, setQuick] = useState<string | null>(null);
  const [maint, setMaint] = useState<{ id?: string; date?: string } | null>(null);
  const techs = usePeople('TECHNICIAN');
  const vessels = useVesselOptions();

  const { from, to, days } = useMemo(() => {
    if (view === 'week') {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    if (view === 'timeline') {
      const s = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const e = new Date(cursor.getFullYear(), cursor.getMonth() + (span === 'month' ? 1 : 3), 1);
      const n = dayDiff(e, s);
      return { from: s, to: e, days: Array.from({ length: n }, (_, i) => addDays(s, i)) };
    }
    const s = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return { from: s, to: addDays(s, 42), days: Array.from({ length: 42 }, (_, i) => addDays(s, i)) };
  }, [view, cursor, span]);

  // Tüm teknelerin kayıtları alınır; tekne sekmeleri sayıları için filtre istemci tarafında uygulanır.
  const { data: raw = [], isLoading } = useApi<Ev[]>('/calendar', { from: from.toISOString(), to: to.toISOString(), technicianId: tech || undefined });
  const byKind = useMemo(() => raw.filter((e) => kinds[e.kind]), [raw, kinds]);
  const data = useMemo(() => (vessel ? byKind.filter((e) => e.vessel?.id === vessel) : byKind), [byKind, vessel]);

  const vesselTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of byKind) if (e.vessel?.id) counts.set(e.vessel.id, (counts.get(e.vessel.id) ?? 0) + 1);
    return vessels
      .map((v) => ({ id: v.id, name: v.name, count: counts.get(v.id) ?? 0 }))
      .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.name.localeCompare(b.name, 'tr'));
  }, [vessels, byKind]);
  const current = vessels.find((v) => v.id === vessel);

  // Seçili tekne sekmesini her zaman görünür tut
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('button.active');
    const box = tabsRef.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [vessel, vesselTabs]);

  const eventsOn = (d: Date) => data.filter((e) => day0(e.start) <= day0(d) && day0(e.end ?? e.start) >= day0(d));
  const open = (e: Ev) => (e.kind === 'WORK_ORDER' ? setQuick(e.id) : e.kind === 'MAINTENANCE' ? nav(`/maintenance/${e.id}`) : nav(`/projects/${e.id}`));
  const move = (n: number) => setCursor((c) => (view === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1)));
  const fmtM = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const title =
    view === 'week'
      ? `${from.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${addDays(from, 6).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : view === 'timeline' && span === 'quarter'
        ? `${from.toLocaleDateString('tr-TR', { month: 'short' })} – ${addDays(to, -1).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}`
        : fmtM(cursor);

  const stats = {
    total: data.length,
    late: data.filter(isLate).length,
    ...Object.fromEntries(KIND_ORDER.map((k) => [k, data.filter((e) => e.kind === k).length])),
  } as Record<string, number>;

  return (
    <div>
      <PageHeader
        title="Takvim"
        sub="Teknelerin bakım, iş emri ve proje planları tek ekranda"
        actions={can('maintenance.manage') && <button className="btn btn-primary" onClick={() => setMaint({ date: toInputDate(new Date()) })}><Plus /> Bakım planla</button>}
      />

      {/* Tekne sekmeleri — Jira'daki proje başlıkları gibi */}
      <div className="vessel-tabs" role="tablist" aria-label="Tekneler" ref={tabsRef}>
        <button role="tab" aria-selected={!vessel} className={!vessel ? 'active' : ''} onClick={() => setParam('vessel', '')}>
          <Ship /> Tüm tekneler <em>{byKind.length}</em>
        </button>
        {vesselTabs.map((v) => (
          <button key={v.id} role="tab" aria-selected={vessel === v.id} className={`${vessel === v.id ? 'active' : ''}${v.count ? '' : ' empty'}`} onClick={() => setParam('vessel', v.id)}>
            {shortVessel(v.name)} {v.count > 0 && <em>{v.count}</em>}
          </button>
        ))}
      </div>

      {/* Seçili teknenin özeti */}
      <div className="cal-summary">
        <div className="cal-summary-title">
          <span className="ic"><Ship /></span>
          <div>
            <b>{current ? current.name : 'Tüm tekneler'}</b>
            <span>{current ? [current.marina, current.owner?.name].filter(Boolean).join(' · ') || 'Bu teknenin planları' : 'Bir tekne seçerek yalnızca onun planlarını görün'}</span>
          </div>
          {current && <Link className="btn btn-sm" to={`/vessels/${current.id}`}>Tekne kartı</Link>}
        </div>
        <div className="cal-stats">
          {KIND_ORDER.map((k) => (
            <button key={k} className={`cal-stat${kinds[k] ? '' : ' off'}`} onClick={() => setKinds((s) => ({ ...s, [k]: !s[k] }))} title={kinds[k] ? `${KINDS[k].plural} gizle` : `${KINDS[k].plural} göster`}>
              <i style={{ background: KINDS[k].color }} />
              <span>{KINDS[k].plural}</span>
              <b>{kinds[k] ? stats[k] : '–'}</b>
            </button>
          ))}
          <div className={`cal-stat static${stats.late ? ' danger' : ''}`}>
            <i style={{ background: 'var(--danger)' }} />
            <span>Gecikmiş</span>
            <b>{stats.late}</b>
          </div>
        </div>
      </div>

      <Card pad={false}>
        <div className="toolbar cal-toolbar">
          <div className="row">
            <button className="btn btn-sm btn-icon" onClick={() => move(-1)} aria-label="Önceki"><ChevronLeft /></button>
            <button className="btn btn-sm" onClick={() => setCursor(new Date())}>Bugün</button>
            <button className="btn btn-sm btn-icon" onClick={() => move(1)} aria-label="Sonraki"><ChevronRight /></button>
            <h2 style={{ marginLeft: 8, textTransform: 'capitalize' }}>{title}</h2>
          </div>
          <span className="spacer" />
          {techs.length > 0 && (
            <select className="select sm" style={{ width: 170 }} value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">Tüm teknisyenler</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {view === 'timeline' && <Seg value={span} onChange={setSpan} options={[['month', '1 Ay'], ['quarter', '3 Ay']]} />}
          <div className="view-switch" role="tablist" aria-label="Görünüm">
            {([['month', 'Ay', <CalendarDays key="m" />], ['week', 'Hafta', <CalendarRange key="w" />], ['timeline', 'Zaman çizelgesi', <GanttChart key="t" />]] as const).map(([k, l, ic]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'active' : ''} onClick={() => setParam('view', k)}>
                {ic}<span>{l}</span>
              </button>
            ))}
          </div>
        </div>

        {view === 'timeline' ? (
          <Timeline events={data} from={from} days={days} span={span} single={!!vessel} loading={isLoading} onOpen={open} onVessel={(id) => setParam('vessel', id)} />
        ) : view === 'month' ? (
          <div className="month-grid">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => <div key={d} className="mh">{d}</div>)}
            {days.map((d) => {
              const ev = eventsOn(d);
              return (
                <div key={d.toISOString()} className={`month-cell${d.getMonth() !== cursor.getMonth() ? ' other' : ''}${sameDay(d, new Date()) ? ' today' : ''}`} onClick={() => can('maintenance.manage') && setMaint({ date: toInputDate(d) })}>
                  <span className="dnum">{d.getDate()}</span>
                  {ev.slice(0, 3).map((e) => (
                    <div key={evKey(e)} className={`ev k-${e.kind} p-${e.priority} s-${e.status}${isLate(e) ? ' late' : ''}`} onClick={(x) => { x.stopPropagation(); open(e); }} title={tooltip(e)}>
                      <b>{vessel ? evText(e) : shortVessel(e.vessel?.name)}</b>
                    </div>
                  ))}
                  {ev.length > 3 && (
                    <button className="more" onClick={(x) => { x.stopPropagation(); setCursor(d); setParam('view', 'week'); }}>+{ev.length - 3} daha</button>
                  )}
                  <div className="evdots">{ev.slice(0, 5).map((e) => <i key={evKey(e)} style={{ background: isLate(e) ? 'var(--danger)' : KINDS[e.kind].color }} />)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <div className="week-grid">
              {days.map((d) => {
                const ev = eventsOn(d);
                return (
                  <div key={d.toISOString()} className={`week-day${sameDay(d, new Date()) ? ' today' : ''}`} style={{ minHeight: 320 }} onDoubleClick={() => can('maintenance.manage') && setMaint({ date: toInputDate(d) })}>
                    <div className="wd-head"><span>{d.toLocaleDateString('tr-TR', { weekday: 'long' })}</span><b>{d.getDate()}</b></div>
                    {ev.length === 0 && <span className="wd-empty">Plan yok</span>}
                    {ev.map((e) => (
                      <div key={evKey(e)} className={`ev k-${e.kind} p-${e.priority} s-${e.status}${isLate(e) ? ' late' : ''}`} onClick={() => open(e)} title={tooltip(e)}>
                        {!vessel && <b>{e.vessel?.name}</b>}
                        <span className={vessel ? 'strong' : ''}>{e.kind === 'WORK_ORDER' && e.start ? `${fmtTime(e.start)} · ` : ''}{evText(e)}</span>
                        <span>{statusLabel(e)}{e.technician ? ` · ${e.technician.name}` : ''}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="legend" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          {KIND_ORDER.map((k) => <span key={k}><i style={{ background: KINDS[k].color }} />{KINDS[k].label}</span>)}
          <span><i style={{ background: 'var(--danger)' }} />Kritik / gecikmiş</span>
          <span><i className="done-swatch" />Tamamlandı</span>
          <span className="spacer" />
          <span>{view === 'timeline' ? 'Ayrıntı için bir çubuğa tıklayın.' : can('maintenance.manage') ? 'Bakım planlamak için bir güne tıklayın.' : ''}</span>
        </div>
      </Card>
      <WorkOrderQuick id={quick} onClose={() => setQuick(null)} />
      {maint && <MaintenanceForm id={maint.id} defaults={maint.date ? { plannedDate: maint.date, vesselId: vessel } : {}} onClose={() => setMaint(null)} />}
    </div>
  );
}

/* ---------- Jira tarzı zaman çizelgesi ---------- */

type Group = { key: string; label: string; sub: string; icon: ReactNode; vesselId?: string; items: Ev[] };

function Timeline({ events, from, days, span, single, loading, onOpen, onVessel }: { events: Ev[]; from: Date; days: Date[]; span: Span; single: boolean; loading: boolean; onOpen: (e: Ev) => void; onVessel: (id: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const labelW = width < 640 ? 150 : width < 1100 ? 280 : 340;
  const minDay = span === 'month' ? 30 : 12;
  const dayW = Math.max(minDay, Math.floor((width - labelW - 2) / days.length));
  const todayIdx = dayDiff(new Date(), from);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Bugün görünür aralıktaysa yatay kaydırmayı bugüne yakın konumla
  useEffect(() => {
    const el = wrap.current;
    if (el && todayIdx >= 0 && todayIdx < days.length) el.scrollLeft = Math.max(0, todayIdx * dayW - (el.clientWidth - labelW) / 4);
  }, [from.getTime(), days.length, dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups: Group[] = useMemo(() => {
    const sorted = [...events].sort((a, b) => +new Date(a.start) - +new Date(b.start));
    if (single) {
      return KIND_ORDER.map((k) => ({ key: k, label: KINDS[k].plural, sub: '', icon: KINDS[k].icon, items: sorted.filter((e) => e.kind === k) })).filter((g) => g.items.length);
    }
    const m = new Map<string, Group>();
    for (const e of sorted) {
      const id = e.vessel?.id ?? e.vessel?.name ?? '?';
      if (!m.has(id)) m.set(id, { key: id, label: e.vessel?.name ?? '—', sub: '', icon: <Ship />, vesselId: e.vessel?.id, items: [] });
      m.get(id)!.items.push(e);
    }
    return [...m.values()];
  }, [events, single]);

  const allClosed = groups.length > 0 && groups.every((g) => closed[g.key]);
  const pos = (e: Ev) => {
    const s = Math.max(0, dayDiff(new Date(e.start), from));
    const en = Math.min(days.length - 1, dayDiff(new Date(e.end ?? e.start), from));
    return { left: s * dayW, width: Math.max(1, en - s + 1) * dayW };
  };
  const months = useMemo(() => {
    const out: Array<{ label: string; start: number; len: number }> = [];
    days.forEach((d, i) => {
      const last = out[out.length - 1];
      if (last && days[last.start].getMonth() === d.getMonth()) last.len++;
      else out.push({ label: d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }), start: i, len: 1 });
    });
    return out;
  }, [days]);

  const trackW = days.length * dayW;
  const bar = (e: Ev, cls = '') => {
    const p = pos(e);
    const text = evText(e);
    const inside = p.width >= 110;
    return (
      <>
        <button
          className={`tl-bar k-${e.kind}${isLate(e) ? ' late' : ''}${isDone(e) ? ' done' : ''}${e.priority === 'CRITICAL' ? ' crit' : ''} ${cls}`}
          style={{ left: p.left + 2, width: p.width - 4 }}
          onClick={() => onOpen(e)}
          title={tooltip(e)}
        >
          {inside && <span>{text}</span>}
        </button>
        {!inside && <span className="tl-bar-out" style={{ left: p.left + p.width + 4 }}>{text}</span>}
      </>
    );
  };

  return (
    <div className="tl" ref={wrap} style={{ ['--label-w' as string]: `${labelW}px`, ['--day-w' as string]: `${dayW}px` }}>
      <div className="tl-inner" style={{ width: labelW + trackW }}>
        {/* Başlık */}
        <div className="tl-head">
          <div className="tl-corner">
            <button className="tl-toggle-all" onClick={() => setClosed(allClosed ? {} : Object.fromEntries(groups.map((g) => [g.key, true])))} title={allClosed ? 'Tümünü aç' : 'Tümünü kapat'}>
              <ChevronsUpDown />
            </button>
            <span>{single ? 'Plan' : 'Tekne / plan'}</span>
          </div>
          <div className="tl-scale" style={{ width: trackW }}>
            <div className="tl-months">
              {months.map((m) => <div key={m.start} style={{ left: m.start * dayW, width: m.len * dayW }}>{m.label}</div>)}
            </div>
            <div className="tl-days">
              {days.map((d, i) => {
                const we = d.getDay() === 0 || d.getDay() === 6;
                const show = span === 'month' || d.getDay() === 1 || i === 0;
                return (
                  <div key={i} className={`${we ? 'we' : ''}${i === todayIdx ? ' today' : ''}`} style={{ left: i * dayW, width: dayW }}>
                    {show && (<><small>{span === 'month' ? d.toLocaleDateString('tr-TR', { weekday: 'narrow' }) : ''}</small>{d.getDate()}</>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Gövde */}
        <div className="tl-body">
          <div className="tl-grid" style={{ left: labelW, width: trackW }}>
            {days.map((d, i) => (d.getDay() === 0 || d.getDay() === 6 ? <i key={i} className="we" style={{ left: i * dayW, width: dayW }} /> : d.getDay() === 1 ? <i key={i} className="wk" style={{ left: i * dayW }} /> : null))}
            {todayIdx >= 0 && todayIdx < days.length && <i className="today" style={{ left: todayIdx * dayW + dayW / 2 }} />}
          </div>

          {loading && <div className="tl-msg">Yükleniyor…</div>}
          {!loading && groups.length === 0 && <div className="tl-msg">Bu aralıkta plan bulunmuyor.</div>}

          {groups.map((g) => {
            const isClosed = !!closed[g.key];
            const sStart = Math.min(...g.items.map((e) => +new Date(e.start)));
            const sEnd = Math.max(...g.items.map((e) => +new Date(e.end ?? e.start)));
            const late = g.items.filter(isLate).length;
            return (
              <div key={g.key} className="tl-group">
                <div className="tl-row tl-group-row">
                  <div className="tl-label">
                    <button className="tl-caret" onClick={() => setClosed((c) => ({ ...c, [g.key]: !isClosed }))} aria-label={isClosed ? 'Aç' : 'Kapat'}>
                      <ChevronDown style={{ transform: isClosed ? 'rotate(-90deg)' : undefined }} />
                    </button>
                    <span className="tl-gicon">{g.icon}</span>
                    {g.vesselId ? (
                      <button className="tl-gname link" onClick={() => onVessel(g.vesselId!)} title="Yalnızca bu tekneyi göster">{g.label}</button>
                    ) : (
                      <span className="tl-gname">{g.label}</span>
                    )}
                    <em>{g.items.length}</em>
                    {late > 0 && <em className="danger">{late} gecikmiş</em>}
                  </div>
                  <div className="tl-track" style={{ width: trackW }}>
                    {(() => {
                      const p = pos({ start: new Date(sStart).toISOString(), end: new Date(sEnd).toISOString() } as Ev);
                      return <div className="tl-summary" style={{ left: p.left + 2, width: p.width - 4 }} />;
                    })()}
                  </div>
                </div>
                {!isClosed &&
                  g.items.map((e) => (
                    <div key={evKey(e)} className="tl-row">
                      <div className="tl-label tl-item" onClick={() => onOpen(e)} title={tooltip(e)}>
                        <span className="tl-kind" style={{ color: KINDS[e.kind].color }}>{KINDS[e.kind].icon}</span>
                        <span className="tl-title">{evText(e)}</span>
                        <span className={`tl-status${isLate(e) ? ' danger' : isDone(e) ? ' ok' : ''}`}>{isLate(e) && e.status !== 'OVERDUE' ? 'Gecikti' : statusLabel(e)}</span>
                      </div>
                      <div className="tl-track" style={{ width: trackW }}>{bar(e)}</div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
