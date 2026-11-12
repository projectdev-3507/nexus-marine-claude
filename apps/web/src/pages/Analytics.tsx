import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ClipboardList, CheckCircle2, Timer, Gauge, CalendarCheck, AlertOctagon, Ship, Hammer, Receipt, Wallet, TrendingUp, Printer, Clock } from 'lucide-react';
import { WORK_ORDER_STATUS_LABELS } from '@nexus/shared';
import { useApi } from '../lib/hooks';
import { Card, Loading, PageHeader, Progress, Seg } from '../components/ui';
import { CATEGORY_SHORT } from '../lib/labels';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import '../styles/analytics.css';

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: '#94a3b8', EVALUATION: '#8b6fe0', PLANNED: '#5b9bd8', ASSIGNED: '#1767AD', IN_PROGRESS: '#e07b00',
  TECHNICAL_REVIEW: '#6d4bd8', ON_HOLD: '#f2b450', REVISION_REQUIRED: '#dc2626',
};
const CAT_COLORS = ['#0B2342', '#1767AD', '#5b9bd8', '#a9cdf0'];
const pct = (v: number | null | undefined) => (v == null ? '—' : `%${Math.round(v * 100)}`);
const tip = { contentStyle: { borderRadius: 10, border: '1px solid #e2e9f1', fontSize: 12 } };

/** Para birimine göre toplamlar: "€12.000 · ₺50.000" */
const money = (t?: Record<string, number> | null) => {
  const e = Object.entries(t ?? {}).filter(([, v]) => v);
  return e.length ? e.map(([c, v]) => fmtMoney(v, c)).join(' · ') : fmtMoney(0);
};

function Kpi({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone: string }) {
  return (
    <div className={`an-kpi ${tone}`}>
      <span className="an-kpi-ic">{icon}</span>
      <div>
        <span className="an-kpi-label">{label}</span>
        <b className="an-kpi-value">{value}</b>
        {sub && <span className="an-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

function Gauge2({ value, label }: { value: number | null; label: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const color = v >= 0.85 ? '#16a34a' : v >= 0.65 ? '#e07b00' : '#dc2626';
  const r = 46, c = Math.PI * r;
  return (
    <div className="an-gauge">
      <svg viewBox="0 0 120 70">
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="#e8eef5" strokeWidth="11" strokeLinecap="round" />
        <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0b2342">{value == null ? '—' : `%${Math.round(v * 100)}`}</text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

export default function Analytics() {
  const nav = useNavigate();
  const [range, setRange] = useState<'3' | '6' | '12'>('6');
  // Tarih aralığı yalnızca seçim değişince hesaplanır (her çizimde yeni sorgu açılmasın)
  const { from, to } = useMemo(() => {
    const t0 = new Date();
    t0.setHours(23, 59, 59, 0);
    return { to: t0, from: new Date(t0.getFullYear(), t0.getMonth() - Number(range) + 1, 1) };
  }, [range]);
  const { data } = useApi<any>('/analytics', { from: from.toISOString(), to: to.toISOString() });
  if (!data) return <Loading />;
  const t = data.totals;
  const openTotal = data.openByStatus.reduce((s: number, o: any) => s + o.count, 0);
  const maxVessel = Math.max(1, ...data.topVessels.map((v: any) => v.count));
  const maxTech = Math.max(1, ...data.byTechnician.map((x: any) => x.completed));
  const f = data.finance;

  return (
    <div className="analytics">
      <PageHeader
        title="Yönetim Raporları"
        sub={`Operasyonel performans · ${fmtDate(data.range.from)} – ${fmtDate(data.range.to)}`}
        actions={<><Seg value={range} onChange={setRange} options={[['3', 'Son 3 ay'], ['6', 'Son 6 ay'], ['12', 'Son 12 ay']]} /><button className="btn" onClick={() => window.print()}><Printer /> Yazdır</button></>}
      />

      <div className="an-kpis">
        <Kpi tone="blue" icon={<ClipboardList />} label="Açılan iş emri" value={fmtNum(t.workOrders)} sub={`${fmtNum(t.openWorkOrders)} iş şu an açık`} />
        <Kpi tone="green" icon={<CheckCircle2 />} label="Tamamlanan" value={fmtNum(t.completed)} sub={`Tamamlanma oranı ${pct(t.completionRate)}`} />
        <Kpi tone="teal" icon={<Timer />} label="Zamanında tamamlama" value={pct(t.onTimeRate)} sub="Planlanan bitişe göre" />
        <Kpi tone="violet" icon={<Gauge />} label="Ort. tamamlanma süresi" value={`${fmtNum(t.avgLeadDays, 1)} gün`} sub={t.effortRatio ? `Efor oranı %${Math.round(t.effortRatio * 100)}` : 'Talepten kapanışa'} />
        <Kpi tone="amber" icon={<CalendarCheck />} label="Bakım uyumu" value={pct(t.maintenanceCompliance)} sub={`${fmtNum(t.maintenanceOverdue)} gecikmiş bakım`} />
        <Kpi tone="red" icon={<AlertOctagon />} label="Açık arıza" value={fmtNum(t.openFaults)} sub={`${fmtNum(t.inspections)} denetim yapıldı`} />
      </div>

      <div className="an-grid an-2-1">
        <Card title={<span className="row" style={{ gap: 8 }}><TrendingUp size={16} /> Aylık iş emri trendi</span>}>
          <div className="an-chart">
            <ResponsiveContainer>
              <AreaChart data={data.monthly} margin={{ left: -18, right: 8, top: 10 }}>
                <defs>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1767AD" stopOpacity={0.3} /><stop offset="1" stopColor="#1767AD" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16a34a" stopOpacity={0.3} /><stop offset="1" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="created" name="Açılan" stroke="#1767AD" strokeWidth={2.5} fill="url(#gC)" />
                <Area type="monotone" dataKey="completed" name="Tamamlanan" stroke="#16a34a" strokeWidth={2.5} fill="url(#gD)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Açık işlerin durumu">
          <div className="an-donut">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.openByStatus} dataKey="count" nameKey="status" innerRadius={58} outerRadius={86} paddingAngle={2} strokeWidth={0}>
                  {data.openByStatus.map((s: any) => <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#94a3b8'} />)}
                </Pie>
                <Tooltip {...tip} formatter={(v: number, n: string) => [v, WORK_ORDER_STATUS_LABELS[n as keyof typeof WORK_ORDER_STATUS_LABELS] ?? n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="an-donut-center"><b>{openTotal}</b><span>açık iş</span></div>
          </div>
          <div className="an-legend">
            {data.openByStatus.map((s: any) => (
              <button key={s.status} onClick={() => nav(`/work-orders?status=${s.status}`)}>
                <i style={{ background: STATUS_COLORS[s.status] ?? '#94a3b8' }} />{WORK_ORDER_STATUS_LABELS[s.status as keyof typeof WORK_ORDER_STATUS_LABELS] ?? s.status}<b>{s.count}</b>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="an-grid an-1-1">
        <Card title="Hedef göstergeleri">
          <div className="an-gauges">
            <Gauge2 value={t.onTimeRate} label="Zamanında tamamlama" />
            <Gauge2 value={t.maintenanceCompliance} label="Bakım planına uyum" />
            <Gauge2 value={t.completionRate} label="Tamamlanma oranı" />
          </div>
          <p className="xs muted mt-2">Yeşil ≥ %85 · turuncu ≥ %65 · kırmızı altı</p>
        </Card>
        <Card title="Arızalar: kaynak bazında aylık">
          <div className="an-chart sm">
            <ResponsiveContainer>
              <BarChart data={data.monthly} margin={{ left: -18, right: 8, top: 10 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: '#f4f7fb' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="faultsInspection" name="Denetimden" stackId="f" fill="#1767AD" maxBarSize={30} />
                <Bar dataKey="faultsCustomer" name="Müşteriden" stackId="f" fill="#e07b00" maxBarSize={30} />
                <Bar dataKey="faultsOther" name="Diğer" stackId="f" fill="#a9cdf0" radius={[5, 5, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="an-grid an-1-1">
        <Card title="Teknisyen performansı" pad={false}>
          <div className="an-table">
            <div className="an-tr an-th"><span>Teknisyen</span><span>Tamamlanan</span><span>Zamanında</span></div>
            {data.byTechnician.map((x: any) => {
              const ot = data.techOnTime?.[x.id];
              return (
                <div key={x.id} className="an-tr">
                  <span className="strong">{x.name}</span>
                  <span className="an-barcell"><i style={{ width: `${(x.completed / maxTech) * 100}%` }} /><b>{x.completed}</b></span>
                  <span><b style={{ color: ot == null ? 'var(--muted)' : ot >= 0.85 ? 'var(--ok)' : ot >= 0.65 ? '#a35d00' : 'var(--danger)' }}>{pct(ot)}</b></span>
                </div>
              );
            })}
            {!data.byTechnician.length && <p className="muted small" style={{ padding: 16 }}>Bu dönemde tamamlanan iş yok.</p>}
          </div>
        </Card>
        <Card title={<span className="row" style={{ gap: 8 }}><Ship size={16} /> En çok servis alan tekneler</span>} pad={false}>
          <div className="an-table">
            {data.topVessels.map((v: any, i: number) => (
              <div key={v.id} className="an-tr an-vessel" onClick={() => nav(`/vessels/${v.id}`)}>
                <span className="an-rank">{i + 1}</span>
                <span className="strong">{v.name}</span>
                <span className="an-barcell"><i style={{ width: `${(v.count / maxVessel) * 100}%` }} /><b>{v.count}</b></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="an-grid an-1-1">
        <Card title="Kategori bazlı iş dağılımı">
          <div className="an-chart sm">
            <ResponsiveContainer>
              <BarChart data={data.byCategory.map((c: any) => ({ ...c, name: CATEGORY_SHORT[c.category] }))} layout="vertical" margin={{ left: 10, right: 20, top: 6 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f6" />
                <XAxis type="number" allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={90} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: '#f4f7fb' }} />
                <Bar dataKey="count" name="İş emri" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {data.byCategory.map((_: any, i: number) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title={<span className="row" style={{ gap: 8 }}><Hammer size={16} /> Aktif projeler</span>} pad={false}>
          {!data.projects.length && <p className="muted small" style={{ padding: 16 }}>Aktif proje yok.</p>}
          {data.projects.map((p: any) => (
            <div key={p.id} className="list-item clickable" onClick={() => nav(`/projects/${p.id}`)}>
              <div className="grow">
                <div className="row" style={{ justifyContent: 'space-between' }}><b className="truncate">{p.name}</b><b className="mono small">%{p.progress}</b></div>
                <div className="mt-1"><Progress value={p.progress} /></div>
                <div className="xs muted mt-1">{p.vessel} · teslim {fmtDate(p.endDate)}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {f && (
        <Card title={<span className="row" style={{ gap: 8 }}><Receipt size={16} /> Ticari özet</span>} className="mt-3">
          <div className="an-fin">
            <div className="an-fin-kpis">
              <Kpi tone="green" icon={<Wallet />} label="Alınan tutar" value={money(f.collected)} sub="Seçilen dönemde tahsil edilen" />
              <Kpi tone="amber" icon={<Clock />} label="Bekleyen ödeme" value={money(f.pending)} sub={`${f.pendingCount} sözleşmede ödeme bekleniyor`} />
              <Kpi tone="blue" icon={<Receipt />} label="Onaylı sözleşme tutarı" value={money(f.contracted)} sub={`${f.approvedCount} sözleşme onaylandı · ${f.paidCount} ödendi`} />
              <Link to="/collections" className="btn btn-sm">Finans ve Tahsilat →</Link>
            </div>
            <div className="an-chart sm">
              <ResponsiveContainer>
                <BarChart data={f.monthly} margin={{ left: 0, right: 8, top: 10 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : v)} />
                  <Tooltip {...tip} cursor={{ fill: '#f4f7fb' }} formatter={(v: number) => fmtMoney(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="approved" name="Onaylı sözleşme (EUR)" fill="#1767AD" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="collected" name="Tahsilat (EUR)" fill="#16a34a" radius={[5, 5, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
