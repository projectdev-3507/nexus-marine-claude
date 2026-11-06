import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Card, PageHeader, Seg } from '../components/ui';
import { WorkOrderQuick } from '../components/WorkOrderQuick';
import { MaintenanceForm } from './Maintenance';
import { usePeople, useVesselOptions } from '../lib/lookups';
import { addDays, fmtTime, sameDay, startOfWeek, toInputDate } from '../lib/format';

export default function CalendarPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'month' | 'week'>(window.innerWidth < 760 ? 'week' : 'month');
  const [cursor, setCursor] = useState(new Date());
  const [tech, setTech] = useState('');
  const [vessel, setVessel] = useState('');
  const [quick, setQuick] = useState<string | null>(null);
  const [maint, setMaint] = useState<{ id?: string; date?: string } | null>(null);
  const techs = usePeople('TECHNICIAN');
  const vessels = useVesselOptions();

  const { from, to, days } = useMemo(() => {
    if (mode === 'week') {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = startOfWeek(first);
    return { from: s, to: addDays(s, 42), days: Array.from({ length: 42 }, (_, i) => addDays(s, i)) };
  }, [mode, cursor]);

  const { data = [] } = useApi<any[]>('/calendar', { from: from.toISOString(), to: to.toISOString(), technicianId: tech || undefined, vesselId: vessel || undefined });
  const eventsOn = (d: Date) =>
    data.filter((e) => {
      const s = new Date(e.start);
      const en = new Date(e.end ?? e.start);
      const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
      const d1 = addDays(d0, 1);
      return s < d1 && en >= d0;
    });
  const open = (e: any) => (e.kind === 'WORK_ORDER' ? setQuick(e.id) : e.kind === 'MAINTENANCE' ? setMaint({ id: e.id }) : nav(`/projects/${e.id}`));
  const move = (n: number) => setCursor((c) => (mode === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1)));
  const title = mode === 'week' ? `${from.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${addDays(from, 6).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}` : cursor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader title="Takvim" sub="İş emirleri, bakım planları ve proje aşamaları" actions={can('maintenance.manage') && <button className="btn btn-primary" onClick={() => setMaint({ date: toInputDate(new Date()) })}><Plus /> Bakım planla</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <div className="row">
            <button className="btn btn-sm btn-icon" onClick={() => move(-1)}><ChevronLeft /></button>
            <button className="btn btn-sm" onClick={() => setCursor(new Date())}>Bugün</button>
            <button className="btn btn-sm btn-icon" onClick={() => move(1)}><ChevronRight /></button>
            <h2 style={{ marginLeft: 8, textTransform: 'capitalize' }}>{title}</h2>
          </div>
          <span className="spacer" />
          <select className="select sm" style={{ width: 170 }} value={vessel} onChange={(e) => setVessel(e.target.value)}><option value="">Tüm tekneler</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          {techs.length > 0 && <select className="select sm" style={{ width: 170 }} value={tech} onChange={(e) => setTech(e.target.value)}><option value="">Tüm teknisyenler</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          <Seg value={mode} onChange={setMode} options={[['month', 'Ay'], ['week', 'Hafta']]} />
        </div>
        <div style={{ padding: mode === 'week' ? 16 : 0 }}>
          {mode === 'month' ? (
            <div className="month-grid">
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => <div key={d} className="mh">{d}</div>)}
              {days.map((d) => {
                const ev = eventsOn(d);
                return (
                  <div key={d.toISOString()} className={`month-cell${d.getMonth() !== cursor.getMonth() ? ' other' : ''}${sameDay(d, new Date()) ? ' today' : ''}`} onClick={() => can('maintenance.manage') && setMaint({ date: toInputDate(d) })}>
                    <span className="dnum">{d.getDate()}</span>
                    {ev.slice(0, 3).map((e) => (
                      <div key={e.kind + e.id} className={`ev k-${e.kind} p-${e.priority} s-${e.status}`} onClick={(x) => { x.stopPropagation(); open(e); }} title={`${e.vessel?.name} · ${e.title}`}>
                        <b>{e.vessel?.name?.replace('M/Y ', '')}</b>
                      </div>
                    ))}
                    {ev.length > 3 && <span className="more">+{ev.length - 3}</span>}
                    <div className="evdots">{ev.slice(0, 5).map((e) => <i key={e.kind + e.id} style={{ background: e.kind === 'MAINTENANCE' ? 'var(--violet)' : e.kind === 'PROJECT_PHASE' ? '#0e9488' : 'var(--marine)' }} />)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="week-grid">
              {days.map((d) => (
                <div key={d.toISOString()} className={`week-day${sameDay(d, new Date()) ? ' today' : ''}`} style={{ minHeight: 320 }} onDoubleClick={() => can('maintenance.manage') && setMaint({ date: toInputDate(d) })}>
                  <div className="wd-head"><span>{d.toLocaleDateString('tr-TR', { weekday: 'long' })}</span><b>{d.getDate()}</b></div>
                  {eventsOn(d).map((e) => (
                    <div key={e.kind + e.id} className={`ev k-${e.kind} p-${e.priority} s-${e.status}`} onClick={() => open(e)}>
                      <b>{e.vessel?.name}</b>
                      <span>{e.kind === 'WORK_ORDER' && e.start ? `${fmtTime(e.start)} · ` : ''}{e.title.split(' — ')[0]}</span>
                      {e.technician && <span>{e.technician.name}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="legend" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span><i style={{ background: 'var(--marine)' }} />İş emri</span>
          <span><i style={{ background: 'var(--violet)' }} />Bakım planı</span>
          <span><i style={{ background: '#0e9488' }} />Proje aşaması</span>
          <span><i style={{ background: 'var(--danger)' }} />Kritik / gecikmiş</span>
          {can('maintenance.manage') && <span className="spacer" />}
          {can('maintenance.manage') && <span>Bakım planlamak için bir güne tıklayın.</span>}
        </div>
      </Card>
      <WorkOrderQuick id={quick} onClose={() => setQuick(null)} />
      {maint && <MaintenanceForm id={maint.id} defaults={maint.date ? { plannedDate: maint.date, vesselId: vessel } : {}} onClose={() => setMaint(null)} />}
    </div>
  );
}
