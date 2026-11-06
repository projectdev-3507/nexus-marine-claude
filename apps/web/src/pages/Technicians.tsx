import { useNavigate } from 'react-router-dom';
import { Phone, Mail, Wrench, Clock } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { Avatar, Badge, Empty, Loading, PageHeader } from '../components/ui';
import { TECH_STATUS } from '../lib/labels';
import { fmtNum, relTime } from '../lib/format';

export default function Technicians() {
  const nav = useNavigate();
  const { data } = useApi<any[]>('/technicians', undefined, { refetchInterval: 30_000 });
  if (!data) return <Loading />;
  const counts = { ON_TASK: 0, ASSIGNED: 0, AVAILABLE: 0 } as Record<string, number>;
  data.forEach((t) => counts[t.status]++);
  return (
    <div>
      <PageHeader title="Teknisyenler" sub={`${data.length} aktif teknisyen · ${counts.ON_TASK} görevde · ${counts.AVAILABLE} müsait`} />
      <div className="grid g-3">
        {data.length === 0 && <Empty />}
        {data.map((t) => {
          const [label, tone] = TECH_STATUS[t.status];
          return (
            <div key={t.id} className="card card-pad stack" style={{ gap: 14 }}>
              <div className="row">
                <Avatar name={t.name} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{t.name}</h3>
                  <div className="small muted">{t.title}</div>
                </div>
                <Badge tone={tone}>{label}</Badge>
              </div>
              {t.current ? (
                <div className="notice warn" style={{ cursor: 'pointer' }} onClick={() => nav(`/work-orders/${t.current.id}`)}>
                  <Wrench />
                  <div style={{ minWidth: 0 }}>
                    <b>{t.current.vessel.name}</b> · {t.current.vessel.marina}
                    <div className="truncate">{t.current.title}</div>
                    {t.current.startedAt && <div className="xs">Başladı: {relTime(t.current.startedAt)}</div>}
                  </div>
                </div>
              ) : (
                <div className="notice"><Clock /> Şu anda aktif görevi yok</div>
              )}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                <div><div className="kpi-value" style={{ fontSize: 20 }}>{t.openCount}</div><div className="xs muted">Açık iş</div></div>
                <div><div className="kpi-value" style={{ fontSize: 20 }}>{t.todayCount}</div><div className="xs muted">Bugün</div></div>
                <div><div className="kpi-value" style={{ fontSize: 20 }}>{t.completedThisMonth}</div><div className="xs muted">Bu ay ({fmtNum(t.hoursThisMonth, 1)} s)</div></div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {t.phone && <a className="btn btn-sm" href={`tel:${t.phone}`}><Phone /> Ara</a>}
                {t.email && <a className="btn btn-sm" href={`mailto:${t.email}`}><Mail /> E-posta</a>}
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={() => nav(`/work-orders?technicianId=${t.id}`)}>İşleri</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
