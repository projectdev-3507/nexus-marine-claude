import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Eye, EyeOff, Trash2, Upload, Clock } from 'lucide-react';
import { REPORT_TYPES, type ReportType } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl, fileUrl, uploadFiles } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, type Column } from '../components/ui';
import { useCustomerOptions, useVesselOptions } from '../lib/lookups';
import { fmtDate } from '../lib/format';
import { DOC_CATEGORY_LABELS } from '../lib/labels';

export default function Documents({ portal, embedded }: { portal?: boolean; embedded?: boolean }) {
  const { can } = useAuth();
  const ls = useListState();
  const [category, setCategory] = useState('');
  const [form, setForm] = useState(false);
  const { data, isLoading } = useApi<any>('/documents', { ...ls.query, category: category || undefined });
  const reports = useApi<any>(portal ? '/reports' : null).data?.items ?? [];
  const toggle = useAction((d: any) => api(`/documents/${d.id}`, { method: 'PUT', body: { customerVisible: !d.customerVisible } }), { success: 'Görünürlük güncellendi' });
  const del = useAction((d: any) => api(`/documents/${d.id}`, { method: 'DELETE' }), { success: 'Belge silindi' });
  const soon = (d: any) => d.expiryDate && new Date(d.expiryDate).getTime() - Date.now() < 30 * 864e5;
  const cols: Column<any>[] = [
    { key: 't', label: 'Belge', render: (d) => <div className="row"><FileText size={18} color="var(--marine)" /><div><div className="cell-title">{d.title}</div><div className="cell-sub">{d.attachment?.fileName ?? 'Dosya eklenmemiş'}</div></div></div> },
    { key: 'c', label: 'Kategori', render: (d) => <Badge tone="info" plain>{DOC_CATEGORY_LABELS[d.category]}</Badge> },
    { key: 'v', label: 'Tekne / Müşteri', render: (d) => <div>{d.vessel?.name ?? '—'}<div className="cell-sub">{d.customer?.name}</div></div> },
    { key: 'e', label: 'Geçerlilik', render: (d) => d.expiryDate ? <span style={{ color: soon(d) ? 'var(--danger)' : undefined, fontWeight: soon(d) ? 600 : 400 }}>{fmtDate(d.expiryDate)}</span> : '—' },
    ...(portal ? [] : [{ key: 'vis', label: 'Müşteri', render: (d: any) => d.customerVisible ? <Badge tone="ok">Görünür</Badge> : <Badge tone="neutral">Dahili</Badge> }]),
    { key: 'a', label: '', align: 'right', render: (d) => (
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
        {d.attachment && <a className="btn btn-sm" href={fileUrl(d.attachment.id)} target="_blank" rel="noreferrer">Aç</a>}
        {can('documents.manage') && <button className="btn btn-sm btn-ghost btn-icon" title="Müşteri görünürlüğü" onClick={() => toggle.mutate(d)}>{d.customerVisible ? <EyeOff /> : <Eye />}</button>}
        {can('documents.manage') && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => confirm('Belge silinsin mi?') && del.mutate(d)}><Trash2 /></button>}
      </div>
    ) },
  ];
  return (
    <div>
      {!embedded && <PageHeader title={portal ? 'Belgelerim' : 'Belgeler ve Sözleşmeler'} sub={portal ? 'Sözleşmeler, sertifikalar ve onaylı teknik raporlar' : 'Sözleşme, sertifika, sigorta ve teknik belge arşivi'} actions={can('documents.manage') && <button className="btn btn-primary" onClick={() => setForm(true)}><Plus /> Belge ekle</button>} />}
      {portal && reports.some((r: any) => r.approvalStatus === 'PENDING') && (
        <Card title={<span className="row" style={{ gap: 8 }}><Clock size={16} color="#e07b00" /> Onayınızı bekleyen belgeler</span>} pad={false} className="mb-2">
          {reports.filter((r: any) => r.approvalStatus === 'PENDING').map((r: any) => (
            <Link key={r.id} to={`/reports/${r.id}`} className="list-item clickable" style={{ textDecoration: 'none', color: 'inherit' }}>
              <FileText size={18} color="#e07b00" />
              <div className="grow"><div className="strong">{r.title}</div><div className="xs muted">{REPORT_TYPES[r.type as ReportType]} · gönderim {fmtDate(r.approvalRequestedAt)}</div></div>
              <span className="btn btn-sm btn-primary">İncele ve onayla</span>
            </Link>
          ))}
        </Card>
      )}
      {portal && reports.filter((r: any) => r.approvalStatus !== 'PENDING').length > 0 && (
        <Card title="Raporlar, teklif dosyaları ve protokoller" pad={false} className="mb-2">
          {reports.filter((r: any) => r.approvalStatus !== 'PENDING').map((r: any) => (
            <div key={r.id} className="list-item">
              <FileText size={18} color="var(--navy)" />
              <div className="grow">
                <Link to={`/reports/${r.id}`} className="strong">{r.title}</Link>
                <div className="xs muted">{r.number} · {fmtDate(r.updatedAt)}</div>
              </div>
              {r.approvalStatus === 'APPROVED' && <Badge tone="ok">Onaylandı</Badge>}
              {r.approvalStatus === 'REJECTED' && <Badge tone="danger">Reddedildi</Badge>}
              <a className="btn btn-sm" href={authedUrl(`/reports/${r.id}/pdf?download=1`)}>PDF</a>
            </div>
          ))}
        </Card>
      )}
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} />
          <select className="select sm" style={{ width: 170 }} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Tüm kategoriler</option>{Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <DocForm onClose={() => setForm(false)} />}
    </div>
  );
}

function DocForm({ onClose }: { onClose: () => void }) {
  const vessels = useVesselOptions();
  const customers = useCustomerOptions();
  const [f, setF] = useState({ title: '', category: 'CONTRACT', vesselId: '', customerId: '', customerVisible: false, expiryDate: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const save = useAction(async () => {
    const doc = await api('/documents', { body: { ...f, vesselId: f.vesselId || null, customerId: f.customerId || null, expiryDate: f.expiryDate || null } });
    if (file) {
      const [att] = await uploadFiles('DOCUMENT', doc.id, [file], { customerVisible: f.customerVisible });
      await api(`/documents/${doc.id}`, { method: 'PUT', body: { attachmentId: att.id } });
    }
    return doc;
  }, { success: 'Belge kaydedildi', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Yeni belge" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.title} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Belge adı" full><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Kategori"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Geçerlilik tarihi"><input className="input" type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={(e) => setF({ ...f, vesselId: e.target.value })}><option value="">—</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Müşteri"><select className="select" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">Tekne sahibinden</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Dosya" full>
          <label className="dropzone" style={{ display: 'block' }}>
            <input type="file" hidden accept="application/pdf,image/*,.docx,.doc" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Upload size={16} style={{ verticalAlign: -3 }} /> {file ? file.name : 'PDF, görsel veya Word dosyası seçin'}
          </label>
        </Field>
        <label className="checkbox full"><input type="checkbox" checked={f.customerVisible} onChange={(e) => setF({ ...f, customerVisible: e.target.checked })} /> Müşteri portalında yayınla</label>
      </div>
    </Modal>
  );
}
