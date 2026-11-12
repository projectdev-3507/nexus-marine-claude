import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { INSPECTION_ITEM_COUNT } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, Progress, SearchInput, StatusBadge, type Column } from '../components/ui';
import { useVesselOptions } from '../lib/lookups';
import { fmtDate } from '../lib/format';
import { INSP_STATUS_LABELS, INSP_TONE } from '../lib/labels';

export default function Inspections() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const ls = useListState();
  const [status, setStatus] = useState('');
  const { data, isLoading } = useApi<any>('/inspections', { ...ls.query, status: status || undefined });
  const creating = sp.get('new') === '1';
  const cols: Column<any>[] = [
    { key: 'n', label: 'Denetim', render: (i) => <div><div className="mono strong" style={{ color: 'var(--navy)' }}>{i.number}</div><div className="cell-sub">{fmtDate(i.date)}</div></div> },
    { key: 'v', label: 'Tekne', render: (i) => <div><div className="cell-title">{i.vessel.name}</div><div className="cell-sub">{i.vessel.marina}</div></div> },
    { key: 'i', label: 'Denetçi / Kaptan', render: (i) => <div><div>{i.inspector.name}</div><div className="cell-sub">{i.captainName}</div></div> },
    { key: 'p', label: 'İlerleme', render: (i) => <div style={{ minWidth: 120 }}><Progress value={(i.stats.filled / i.stats.total) * 100} /><div className="xs muted mt-1">{i.stats.filled}/{i.stats.total} madde</div></div> },
    { key: 'r', label: 'Sonuçlar', render: (i) => <div className="row-wrap" style={{ gap: 4 }}><Badge tone="ok" plain>{i.stats.ok}</Badge><Badge tone="warn" plain>{i.stats.attention}</Badge><Badge tone="danger" plain>{i.stats.fault}</Badge><Badge tone="neutral" plain>{i.stats.na}</Badge></div> },
    { key: 's', label: 'Durum', render: (i) => <span className="row-wrap" style={{ gap: 4 }}><StatusBadge map={INSP_TONE} labels={INSP_STATUS_LABELS} value={i.status} />{i.report?.status === 'PUBLISHED' && <Badge tone="info">Yayınlandı</Badge>}</span> },
    { key: 'pdf', label: '', align: 'right', render: (i) => <a className="btn btn-sm" href={authedUrl(`/inspections/${i.id}/pdf`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><FileText /> PDF</a> },
  ];
  return (
    <div>
      <PageHeader title="Dijital Denetimler" sub={`Haftalık Periyodik Tekne Kontrol ve Teknik Denetim Matrisi · 19 bölüm · ${INSPECTION_ITEM_COUNT} kontrol maddesi`} actions={can('inspections.perform') && <button className="btn btn-primary" onClick={() => setSp({ new: '1' })}><Plus /> Yeni Denetim</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Denetim no veya tekne..." />
          <div className="pill-filter">
            {[['', 'Tümü'], ['DRAFT', 'Taslak'], ['SUBMITTED', 'Onay bekleyen'], ['APPROVED', 'Onaylı']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}
          </div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(i) => nav(`/inspections/${i.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {creating && <NewInspection onClose={() => setSp({})} />}
    </div>
  );
}

function NewInspection({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const vessels = useVesselOptions();
  const [vesselId, setVesselId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const create = useAction(() => api('/inspections', { body: { vesselId, date } }), { success: 'Denetim formu oluşturuldu', onSuccess: (r) => nav(`/inspections/${r.id}`) });
  return (
    <Modal open onClose={onClose} title="Yeni teknik denetim" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!vesselId} onClick={() => create.mutate(undefined)}>Denetimi başlat</button></>}>
      <div className="form-grid">
        <Field label="Tekne"><select className="select" value={vesselId} onChange={(e) => setVesselId(e.target.value)}><option value="">— Seçin —</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Denetim tarihi"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="notice mt-2">Form, 19 bölümlük standart Nexus Marin denetim matrisiyle oluşturulur. Bir önceki denetimin sonuçları her maddede referans olarak gösterilir.</div>
    </Modal>
  );
}
