import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ship, CalendarCheck, ClipboardList, CheckCircle2, AlertOctagon, ArrowRight, Plus, ClipboardCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, Card, Empty, Loading, StatusBadge } from '../components/ui';
import { YachtArt } from '../components/brand';
import { WorkOrderQuick } from '../components/WorkOrderQuick';
import { addDays, fmtDate, fmtTime, relTime, sameDay } from '../lib/format';
import { PRIORITY_LABELS, PRIORITY_TONE, TECH_STATUS, WORK_ORDER_STATUS_LABELS, WO_TONE, CATEGORY_SHORT } from '../lib/labels';
import { maintColor, useMaintCats } from '../lib/maintCats';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#94a3b8', EVALUATION: '#8b6fe0', PLANNED: '#5b9bd8', ASSIGNED: '#1767AD', IN_PROGRESS: '#e07b00',
  TECHNICAL_REVIEW: '#6d4bd8', COMPLETED: '#16a34a', PUBLISHED: '#0f8a44', CLOSED: '#0b2342', ON_HOLD: '#f2b450', REVISION_REQUIRED: '#dc2626', CANCELLED: '#cbd5e1',
};


export default function Dashboard() {
  const { user, manager, can } = useAuth();
  const nav = useNavigate();
  const { data } = useApi<any>('/dashboard', undefined, { refetchInterval: 60_000 });
  const [quick, setQuick] = useState<string | null>(null);
  const cats = useMaintCats();
  // Grafikte görünen başlıklar: etkin olanlar + son 6 ayda işi olan pasifler
  const catColors = cats.all.filter((c) => c.isActive || (data?.monthly ?? []).some((m: any) => m[c.key])).map((c, i) => [c.key, c.color || maintColor(c.key, i)] as [string, string]);
  if (!data) return <Loading />;
  const k = data.kpis;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const weekStart = new Date(data.week.start);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const kpis = [
    { label: 'Aktif Tekneler', value: k.activeVessels, icon: Ship, bg: '#EAF3FC', fg: '#1767AD', to: '/vessels?active=true', foot: 'Filodaki aktif tekne' },
    { label: 'Bu Haftaki Bakımlar', value: k.weekMaintenance, icon: CalendarCheck, bg: '#F0ECFD', fg: '#6d4bd8', to: '/calendar', foot: k.overdueMaintenance ? `${k.overdueMaintenance} gecikmiş bakım` : 'Gecikme yok', footTone: k.overdueMaintenance ? 'var(--danger)' : undefined },
    { label: 'Açık İş Emirleri', value: k.openWorkOrders, icon: ClipboardList, bg: '#FFF3E2', fg: '#e07b00', to: '/work-orders?group=open', foot: manager ? `${k.reviewPending} iş kontrol bekliyor` : 'Devam eden işler' },
    { label: 'Tamamlanan Görevler', value: k.completedTasks, icon: CheckCircle2, bg: '#E8F7EE', fg: '#16a34a', to: '/work-orders?group=done', foot: 'Bu ay tamamlanan' },
  ];

  return (
    <div>
      <section className="hero">
        <YachtArt className="hero-art" />
        <div className="xs" style={{ color: '#8fb3d9', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600 }}>
          {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <h1 className="mt-1">{greet}, {user?.name.split(' ')[0]}</h1>
        <p>Filonuzun bugünkü operasyon durumu ve önümüzdeki haftanın bakım planı.</p>
        <div className="hero-actions">
          {can('workorders.manage') && (
            <button className="btn btn-primary" onClick={() => nav('/work-orders?new=1')}>
              <Plus /> Yeni İş Emri
            </button>
          )}
          {can('maintenance.manage') && (
            <button className="btn btn-light" onClick={() => nav('/maintenance?new=1')}>
              <CalendarCheck /> Bakım Planla
            </button>
          )}
          {can('inspections.perform') && (
            <button className="btn btn-light" onClick={() => nav('/inspections?new=1')}>
              <ClipboardCheck /> Denetim Başlat
            </button>
          )}
        </div>
      </section>

      <div className="grid g-4">
        {kpis.map((x) => (
          <button key={x.label} className="card kpi" onClick={() => nav(x.to)}>
            <div className="kpi-top">
              <span className="kpi-label">{x.label}</span>
              <span className="kpi-icon" style={{ background: x.bg, color: x.fg }}>
                <x.icon size={20} />
              </span>
            </div>
            <div className="kpi-value">{x.value}</div>
            <div className="kpi-foot" style={{ color: x.footTone }}>
              {x.foot} <ArrowRight size={13} style={{ marginLeft: 'auto' }} />
            </div>
          </button>
        ))}
      </div>

      <div className="grid g-main mt-3 dash-main">
        <div className="stack">
        <Card title="Haftalık Bakım Takvimi" action={<a className="link" onClick={() => nav('/calendar')} style={{ cursor: 'pointer' }}>Takvimi aç</a>}>
          <div className="week-grid">
            {days.map((d) => {
              const items = data.week.items.filter((i: any) => sameDay(new Date(i.date), d));
              const today = sameDay(d, new Date());
              return (
                <div key={d.toISOString()} className={`week-day${today ? ' today' : ''}`}>
                  <div className="wd-head">
                    <span>{d.toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
                    <b>{d.getDate()}</b>
                  </div>
                  {items.slice(0, 4).map((i: any) => (
                    <div
                      key={i.kind + i.id}
                      className={`ev k-${i.kind} p-${i.priority} s-${i.status}`}
                      onClick={() => (i.kind === 'WORK_ORDER' ? setQuick(i.id) : nav(`/maintenance?id=${i.id}`))}
                      title={i.title}
                    >
                      <b>{i.vessel.replace('M/Y ', '')}</b>
                      <span>{i.kind === 'WORK_ORDER' ? `${fmtTime(i.date)} · ` : ''}{i.title.split(' — ')[0]}</span>
                    </div>
                  ))}
                  {items.length > 4 && <span className="xs muted" style={{ paddingLeft: 4 }}>+{items.length - 4} daha</span>}
                  {!items.length && <span className="xs" style={{ color: '#b4c3d3', padding: '0 4px' }}>Planlı iş yok</span>}
                </div>
              );
            })}
          </div>
          <div className="legend mt-2">
            <span><i style={{ background: 'var(--marine)' }} />İş emri</span>
            <span><i style={{ background: 'var(--violet)' }} />Bakım planı</span>
            <span><i style={{ background: 'var(--danger)' }} />Kritik / gecikmiş</span>
          </div>
        </Card>

        <div className="grid g-2 dash-charts">
        <Card title="Aylık Servis İstatistikleri">
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={data.monthly} margin={{ left: -24, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip cursor={{ fill: '#f4f7fb' }} contentStyle={{ borderRadius: 10, border: '1px solid #e2e9f1' }} />
                {catColors.map(([k2, c], i, arr) => (
                  <Bar key={k2} dataKey={k2} name={CATEGORY_SHORT[k2]} stackId="a" fill={c} radius={i === arr.length - 1 ? [6, 6, 0, 0] : 0} maxBarSize={34} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            {catColors.map(([k2, c]) => (
              <span key={k2}><i style={{ background: c }} />{CATEGORY_SHORT[k2]}</span>
            ))}
          </div>
        </Card>
        <Card title="İş Emirleri Durum Dağılımı">
          <div className="row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 170, height: 170, flex: 'none', position: 'relative', margin: '0 auto' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data.statusDistribution} dataKey="count" nameKey="status" innerRadius={52} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                    {data.statusDistribution.map((s: any) => (
                      <Cell key={s.status} fill={STATUS_COLORS[s.status]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [v, WORK_ORDER_STATUS_LABELS[n as keyof typeof WORK_ORDER_STATUS_LABELS]]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)' }}>{data.statusDistribution.reduce((s: number, x: any) => s + x.count, 0)}</div>
                  <div className="xs muted">iş emri</div>
                </div>
              </div>
            </div>
            <div className="stack" style={{ gap: 6, flex: 1, minWidth: 150 }}>
              {data.statusDistribution.map((s: any) => (
                <div key={s.status} className="row small" style={{ cursor: 'pointer' }} onClick={() => nav(`/work-orders?status=${s.status}`)}>
                  <span className="status-dot" style={{ background: STATUS_COLORS[s.status] }} />
                  <span style={{ flex: 1 }}>{WORK_ORDER_STATUS_LABELS[s.status as keyof typeof WORK_ORDER_STATUS_LABELS]}</span>
                  <b className="mono">{s.count}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
        </div>
        </div>

        <div className="stack">
          <Card title="Yaklaşan İşler" pad={false} action={<a className="link" style={{ cursor: 'pointer' }} onClick={() => nav('/work-orders?group=open')}>Tümü</a>}>
            {data.upcoming.length === 0 && <Empty title="Yaklaşan iş yok" />}
            {data.upcoming.map((w: any) => (
              <div key={w.id} className="list-item clickable" onClick={() => setQuick(w.id)}>
                <div className="date-tile">
                  <b>{new Date(w.plannedStart).getDate()}</b>
                  <span>{new Date(w.plannedStart).toLocaleDateString('tr-TR', { month: 'short' })}</span>
                </div>
                <div className="grow">
                  <div className="strong truncate">{w.title}</div>
                  <div className="xs muted truncate">{w.vessel.name} · {w.technician?.name ?? 'Atanmadı'}</div>
                </div>
                <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={w.priority} />
              </div>
            ))}
          </Card>
          {data.criticalFaults && (manager || can('inspections.perform')) && (
            <Card title={<span className="row" style={{ gap: 8 }}><AlertOctagon size={17} color="var(--danger)" /> Kritik Arızalar</span>} pad={false} action={<a className="link" style={{ cursor: 'pointer' }} onClick={() => nav('/faults')}>Tümü</a>}>
              {data.criticalFaults.length === 0 && <Empty title="Açık kritik arıza yok" icon={<CheckCircle2 />} />}
              {data.criticalFaults.map((f: any) => (
                <div key={f.id} className="list-item clickable" onClick={() => nav(f.workOrder ? `/work-orders/${f.workOrder.id}` : `/faults?id=${f.id}`)}>
                  <span className="status-dot" style={{ background: f.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--warn)' }} />
                  <div className="grow">
                    <div className="strong truncate">{f.title}</div>
                    <div className="xs muted">{f.vessel.name} · {relTime(f.createdAt)}</div>
                  </div>
                  {f.workOrder ? <Badge tone="info" plain>{f.workOrder.number}</Badge> : <Badge tone="danger">İş emri yok</Badge>}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
      {manager && (
        <Card className="mt-3" title="Teknisyen Durumları" action={<a className="link" style={{ cursor: 'pointer' }} onClick={() => nav('/technicians')}>Tümü</a>}>
          <div className="tech-tiles">
            {data.technicians.slice(0, 8).map((t: any) => {
              const [label, tone] = TECH_STATUS[t.status];
              return (
                <div key={t.id} className="tech-tile">
                  <Avatar name={t.name} />
                  <div className="grow">
                    <div className="strong truncate">{t.name}</div>
                    <div className="xs muted truncate">{t.current ? `${t.current.vessel.name} · ${t.current.title.split(' — ')[0]}` : t.title}</div>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <p className="xs muted mt-3">Son güncelleme: {fmtDate(new Date(), { hour: '2-digit', minute: '2-digit' })}</p>
      <WorkOrderQuick id={quick} onClose={() => setQuick(null)} />
    </div>
  );
}
