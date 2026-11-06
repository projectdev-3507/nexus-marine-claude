import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Phone, Mail, MapPin, Pencil, Ship, MessageSquarePlus } from 'lucide-react';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Avatar, Card, DataTable, Empty, Field, Loading, Modal, PageHeader, Pager, SearchInput, StatusBadge, Tabs, type Column } from '../components/ui';
import { WorkOrderForm } from './WorkOrders';
import { fmtDate, fmtMoney, relTime } from '../lib/format';
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TONE, DOC_CATEGORY_LABELS, MAINTENANCE_STATUS_LABELS, MAINT_TONE, PRIORITY_LABELS, PRIORITY_TONE, QUOTE_STATUS_LABELS, QUOTE_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

export function CustomersList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const ls = useListState({ sort: 'name', order: 'asc' });
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<any | null>(null);
  const { data, isLoading } = useApi<any>('/customers', { ...ls.query, status: status || undefined });
  const cols: Column<any>[] = [
    { key: 'name', label: 'Müşteri', sortable: true, render: (c) => <div className="row"><Avatar name={c.name} /><div><div className="cell-title">{c.name}</div><div className="cell-sub">{c.company}</div></div></div> },
    { key: 'contact', label: 'İletişim', render: (c) => <div><div>{c.phone ?? '—'}</div><div className="cell-sub">{c.email}</div></div> },
    { key: 'vessels', label: 'Teknesi', render: (c) => c.vessels.map((v: any) => v.name).join(', ') || '—' },
    { key: 'marina', label: 'Marina', render: (c) => [...new Set(c.vessels.map((v: any) => v.marina))].join(', ') || '—' },
    { key: 'status', label: 'Durum', sortable: true, render: (c) => <StatusBadge map={CUSTOMER_TONE} labels={CUSTOMER_STATUS_LABELS} value={c.status} /> },
    { key: 'last', label: 'Son servis', render: (c) => fmtDate(c.lastServiceAt) },
    { key: 'next', label: 'Yaklaşan bakım', render: (c) => c.nextMaintenanceAt ? <b style={{ color: new Date(c.nextMaintenanceAt) < new Date() ? 'var(--danger)' : undefined }}>{fmtDate(c.nextMaintenanceAt)}</b> : '—' },
  ];
  return (
    <div>
      <PageHeader title="Müşteriler" sub="Tekne sahipleri ve CRM kayıtları" actions={can('customers.manage') && <button className="btn btn-primary" onClick={() => setForm({})}><Plus /> Yeni Müşteri</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Ad, firma, e-posta, tekne..." />
          <div className="pill-filter">{[['', 'Tümü'], ['ACTIVE', 'Aktif'], ['PENDING', 'Beklemede'], ['INACTIVE', 'Pasif']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} sort={ls.sort} onSort={ls.onSort} onRowClick={(c) => nav(`/customers/${c.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <CustomerForm initial={form} onClose={() => setForm(null)} onSaved={(c) => nav(`/customers/${c.id}`)} />}
    </div>
  );
}

function CustomerForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved?: (c: any) => void }) {
  const [f, setF] = useState<any>({ name: '', company: '', email: '', phone: '', address: '', taxNumber: '', status: 'ACTIVE', ...initial });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => {
    const body = { name: f.name, company: f.company, email: f.email, phone: f.phone, address: f.address, taxNumber: f.taxNumber, status: f.status };
    return f.id ? api(`/customers/${f.id}`, { method: 'PUT', body }) : api('/customers', { body });
  }, { success: 'Müşteri kaydedildi', onSuccess: (c) => { onClose(); onSaved?.(c); } });
  return (
    <Modal open onClose={onClose} title={f.id ? 'Müşteriyi düzenle' : 'Yeni müşteri'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={f.name.length < 2} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Ad soyad"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Firma"><input className="input" value={f.company ?? ''} onChange={set('company')} /></Field>
        <Field label="E-posta"><input className="input" type="email" value={f.email ?? ''} onChange={set('email')} /></Field>
        <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="Vergi no"><input className="input" value={f.taxNumber ?? ''} onChange={set('taxNumber')} /></Field>
        <Field label="Durum"><select className="select" value={f.status} onChange={set('status')}>{Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Adres" full><textarea className="textarea" value={f.address ?? ''} onChange={set('address')} /></Field>
      </div>
    </Modal>
  );
}

type TabKey = 'vessels' | 'history' | 'open' | 'upcoming' | 'quotes' | 'notes' | 'docs';

export function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const { data: c } = useApi<any>(`/customers/${id}`);
  const [tab, setTab] = useState<TabKey>('vessels');
  const [edit, setEdit] = useState(false);
  const [req, setReq] = useState(false);
  const [note, setNote] = useState('');
  const addNote = useAction(() => api(`/customers/${id}/notes`, { body: { body: note } }), { success: 'Not eklendi', onSuccess: () => setNote('') });
  if (!c) return <Loading />;
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'vessels', label: 'Tekneler', count: c.vessels.length },
    { key: 'history', label: 'Servis Geçmişi', count: c.history.length },
    { key: 'open', label: 'Açık İşler', count: c.openWork.length },
    { key: 'upcoming', label: 'Yaklaşan Bakımlar', count: c.upcoming.length },
    ...(can('finance.view') ? [{ key: 'quotes' as TabKey, label: 'Teklifler ve Onaylar', count: c.quotes.length }] : []),
    { key: 'notes', label: 'Notlar', count: c.notes.length },
    { key: 'docs', label: 'Belgeler', count: c.documents.length },
  ];
  return (
    <div>
      <PageHeader
        crumbs={<><Link to="/customers">Müşteriler</Link> / {c.name}</>}
        title={<span className="row" style={{ gap: 14 }}><Avatar name={c.name} size="lg" /><span>{c.name}<div className="small muted" style={{ fontWeight: 500 }}>{c.company}</div></span></span>}
        actions={<>
          {can('workorders.manage') && <button className="btn btn-primary" onClick={() => setReq(true)}><MessageSquarePlus /> Servis talebi aç</button>}
          {can('customers.manage') && <button className="btn" onClick={() => setEdit(true)}><Pencil /> Düzenle</button>}
        </>}
      />
      <div className="grid g-side">
        <div>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === 'vessels' && (
            <div className="grid g-2">
              {c.vessels.length === 0 && <Card><Empty title="Kayıtlı tekne yok" /></Card>}
              {c.vessels.map((v: any) => (
                <div key={v.id} className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => nav(`/vessels/${v.id}`)}>
                  <div className="row"><div className="avatar" style={{ borderRadius: 10, background: 'var(--navy)', color: '#fff' }}><Ship size={16} /></div><div><h3>{v.name}</h3><div className="small muted">{[v.make, v.model, v.year].filter(Boolean).join(' · ')}</div></div></div>
                  <div className="small mt-2"><MapPin size={13} style={{ verticalAlign: -2 }} /> {v.marina} · {v.berth}</div>
                  <div className="xs muted mt-1">{v.engines.map((e: any) => `${e.position}: ${e.hours} s`).join(' · ')}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'history' && <WOList rows={c.history} />}
          {tab === 'open' && <WOList rows={c.openWork} />}
          {tab === 'upcoming' && (
            <Card pad={false}><DataTable rows={c.upcoming} onRowClick={(m: any) => nav(`/maintenance?id=${m.id}`)} columns={[
              { key: 'd', label: 'Tarih', render: (m: any) => <b>{fmtDate(m.plannedDate)}</b> },
              { key: 't', label: 'Bakım', render: (m: any) => m.title },
              { key: 'v', label: 'Tekne', render: (m: any) => m.vessel.name },
              { key: 's', label: 'Durum', render: (m: any) => <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} /> },
            ]} /></Card>
          )}
          {tab === 'quotes' && (
            <Card pad={false}><DataTable rows={c.quotes} onRowClick={(q: any) => nav(`/finance/quotes/${q.id}`)} columns={[
              { key: 'n', label: 'No', render: (q: any) => <span className="mono strong">{q.number}</span> },
              { key: 't', label: 'Başlık', render: (q: any) => q.title },
              { key: 'a', label: 'Tutar', align: 'right', render: (q: any) => fmtMoney(q.items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0) * (1 + q.vatRate / 100), q.currency) },
              { key: 's', label: 'Durum', render: (q: any) => <StatusBadge map={QUOTE_TONE} labels={QUOTE_STATUS_LABELS} value={q.status} /> },
              { key: 'd', label: 'Onay / ret', render: (q: any) => fmtDate(q.approvedAt ?? q.rejectedAt) },
            ]} /></Card>
          )}
          {tab === 'notes' && (
            <Card>
              {can('customers.manage') && <div className="stack mb-2" style={{ gap: 8 }}><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Görüşme notu, tercih, hatırlatma..." /><div><button className="btn btn-primary btn-sm" disabled={!note.trim()} onClick={() => addNote.mutate(undefined)}>Not ekle</button></div></div>}
              <div className="timeline">{c.notes.map((n: any) => <div key={n.id} className="tl-item"><div className="small">{n.body}</div><div className="xs muted">{n.author.name} · {relTime(n.createdAt)}</div></div>)}</div>
              {c.notes.length === 0 && <Empty title="Not yok" />}
            </Card>
          )}
          {tab === 'docs' && (
            <Card pad={false}>{c.documents.length === 0 && <Empty />}{c.documents.map((d: any) => <div key={d.id} className="list-item"><div className="grow"><b>{d.title}</b><div className="xs muted">{DOC_CATEGORY_LABELS[d.category]}</div></div>{d.expiryDate && <span className="small">{fmtDate(d.expiryDate)}</span>}</div>)}</Card>
          )}
        </div>
        <div className="stack">
          <Card title="Müşteri bilgileri">
            <div className="stack small" style={{ gap: 10 }}>
              <StatusBadge map={CUSTOMER_TONE} labels={CUSTOMER_STATUS_LABELS} value={c.status} />
              {c.phone && <a href={`tel:${c.phone}`} className="row" style={{ gap: 8 }}><Phone size={15} /> {c.phone}</a>}
              {c.email && <a href={`mailto:${c.email}`} className="row" style={{ gap: 8 }}><Mail size={15} /> {c.email}</a>}
              {c.address && <span className="row" style={{ gap: 8 }}><MapPin size={15} /> {c.address}</span>}
              {c.taxNumber && <span className="muted">Vergi no: {c.taxNumber}</span>}
            </div>
          </Card>
          <Card title="Portal hesapları" pad={false}>
            {c.users.length === 0 && <Empty title="Portal hesabı yok" text="Kullanıcı yönetiminden tekne sahibi rolüyle hesap açabilirsiniz." />}
            {c.users.map((u: any) => <div key={u.id} className="list-item"><Avatar name={u.name} size="sm" /><div className="grow"><b className="small">{u.name}</b><div className="xs muted">{u.email}</div></div>{!u.isActive && <span className="xs muted">Pasif</span>}</div>)}
          </Card>
          {can('finance.view') && c.payments.length > 0 && (
            <Card title="Ödemeler" pad={false}>{c.payments.map((p: any) => <div key={p.id} className="list-item"><div className="grow small">{fmtDate(p.date)} · {p.method}</div><b className="mono">{fmtMoney(p.amount, p.currency)}</b></div>)}</Card>
          )}
        </div>
      </div>
      {edit && <CustomerForm initial={c} onClose={() => setEdit(false)} />}
      {req && <WorkOrderForm vesselId={c.vessels[0]?.id} onClose={() => setReq(false)} onCreated={(w) => nav(`/work-orders/${w.id}`)} />}
    </div>
  );
}

function WOList({ rows }: { rows: any[] }) {
  const nav = useNavigate();
  return (
    <Card pad={false}><DataTable rows={rows} onRowClick={(w: any) => nav(`/work-orders/${w.id}`)} columns={[
      { key: 'n', label: 'No', render: (w: any) => <span className="mono strong">{w.number}</span> },
      { key: 't', label: 'İş', render: (w: any) => <div><div className="cell-title">{w.title}</div><div className="cell-sub">{w.vessel.name}</div></div> },
      { key: 'p', label: 'Öncelik / Tarih', render: (w: any) => w.priority ? <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={w.priority} /> : fmtDate(w.finishedAt) },
      { key: 's', label: 'Durum', render: (w: any) => <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /> },
    ]} /></Card>
  );
}
