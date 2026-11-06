import { useSearchParams, useNavigate } from 'react-router-dom';
import { Ship, ClipboardList, Users } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Card, Empty, PageHeader, StatusBadge } from '../components/ui';
import { WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

export default function SearchPage() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const nav = useNavigate();
  const { can } = useAuth();
  const vessels = useApi<any>('/vessels', { q, pageSize: 8 }).data?.items ?? [];
  const wos = useApi<any>('/work-orders', { q, pageSize: 8 }).data?.items ?? [];
  const customers = useApi<any>(can('customers.view') ? '/customers' : null, { q, pageSize: 8 }).data?.items ?? [];
  return (
    <div>
      <PageHeader title={`"${q}" için sonuçlar`} />
      <div className="grid g-3">
        <Card title={<span className="row" style={{ gap: 8 }}><Ship size={16} /> Tekneler</span>} pad={false}>
          {vessels.length === 0 && <Empty />}
          {vessels.map((v: any) => <div key={v.id} className="list-item clickable" onClick={() => nav(`/vessels/${v.id}`)}><div className="grow"><b>{v.name}</b><div className="xs muted">{v.marina} · {v.owner?.name}</div></div></div>)}
        </Card>
        <Card title={<span className="row" style={{ gap: 8 }}><ClipboardList size={16} /> İş emirleri</span>} pad={false}>
          {wos.length === 0 && <Empty />}
          {wos.map((w: any) => <div key={w.id} className="list-item clickable" onClick={() => nav(`/work-orders/${w.id}`)}><div className="grow"><b className="truncate">{w.title}</b><div className="xs muted">{w.number} · {w.vessel.name}</div></div><StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /></div>)}
        </Card>
        {can('customers.view') && (
          <Card title={<span className="row" style={{ gap: 8 }}><Users size={16} /> Müşteriler</span>} pad={false}>
            {customers.length === 0 && <Empty />}
            {customers.map((c: any) => <div key={c.id} className="list-item clickable" onClick={() => nav(`/customers/${c.id}`)}><div className="grow"><b>{c.name}</b><div className="xs muted">{c.phone} · {c.vessels.map((v: any) => v.name).join(', ')}</div></div></div>)}
          </Card>
        )}
      </div>
    </div>
  );
}
