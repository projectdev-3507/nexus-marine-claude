import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, FileSignature, FileText, Hourglass, Wallet } from 'lucide-react';
import { APPROVAL_STATUS_LABELS, CURRENCIES } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, DataTable, PageHeader, SearchInput, type Column } from '../components/ui';
import { fmtDate, fmtMoney } from '../lib/format';
import '../styles/analytics.css';
import '../styles/doc.css';

const money = (t?: Record<string, number> | null) => {
  const e = Object.entries(t ?? {}).filter(([, v]) => v);
  return e.length ? e.map(([c, v]) => fmtMoney(v, c)).join(' · ') : fmtMoney(0);
};

/** Finans ve Tahsilat (basit): yapılan teklif ve sözleşmeler, bedel (varsayılan: belgede yazan fiyat) ve "ödeme alındı" işareti */
export default function Collections() {
  const { can } = useAuth();
  const manage = can('finance.manage');
  const [status, setStatus] = useState<'all' | 'pending' | 'awaiting' | 'paid'>('all');
  const [q, setQ] = useState('');
  const { data, isLoading } = useApi<any>('/collections', { status, q: q || undefined });
  const upd = useAction((p: { id: string; body: any }) => api(`/collections/${p.id}`, { method: 'PUT', body: p.body }), { success: 'Kaydedildi' });
  const t = data?.totals;
  const c = data?.counts;

  const cols: Column<any>[] = [
    { key: 'n', label: 'Teklif / Sözleşme', render: (r) => <div><Link className="cell-title" to={`/contracts/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.title}</Link><div className="cell-sub mono">{r.number}{r.category ? ` · ${r.category}` : ''}</div></div> },
    { key: 'v', label: 'Tekne / Müşteri', render: (r) => <div>{r.vessel.name}<div className="cell-sub">{r.vessel.owner?.name ?? 'Tekne sahibi tanımlı değil'}</div></div> },
    {
      key: 'd',
      label: 'Müşteri onayı',
      render: (r) => (r.approvalStatus ? <div><Badge tone={r.approved ? 'ok' : r.approvalStatus === 'REJECTED' ? 'danger' : 'warn'}>{APPROVAL_STATUS_LABELS[r.approvalStatus as keyof typeof APPROVAL_STATUS_LABELS] ?? r.approvalStatus}</Badge>{r.approvedAt && <div className="cell-sub">{fmtDate(r.approvedAt)}</div>}</div> : <span className="muted small">Gönderilmedi</span>),
    },
    { key: 'a', label: 'Sözleşme bedeli', render: (r) => (manage ? <AmountEditor row={r} onSave={(body) => upd.mutate({ id: r.id, body })} /> : r.amount != null ? fmtMoney(r.amount, r.currency) : '—') },
    { key: 'r', label: 'Bekleyen', align: 'right', render: (r) => (r.paidAt ? <span className="mono" style={{ color: 'var(--ok, #16a34a)' }}>Ödendi</span> : r.amount == null ? '—' : <b className="mono" style={{ color: r.approved ? 'var(--warn, #b26a00)' : 'var(--muted, #6b7280)' }} title={r.approved ? 'Ödeme bekleniyor' : 'Müşteri onayı bekleniyor'}>{fmtMoney(r.remaining, r.currency)}</b>) },
    {
      key: 'p',
      label: 'Ödeme alındı',
      render: (r) => (
        <label className="pay-tick" title={r.paidAt ? `${r.paidBy ?? ''} · ${fmtDate(r.paidAt)}` : 'Ödeme alındı olarak işaretle'} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" disabled={!manage} checked={!!r.paidAt} onChange={(e) => (e.target.checked || confirm('"Ödeme alındı" işareti kaldırılsın mı?')) && upd.mutate({ id: r.id, body: { paid: e.target.checked } })} />
          {r.paidAt ? <span className="xs" style={{ color: 'var(--ok, #16a34a)' }}>{fmtDate(r.paidAt)}</span> : <span className="xs muted">Bekliyor</span>}
        </label>
      ),
    },
    { key: 'x', label: '', align: 'right', render: (r) => <a className="btn btn-sm" href={authedUrl(`/reports/${r.id}/pdf`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><FileText /> PDF</a> },
  ];

  return (
    <div>
      <PageHeader title="Finans ve Tahsilat" sub="Yapılan teklif ve sözleşmeler · bedel belgede yazan fiyattan gelir, değiştirilebilir · ödeme durumu" />
      <div className="an-kpis">
        <div className="an-kpi green"><span className="an-kpi-ic"><Wallet /></span><div><span className="an-kpi-label">Alınan tutar</span><b className="an-kpi-value">{money(t?.collected)}</b><span className="an-kpi-sub">{c?.paid ?? 0} belge "Ödeme alındı"</span></div></div>
        <div className="an-kpi amber"><span className="an-kpi-ic"><Clock /></span><div><span className="an-kpi-label">Bekleyen ödeme</span><b className="an-kpi-value">{money(t?.pending)}</b><span className="an-kpi-sub">{c?.pending ?? 0} onaylı sözleşme ödeme bekliyor</span></div></div>
        <div className="an-kpi blue"><span className="an-kpi-ic"><Hourglass /></span><div><span className="an-kpi-label">Onay bekleyen teklifler</span><b className="an-kpi-value">{money(t?.awaiting)}</b><span className="an-kpi-sub">{c?.awaiting ?? 0} teklif / sözleşme</span></div></div>
        <div className="an-kpi teal"><span className="an-kpi-ic"><CheckCircle2 /></span><div><span className="an-kpi-label">Onaylı sözleşme tutarı</span><b className="an-kpi-value">{money(t?.contracted)}</b><span className="an-kpi-sub">{c?.all ?? 0} teklif ve sözleşme</span></div></div>
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Teklif, sözleşme, tekne…" />
          <div className="seg">
            {([['all', `Tümü (${c?.all ?? 0})`], ['pending', `Ödeme bekleyen (${c?.pending ?? 0})`], ['awaiting', `Onay bekleyen (${c?.awaiting ?? 0})`], ['paid', `Ödendi (${c?.paid ?? 0})`]] as const).map(([k, l]) => (
              <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>
            ))}
          </div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} empty={<span><FileSignature size={15} /> Teklif veya sözleşme yok. Sözleşmeler sayfasından oluşturabilirsiniz.</span>} />
      </Card>
    </div>
  );
}

/** Sözleşme bedeli: belgedeki fiyat varsayılan gelir; değiştirilirse o tutar kullanılır, boşaltılırsa belgedeki fiyata döner */
function AmountEditor({ row, onSave }: { row: any; onSave: (body: any) => void }) {
  const str = (n: number | null) => (n != null ? String(n) : '');
  const [v, setV] = useState(str(row.amount));
  useEffect(() => setV(str(row.amount)), [row.amount]);
  const commit = () => {
    const n = v.trim() === '' ? null : Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v.trim()) ? v.trim().replace(/\./g, '').replace(',', '.') : v.trim().replace(',', '.'));
    if (n !== null && (isNaN(n) || n < 0)) return setV(str(row.amount));
    if (n === null && row.amountSource !== 'manual') return setV(str(row.amount));
    if (n !== row.amount || (n !== null && row.amountSource !== 'manual')) onSave({ amount: n, currency: row.currency });
  };
  const hint = row.amountSource === 'doc' ? 'Belgede yazan fiyat' : row.amountSource === 'manual' ? (row.docPrice ? `Elle girildi · belgede ${fmtMoney(row.docPrice.amount, row.docPrice.currency)} (boşaltınca belgedekine döner)` : 'Elle girildi') : 'Belgede fiyat bulunamadı';
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <span className="row" style={{ gap: 4 }}>
        <input className="input sm mono" style={{ width: 110 }} inputMode="decimal" placeholder="Tutar girin" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        <select className="select sm" style={{ width: 72 }} value={row.currency} onChange={(e) => onSave({ amount: row.amount, currency: e.target.value })}>
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </span>
      <div className="xs muted" style={{ marginTop: 2 }} title={hint}>{row.amountSource === 'doc' ? 'PDF fiyatı' : row.amountSource === 'manual' ? 'Elle girildi' : 'PDF\'te fiyat yok'}</div>
    </div>
  );
}
