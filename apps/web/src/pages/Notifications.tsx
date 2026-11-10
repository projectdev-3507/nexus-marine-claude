import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Users, HardHat, AlertOctagon, ClipboardList, CalendarClock, FileText, Receipt, MessageSquare, CheckCircle2, Hammer, UserPlus, Clock } from 'lucide-react';
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
  NEW_COMMENT: [MessageSquare, '#eaf3fc', '#1767AD'],
  APPROVAL_REQUEST: [FileText, '#fff3e2', '#e07b00'],
  APPROVAL_RESPONSE: [CheckCircle2, '#e8f7ee', '#16a34a'],
};

type Source = 'client' | 'team';
const SOURCES: Record<Source, { title: string; sub: string; icon: any; cls: string }> = {
  client: { title: 'Müşterilerden', sub: 'Kaptan ve tekne sahiplerinden gelenler', icon: Users, cls: 'src-client' },
  team: { title: 'Ekip içi', sub: 'Personel, teknisyen ve sistem bildirimleri', icon: HardHat, cls: 'src-team' },
};

export default function Notifications() {
  const { staff } = useAuth();
  const [unread, setUnread] = useState(false);
  const [mobileTab, setMobileTab] = useState<Source>('client');
  const summary = useApi<any>('/notifications', { pageSize: 1 }).data;
  const readAll = useAction(() => api('/notifications/read-all', { body: {} }), { success: 'Tüm bildirimler okundu' });

  // Müşteri portalında tek liste yeterli
  if (!staff) {
    return (
      <div>
        <PageHeader title="Bildirimler" sub={summary ? `${summary.unread} okunmamış bildirim` : ''} actions={<button className="btn" disabled={!summary?.unread} onClick={() => readAll.mutate(undefined)}><CheckCheck /> Tümünü okundu yap</button>} />
        <NotifList unread={false} />
      </div>
    );
  }
  if (!summary) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Bildirimler"
        sub={`${summary.unread} okunmamış · ${summary.unreadClient} müşterilerden, ${summary.unreadTeam} ekip içi`}
        actions={<><div className="seg"><button className={!unread ? 'active' : ''} onClick={() => setUnread(false)}>Tümü</button><button className={unread ? 'active' : ''} onClick={() => setUnread(true)}>Okunmamış</button></div><button className="btn" disabled={!summary.unread} onClick={() => readAll.mutate(undefined)}><CheckCheck /> Tümünü okundu yap</button></>}
      />
      <div className="notif-switch">
        {(['client', 'team'] as Source[]).map((s) => {
          const S = SOURCES[s];
          const n = s === 'client' ? summary.unreadClient : summary.unreadTeam;
          return <button key={s} className={`${mobileTab === s ? 'active' : ''} ${S.cls}`} onClick={() => setMobileTab(s)}><S.icon size={16} /> {S.title}{n > 0 && <em>{n}</em>}</button>;
        })}
      </div>
      <div className="notif-cols">
        {(['client', 'team'] as Source[]).map((s) => (
          <NotifColumn key={s} source={s} unread={unread} hidden={mobileTab !== s} unreadCount={s === 'client' ? summary.unreadClient : summary.unreadTeam} total={s === 'client' ? summary.totalClient : summary.totalTeam} />
        ))}
      </div>
    </div>
  );
}

function NotifColumn({ source, unread, hidden, unreadCount, total }: { source: Source; unread: boolean; hidden: boolean; unreadCount: number; total: number }) {
  const S = SOURCES[source];
  const readAll = useAction(() => api('/notifications/read-all', { body: { source } }), { success: `${S.title}: tümü okundu` });
  return (
    <section className={`card notif-col ${S.cls}${hidden ? ' m-hidden' : ''}`}>
      <header className="nc-head">
        <span className="nc-ic"><S.icon /></span>
        <div className="grow"><b>{S.title} {unreadCount > 0 && <em>{unreadCount} yeni</em>}</b><span>{S.sub} · toplam {total}</span></div>
        <button className="btn btn-sm btn-ghost" disabled={!unreadCount} onClick={() => readAll.mutate(undefined)} title="Bu sütundakileri okundu yap"><CheckCheck /></button>
      </header>
      <NotifList source={source} unread={unread} compact />
    </section>
  );
}

function NotifList({ source, unread, compact }: { source?: Source; unread: boolean; compact?: boolean }) {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const pageSize = compact ? 15 : 30;
  const { data } = useApi<any>('/notifications', { unread: unread ? 'true' : undefined, source, page, pageSize });
  const read = useAction((id: string) => api(`/notifications/${id}/read`, { body: {} }));
  if (!data) return <Loading />;
  const body = (
    <>
      {data.items.length === 0 && <Empty title={unread ? 'Okunmamış bildirim yok' : 'Bildirim yok'} icon={<Bell />} />}
      {data.items.map((n: any) => {
        const [Icon, bg, fg] = ICONS[n.type] ?? [Bell, '#eef2f6', '#55677c'];
        return (
          <div key={n.id} className={`list-item clickable notif-item${n.readAt ? '' : ' unread'}`} onClick={() => { if (!n.readAt) read.mutate(n.id); if (n.link) nav(n.link); }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon size={18} /></span>
            <div className="grow">
              <div className="row" style={{ gap: 8 }}><b className="truncate">{n.title}</b>{!n.readAt && <span className="status-dot" style={{ background: 'var(--marine)' }} />}</div>
              {n.body && <div className="small muted truncate">{n.body}</div>}
              <div className="xs mt-1" style={{ color: fg }}>{NOTIFICATION_TYPES[n.type as keyof typeof NOTIFICATION_TYPES] ?? n.type} · <span className="muted">{relTime(n.createdAt)}</span></div>
            </div>
          </div>
        );
      })}
      {data.total > pageSize && <Pager page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
    </>
  );
  return compact ? body : <Card pad={false}>{body}</Card>;
}

