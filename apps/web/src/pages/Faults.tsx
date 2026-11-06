import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, CheckCircle2 } from 'lucide-react';
import { PRIORITIES } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, StatusBadge, type Column } from '../components/ui';
import { useVesselOptions } from '../lib/lookups';
import { relTime } from '../lib/format';
import { FAULT_STATUS_LABELS, FAULT_TONE, PRIORITY_LABELS, PRIORITY_TONE } from '../lib/labels';

const SOURCE: Record<string, string> = { INSPECTION: 'Denetim', CUSTOMER: 'Müşteri / kaptan', MANUAL: 'Manuel' };

export default function Faults() {
  const nav = useNavigate();
  const { can } = useAuth();
  const ls = useListState();
  const [status, setStatus] = useState('OPEN,IN_PROGRESS');
  const [create, setCreate] = useState(false);
  const { data, isLoading } = useApi<any>('/faults', { ...ls.query, status: status || undefined });
  const toWO = useAction((id: string) => api(`/faults/${id}/work-order`, { body: {} }), { success: 'İş emri oluşturuldu', onSuccess: (w) => nav(`/work-orders/${w.id}`) });
  const resolve = useAction((id: string) => api(`/faults/${id}`, { method: 'PUT', body: { status: 'RESOLVED' } }), { success: 'Arıza giderildi olarak işaretlendi' });
  const cols: Column<any>[] = [
    { key: 't', label: 'Arıza', render: (f) => <div style={{ maxWidth: 380 }}><div className="cell-title">{f.title}</div><div className="cell-sub truncate">{f.description}</div></div> },
    { key: 'v', label: 'Tekne', render: (f) => <Link to={`/vessels/${f.vessel.id}`} onClick={(e) => e.stopPropagation()}>{f.vessel.name}</Link> },
    { key: 'src', label: 'Kaynak', render: (f) => <div>{SOURCE[f.source] ?? f.source}{f.inspectionItem && <div className="cell-sub"><Link to={`/inspections/${f.inspectionItem.inspection.id}`}>{f.inspectionItem.inspection.number} · {f.inspectionItem.itemCode}</Link></div>}</div> },
    { key: 'sev', label: 'Önem', render: (f) => <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={f.severity} /> },
    { key: 'd', label: 'Tarih', render: (f) => relTime(f.createdAt) },
    { key: 's', label: 'Durum', render: (f) => <StatusBadge map={FAULT_TONE} labels={FAULT_STATUS_LABELS} value={f.status} /> },
    { key: 'a', label: '', align: 'right', render: (f) => (
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {f.workOrder ? <Link className="btn btn-sm" to={`/work-orders/${f.workOrder.id}`}>{f.workOrder.number}</Link> : can('workorders.manage') && <button className="btn btn-sm btn-primary" onClick={() => toWO.mutate(f.id)}><ClipboardList /> İş emri aç</button>}
        {can('workorders.manage') && f.status !== 'RESOLVED' && <button className="btn btn-sm btn-ghost btn-icon" title="Giderildi" onClick={() => resolve.mutate(f.id)}><CheckCircle2 /></button>}
      </div>
    ) },
  ];
  return (
    <div>
      <PageHeader title="Arızalar" sub="Denetimlerden, müşterilerden ve personelden gelen arıza kayıtları" actions={can('faults.report') && <button className="btn btn-primary" onClick={() => setCreate(true)}><Plus /> Arıza bildir</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} />
          <div className="pill-filter">{[['OPEN,IN_PROGRESS', 'Açık'], ['OPEN', 'İşlem bekleyen'], ['RESOLVED', 'Giderilen'], ['', 'Tümü']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(f) => f.workOrder && nav(`/work-orders/${f.workOrder.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {create && <FaultForm onClose={() => setCreate(false)} />}
    </div>
  );
}

export function FaultForm({ onClose, vesselId }: { onClose: () => void; vesselId?: string }) {
  const vessels = useVesselOptions();
  const [f, setF] = useState({ vesselId: vesselId ?? '', title: '', description: '', severity: 'HIGH' });
  const save = useAction(() => api('/faults', { body: f }), { success: 'Arıza bildirildi, operasyon ekibi bilgilendirildi', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Arıza bildirimi" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-danger" disabled={!f.vesselId || f.title.length < 2} onClick={() => save.mutate(undefined)}>Bildir</button></>}>
      <div className="form-grid">
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={(e) => setF({ ...f, vesselId: e.target.value })}><option value="">— Seçin —</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Önem derecesi"><select className="select" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
        <Field label="Arıza başlığı" full><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Örn. Sintine pompası çalışmıyor" /></Field>
        <Field label="Açıklama" full><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
