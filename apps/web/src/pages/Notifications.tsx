import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, AlertOctagon, ClipboardList, CalendarClock, FileText, Receipt, MessageSquare, CheckCircle2, Hammer, UserPlus, Clock } from 'lucide-react';
import { NOTIFICATION_TYPES } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { api } from '../lib/api';
import { Card, Empty, Loading, PageHeader, Pager } from '../components/ui';
import { relTime } from '../lib/format';

const ICONS: Record<string, [any, string, string]> = {
  CRITICAL_FAULT: [AlertOctagon, '#fdecec', '#dc2626'],
  WORK_ORDER_CREATED: [ClipboardList, '#eaf3fc', '#1767AD'],
  TASK_ASSIGNED: [UserPlus, '#eaf3fc', '#1767AD'],
  MAINTENANCE_UPCOMING: [CalendarClock, '#f0ecfd', '#6d4bd8'],
  OVERDUE: [Clock, '#fff3e2', '#e07b00'],
  SERVICE_COMPLETED: [CheckCircle2, '#e8f7ee', '#16a34a'],
  REVIEW_REQUIRED: [ClipboardList, '#f0ecfd', '#6d4bd8'],
  NEW_REPORT: [FileText, '#eaf3fc', '#0b2342'],
  QUOTE_RESPONSE: [Receipt, '#e8f7ee', '#16a34a'],
  QUOTE_SENT: [Receipt, '#eaf3fc', '#1767AD'],
  CUSTOMER_REQUEST: [MessageSquare, '#fff3e2', '#e07b00'],
  PROJECT_DELIVERY: [Hammer, '#e8f7ee', '#16a34a'],
};

export default function Notifications() {
  const nav = useNavigate();
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const { data } = useApi<any>('/notifications', { unread: unread ? 'true' : undefined, page, pageSize: 30 });
  const readAll = useAction(() => api('/notifications/read-all', { body: {} }), { success: 'Tüm bildirimler okundu' });
  const read = useAction((id: string) => api(`/notifications/${id}/read`, { body: {} }));
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader title="Bildirimler" sub={`${data.unread} okunmamış bildirim`} actions={<><div className="seg"><button className={!unread ? 'active' : ''} onClick={() => setUnread(false)}>Tümü</button><button className={unread ? 'active' : ''} onClick={() => setUnread(true)}>Okunmamış</button></div><button className="btn" disabled={!data.unread} onClick={() => readAll.mutate(undefined)}><CheckCheck /> Tümünü okundu yap</button></>} />
      <Card pad={false}>
        {data.items.length === 0 && <Empty title="Bildirim yok" icon={<Bell />} />}
        {data.items.map((n: any) => {
          const [Icon, bg, fg] = ICONS[n.type] ?? [Bell, '#eef2f6', '#55677c'];
          return (
            <div key={n.id} className="list-item clickable" style={{ background: n.readAt ? undefined : '#f7fbff' }} onClick={() => { if (!n.readAt) read.mutate(n.id); if (n.link) nav(n.link); }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon size={18} /></span>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}><b className="truncate">{n.title}</b>{!n.readAt && <span className="status-dot" style={{ background: 'var(--marine)' }} />}</div>
                {n.body && <div className="small muted truncate">{n.body}</div>}
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div className="xs muted">{relTime(n.createdAt)}</div>
                <div className="xs" style={{ color: fg }}>{NOTIFICATION_TYPES[n.type as keyof typeof NOTIFICATION_TYPES] ?? n.type}</div>
              </div>
            </div>
          );
        })}
        <Pager page={page} pageSize={30} total={data.total} onPage={setPage} />
      </Card>
    </div>
  );
}
