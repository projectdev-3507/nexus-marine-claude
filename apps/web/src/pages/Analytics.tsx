import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, LineChart, Legend } from 'recharts';
import { useApi } from '../lib/hooks';
import { Card, DataTable, Loading, PageHeader, Seg } from '../components/ui';
import { CATEGORY_SHORT } from '../lib/labels';
import { fmtNum } from '../lib/format';

export default function Analytics() {
  const [range, setRange] = useState<'3' | '6' | '12'>('12');
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - Number(range) + 1, 1);
  const { data } = useApi<any>('/analytics', { from: from.toISOString(), to: to.toISOString() });
  if (!data) return <Loading />;
  const t = data.totals;
  const kpis = [
    ['Toplam iş emri', fmtNum(t.workOrders)],
    ['Tamamlanan', fmtNum(t.completed)],
    ['Ort. tamamlanma süresi', `${fmtNum(t.avgLeadDays, 1)} gün`],
    ['Gerçekleşen / planlanan efor', t.effortRatio ? `%${Math.round(t.effortRatio * 100)}` : '—'],
    ['Teknik denetim', fmtNum(t.inspections)],
    ['Gecikmiş bakım', fmtNum(t.maintenanceOverdue)],
  ];
  return (
    <div>
      <PageHeader title="Yönetim Raporları" sub="Operasyonel performans ve servis istatistikleri" actions={<Seg value={range} onChange={setRange} options={[['3', '3 ay'], ['6', '6 ay'], ['12', '12 ay']]} />} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {kpis.map(([l, v]) => <div key={l} className="card card-pad"><div className="xs muted">{l}</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{v}</div></div>)}
      </div>
      <div className="grid g-2 mt-3">
        <Card title="Aylık iş emri trendi">
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={data.monthly} margin={{ left: -20, right: 10, top: 10 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="created" name="Açılan" stroke="#1767AD" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="completed" name="Tamamlanan" stroke="#16a34a" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Kategori bazlı iş ve işçilik">
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={data.byCategory.map((c: any) => ({ ...c, name: CATEGORY_SHORT[c.category] }))} margin={{ left: -20, right: 10, top: 10 }}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" name="İş emri" fill="#0B2342" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="hours" name="İşçilik (saat)" fill="#7fb3e6" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Teknisyen performansı" pad={false}>
          <DataTable rows={data.byTechnician} columns={[
            { key: 'n', label: 'Teknisyen', render: (t: any) => <b>{t.name}</b> },
            { key: 'c', label: 'Tamamlanan', align: 'right', render: (t: any) => t.completed },
            { key: 'h', label: 'İşçilik (s)', align: 'right', render: (t: any) => fmtNum(t.hours, 1) },
            { key: 'e', label: 'Efor oranı', align: 'right', render: (t: any) => (t.planned ? `%${Math.round((t.hours / t.planned) * 100)}` : '—') },
          ]} />
        </Card>
        <Card title="En çok servis alan tekneler" pad={false}>
          <DataTable rows={data.topVessels} columns={[
            { key: 'n', label: 'Tekne', render: (v: any) => <b>{v.name}</b> },
            { key: 'c', label: 'İş emri', align: 'right', render: (v: any) => v.count },
          ]} />
        </Card>
      </div>
    </div>
  );
}
