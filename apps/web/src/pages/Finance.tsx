import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Send, Trash2, Check, X, Save, Printer } from 'lucide-react';
import { CURRENCIES } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, DataTable, Empty, Field, Loading, Modal, PageHeader, Pager, SearchInput, StatusBadge, Tabs, type Column } from '../components/ui';
import { useCustomerOptions, useVesselOptions } from '../lib/lookups';
import { fmtDate, fmtMoney, toInputDate } from '../lib/format';
import { QUOTE_STATUS_LABELS, QUOTE_TONE } from '../lib/labels';

export default function Finance() {
  const [tab, setTab] = useState<'quotes' | 'summary' | 'payments'>('quotes');
  return (
    <div>
      <PageHeader title="Teklifler ve Finans" sub="Manuel finans takibi · teklif, tahsilat ve bakiye yönetimi" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'quotes', label: 'Teklifler' }, { key: 'summary', label: 'Proje Bakiyeleri' }, { key: 'payments', label: 'Tahsilatlar' }]} />
      {tab === 'quotes' && <QuotesList />}
      {tab === 'summary' && <Summary />}
      {tab === 'payments' && <Payments />}
    </div>
  );
}

export function QuotesList({ portal, embedded }: { portal?: boolean; embedded?: boolean }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const ls = useListState();
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(false);
  const { data, isLoading } = useApi<any>('/quotes', { ...ls.query, status: status || undefined });
  const base = portal ? '/quotes' : '/finance/quotes';
  const cols: Column<any>[] = [
    { key: 'n', label: 'Teklif', render: (q) => <div><div className="cell-title">{q.title}</div><div className="cell-sub mono">{q.number} · {fmtDate(q.createdAt)}</div></div> },
    ...(portal ? [] : [{ key: 'c', label: 'Müşteri / Tekne', render: (q: any) => <div>{q.customer.name}<div className="cell-sub">{q.vessel?.name}</div></div> }]),
    { key: 'v', label: 'Geçerlilik', render: (q) => fmtDate(q.validUntil) },
    { key: 't', label: 'Toplam (KDV dahil)', align: 'right', render: (q) => <b className="mono">{fmtMoney(q.total, q.currency)}</b> },
    { key: 's', label: 'Durum', render: (q) => <StatusBadge map={QUOTE_TONE} labels={QUOTE_STATUS_LABELS} value={q.status} /> },
  ];
  return (
    <>
      {portal && !embedded && <PageHeader title="Teklifler" sub="Size iletilen teklifleri inceleyin, onaylayın veya reddedin." />}
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} />
          <div className="pill-filter">{[['', 'Tümü'], ...(portal ? [] : [['DRAFT', 'Taslak']]), ['SENT', 'Yanıt bekleyen'], ['APPROVED', 'Onaylı'], ['REJECTED', 'Reddedilen']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
          <span className="spacer" />
          {can('finance.manage') && <button className="btn btn-primary btn-sm" onClick={() => setForm(true)}><Plus /> Yeni Teklif</button>}
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(q) => nav(`${base}/${q.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <QuoteEditor onClose={() => setForm(false)} onSaved={(q) => nav(`/finance/quotes/${q.id}`)} />}
    </>
  );
}

function QuoteEditor({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved?: (q: any) => void }) {
  const customers = useCustomerOptions();
  const vessels = useVesselOptions();
  const [f, setF] = useState<any>({ customerId: '', vesselId: '', title: '', currency: 'EUR', vatRate: 20, validUntil: toInputDate(new Date(Date.now() + 30 * 864e5)), notes: '', items: [{ description: '', quantity: 1, unit: 'adet', unitPrice: 0 }], ...initial, ...(initial ? { validUntil: toInputDate(initial.validUntil), vesselId: initial.vesselId ?? '' } : {}) });
  const custVessels = vessels.filter((v) => !f.customerId || v.owner?.id === f.customerId);
  const sub = f.items.reduce((s: number, i: any) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const save = useAction(() => {
    const body = { customerId: f.customerId, vesselId: f.vesselId || null, title: f.title, currency: f.currency, vatRate: Number(f.vatRate), validUntil: f.validUntil || null, notes: f.notes || null, items: f.items.filter((i: any) => i.description).map((i: any) => ({ description: i.description, quantity: Number(i.quantity), unit: i.unit, unitPrice: Number(i.unitPrice) })) };
    return initial ? api(`/quotes/${initial.id}`, { method: 'PUT', body }) : api('/quotes', { body });
  }, { success: 'Teklif kaydedildi', onSuccess: (q) => { onClose(); onSaved?.(q); } });
  const setItem = (i: number, k: string, v: any) => setF({ ...f, items: f.items.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)) });
  return (
    <Modal open onClose={onClose} size="lg" title={initial ? `${initial.number} — düzenle` : 'Yeni teklif'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.customerId || f.title.length < 2 || !f.items.some((i: any) => i.description)} onClick={() => save.mutate(undefined)}><Save /> Kaydet</button></>}>
      <div className="form-grid cols-3">
        <Field label="Müşteri"><select className="select" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value, vesselId: '' })}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={(e) => setF({ ...f, vesselId: e.target.value })}><option value="">—</option>{custVessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Geçerlilik"><input className="input" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
        <Field label="Teklif başlığı" full><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Para birimi"><select className="select" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="KDV (%)"><input className="input" type="number" value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: e.target.value })} /></Field>
      </div>
      <div className="divider" />
      <h3 className="mb-2">İş kalemleri</h3>
      <div className="form-grid" style={{ gridTemplateColumns: '3fr 0.8fr 0.8fr 1fr 1fr 34px' }}>
        {['Açıklama', 'Adet/m²', 'Birim', 'Birim fiyat', 'Toplam', ''].map((h) => <span key={h} className="xs muted strong">{h.toUpperCase()}</span>)}
      </div>
      {f.items.map((it: any, i: number) => (
        <div key={i} className="form-grid" style={{ gridTemplateColumns: '3fr 0.8fr 0.8fr 1fr 1fr 34px', marginTop: 6 }}>
          <input className="input sm" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
          <input className="input sm" type="number" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
          <select className="select sm" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)}>{['adet', 'm²', 'saat', 'paket', 'gün', 'L', 'kg'].map((u) => <option key={u}>{u}</option>)}</select>
          <input className="input sm" type="number" value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} />
          <div className="mono small" style={{ alignSelf: 'center', textAlign: 'right' }}>{fmtMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), f.currency)}</div>
          <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setF({ ...f, items: f.items.filter((_: any, j: number) => j !== i) })}><Trash2 /></button>
        </div>
      ))}
      <button className="btn btn-sm mt-2" onClick={() => setF({ ...f, items: [...f.items, { description: '', quantity: 1, unit: 'adet', unitPrice: 0 }] })}><Plus /> Kalem ekle</button>
      <div className="stack mt-2" style={{ alignItems: 'flex-end', gap: 4 }}>
        <div className="small">Ara toplam: <b className="mono">{fmtMoney(sub, f.currency)}</b></div>
        <div className="small">KDV (%{f.vatRate}): <b className="mono">{fmtMoney((sub * Number(f.vatRate)) / 100, f.currency)}</b></div>
        <div style={{ fontSize: 17 }}>Genel toplam: <b className="mono">{fmtMoney(sub * (1 + Number(f.vatRate) / 100), f.currency)}</b></div>
      </div>
      <Field label="Notlar"><textarea className="textarea" value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}

export function QuoteDetail() {
  const { id } = useParams();
  const { can, staff } = useAuth();
  const { data: q } = useApi<any>(`/quotes/${id}`);
  const [edit, setEdit] = useState(false);
  const [respond, setRespond] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [note, setNote] = useState('');
  const send = useAction(() => api(`/quotes/${id}/send`, { body: {} }), { success: 'Teklif müşteriye gönderildi' });
  const answer = useAction(() => api(`/quotes/${id}/respond`, { body: { decision: respond, note } }), { success: 'Yanıtınız iletildi', onSuccess: () => setRespond(null) });
  if (!q) return <Loading />;
  return (
    <div>
      <PageHeader
        crumbs={staff ? <><Link to="/finance">Teklifler ve Finans</Link> / {q.number}</> : <Link to="/quotes">Teklifler</Link>}
        title={q.title}
        sub={<span className="row-wrap" style={{ gap: 8 }}><span className="mono strong">{q.number}</span><StatusBadge map={QUOTE_TONE} labels={QUOTE_STATUS_LABELS} value={q.status} />{q.vessel && <span>{q.vessel.name}</span>}</span>}
        actions={<>
          <button className="btn" onClick={() => window.print()}><Printer /> Yazdır</button>
          {can('finance.manage') && ['DRAFT', 'SENT'].includes(q.status) && <button className="btn" onClick={() => setEdit(true)}>Düzenle</button>}
          {can('finance.manage') && q.status === 'DRAFT' && <button className="btn btn-primary" onClick={() => send.mutate(undefined)}><Send /> Müşteriye gönder</button>}
          {can('quotes.respond') && q.status === 'SENT' && <><button className="btn btn-success" onClick={() => setRespond('APPROVED')}><Check /> Onayla</button><button className="btn" onClick={() => setRespond('REJECTED')}><X /> Reddet</button></>}
        </>}
      />
      <div className="grid g-side">
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>İş kalemi</th><th style={{ textAlign: 'right' }}>Miktar</th><th style={{ textAlign: 'right' }}>Birim fiyat</th><th style={{ textAlign: 'right' }}>Toplam</th></tr></thead>
              <tbody>
                {q.items.map((i: any, n: number) => (
                  <tr key={i.id}><td className="muted">{n + 1}</td><td className="strong">{i.description}</td><td style={{ textAlign: 'right' }} className="mono">{i.quantity} {i.unit}</td><td style={{ textAlign: 'right' }} className="mono">{fmtMoney(i.unitPrice, q.currency)}</td><td style={{ textAlign: 'right' }} className="mono strong">{fmtMoney(i.quantity * i.unitPrice, q.currency)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-body stack" style={{ alignItems: 'flex-end', gap: 4, borderTop: '1px solid var(--border)' }}>
            <div className="small">Ara toplam: <b className="mono">{fmtMoney(q.subtotal, q.currency)}</b></div>
            <div className="small">KDV (%{q.vatRate}): <b className="mono">{fmtMoney(q.vat, q.currency)}</b></div>
            <div style={{ fontSize: 19, color: 'var(--navy)' }}>Genel toplam: <b className="mono">{fmtMoney(q.total, q.currency)}</b></div>
          </div>
        </Card>
        <div className="stack">
          <Card title="Teklif bilgileri">
            <div className="stack small" style={{ gap: 8 }}>
              <div><span className="muted">Müşteri:</span> <b>{q.customer.name}</b></div>
              {q.vessel && <div><span className="muted">Tekne:</span> {q.vessel.name}</div>}
              <div><span className="muted">Oluşturma:</span> {fmtDate(q.createdAt)}</div>
              <div><span className="muted">Geçerlilik:</span> {fmtDate(q.validUntil)}</div>
              {q.sentAt && <div><span className="muted">Gönderim:</span> {fmtDate(q.sentAt)}</div>}
              {q.approvedAt && <div style={{ color: 'var(--ok)' }}><b>Onay tarihi: {fmtDate(q.approvedAt)}</b></div>}
              {q.rejectedAt && <div style={{ color: 'var(--danger)' }}><b>Ret tarihi: {fmtDate(q.rejectedAt)}</b></div>}
              {q.responseNote && <div className="notice">Müşteri notu: {q.responseNote}</div>}
            </div>
          </Card>
          {q.notes && <Card title="Notlar"><p className="small">{q.notes}</p></Card>}
        </div>
      </div>
      {edit && <QuoteEditor initial={q} onClose={() => setEdit(false)} />}
      <Modal open={!!respond} onClose={() => setRespond(null)} title={respond === 'APPROVED' ? 'Teklifi onayla' : 'Teklifi reddet'} footer={<><button className="btn" onClick={() => setRespond(null)}>Vazgeç</button><button className={`btn ${respond === 'APPROVED' ? 'btn-success' : 'btn-danger'}`} onClick={() => answer.mutate(undefined)}>{respond === 'APPROVED' ? 'Onaylıyorum' : 'Reddet'}</button></>}>
        <p className="mb-2">{q.title} · <b>{fmtMoney(q.total, q.currency)}</b></p>
        <Field label="Not (isteğe bağlı)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

function Summary() {
  const nav = useNavigate();
  const { data } = useApi<any>('/payments/summary');
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="grid g-3">
        <div className="card card-pad"><div className="xs muted">Onaylı teklifler toplamı</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{fmtMoney(data.approvedQuotesTotal)}</div></div>
        <div className="card card-pad"><div className="xs muted">Toplam tahsilat</div><div className="kpi-value mt-1" style={{ fontSize: 24, color: 'var(--ok)' }}>{fmtMoney(data.collected)}</div></div>
        <div className="card card-pad"><div className="xs muted">Açık bakiye</div><div className="kpi-value mt-1" style={{ fontSize: 24, color: 'var(--warn)' }}>{fmtMoney(data.outstanding)}</div></div>
      </div>
      <Card pad={false} title="Proje bakiyeleri">
        <DataTable rows={data.projects} onRowClick={(p: any) => nav(`/projects/${p.id}`)} columns={[
          { key: 'n', label: 'Proje', render: (p: any) => <div><div className="cell-title">{p.name}</div><div className="cell-sub">{p.vessel}</div></div> },
          { key: 'c', label: 'Proje bedeli', align: 'right', render: (p: any) => <span className="mono">{fmtMoney(p.contract, p.currency)}</span> },
          { key: 'p', label: 'Alınan', align: 'right', render: (p: any) => <span className="mono" style={{ color: 'var(--ok)' }}>{fmtMoney(p.paid, p.currency)}</span> },
          { key: 'b', label: 'Kalan', align: 'right', render: (p: any) => <b className="mono">{fmtMoney(p.balance, p.currency)}</b> },
          { key: 'o', label: 'Gecikmiş taksit', align: 'right', render: (p: any) => p.overdue ? <span className="mono" style={{ color: 'var(--danger)' }}>{fmtMoney(p.overdue, p.currency)}</span> : '—' },
          { key: 's', label: 'Tahsilat durumu', render: (p: any) => <Badge tone={p.status === 'PAID' ? 'ok' : p.status === 'PARTIAL' ? 'warn' : 'neutral'}>{p.status === 'PAID' ? 'Ödendi' : p.status === 'PARTIAL' ? 'Kısmi' : 'Ödenmedi'}</Badge> },
        ]} empty={<Empty title="Proje yok" />} />
      </Card>
    </div>
  );
}

function Payments() {
  const ls = useListState();
  const { data, isLoading } = useApi<any>('/payments', ls.query);
  return (
    <Card pad={false}>
      <DataTable loading={isLoading} rows={data?.items ?? []} columns={[
        { key: 'd', label: 'Tarih', render: (p: any) => fmtDate(p.date) },
        { key: 'c', label: 'Müşteri', render: (p: any) => p.customer.name },
        { key: 'r', label: 'Referans', render: (p: any) => p.project?.name ?? p.quote?.number ?? '—' },
        { key: 'm', label: 'Yöntem', render: (p: any) => <div>{p.method}<div className="cell-sub">{p.note}</div></div> },
        { key: 'a', label: 'Tutar', align: 'right', render: (p: any) => <b className="mono">{fmtMoney(p.amount, p.currency)}</b> },
      ]} />
      {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
    </Card>
  );
}

