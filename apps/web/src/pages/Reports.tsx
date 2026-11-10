import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { APPROVAL_STATUS_LABELS, REPORT_TYPES, type ReportType } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, StatusBadge, Tabs, type Column } from '../components/ui';
import { useVesselOptions } from '../lib/lookups';
import { fmtDate } from '../lib/format';
import { REPORT_STATUS_LABELS, REPORT_TONE } from '../lib/labels';

export default function Reports() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const ls = useListState();
  const [type, setType] = useState<string>('ALL');
  const [approval, setApproval] = useState<string>('');
  const { data, isLoading } = useApi<any>('/reports', { ...ls.query, type: type === 'ALL' ? undefined : type, approval: approval || undefined });
  const pendingCount = useApi<any>('/reports', { approval: 'PENDING', pageSize: 1 }).data?.total ?? 0;
  const cols: Column<any>[] = [
    { key: 'n', label: 'Belge', render: (r) => <div><div className="cell-title">{r.title}</div><div className="cell-sub mono">{r.number} · v{r.currentVersion}</div></div> },
    { key: 't', label: 'Tür', render: (r) => REPORT_TYPES[r.type as ReportType] },
    { key: 'v', label: 'Tekne', render: (r) => r.vessel.name },
    { key: 'd', label: 'Güncelleme', render: (r) => fmtDate(r.updatedAt) },
    { key: 's', label: 'Durum', render: (r) => <StatusBadge map={REPORT_TONE} labels={REPORT_STATUS_LABELS} value={r.status} /> },
    { key: 'a', label: 'Müşteri onayı', render: (r) => r.approvalStatus ? <Badge tone={r.approvalStatus === 'APPROVED' ? 'ok' : r.approvalStatus === 'REJECTED' ? 'danger' : 'warn'}>{APPROVAL_STATUS_LABELS[r.approvalStatus]}</Badge> : <span className="muted">—</span> },
    { key: 'p', label: '', align: 'right', render: (r) => <a className="btn btn-sm" href={authedUrl(`/reports/${r.id}/pdf`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><FileText /> PDF</a> },
  ];
  return (
    <div>
      <PageHeader title="Raporlar ve Sözleşmeler" sub="Teknik raporlar, proje teklif dosyaları ve teslim protokolleri · sürümlü ve müşteri onaylı" actions={can('reports.manage') && <button className="btn btn-primary" onClick={() => setSp({ new: '1' })}><Plus /> Yeni belge</button>} />
      <Tabs value={type} onChange={setType} tabs={[{ key: 'ALL', label: 'Tümü' }, ...Object.entries(REPORT_TYPES).map(([k, v]) => ({ key: k, label: v.replace(' Raporu', '').replace('Haftalık Periyodik ', '') }))]} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} />
          <div className="seg">
            {[['', 'Tümü'], ['PENDING', `Onay bekleyen${pendingCount ? ` (${pendingCount})` : ''}`], ['APPROVED', 'Onay alındı'], ['REJECTED', 'Reddedilen']].map(([k, l]) => (
              <button key={k} className={approval === k ? 'active' : ''} onClick={() => setApproval(k)}>{l}</button>
            ))}
          </div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(r) => nav(`/reports/${r.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {sp.get('new') && <NewReport onClose={() => setSp({})} defaults={{ vesselId: sp.get('vesselId') ?? '', projectId: sp.get('projectId') ?? '', type: sp.get('type') ?? 'POST_SCRAPING' }} />}
    </div>
  );
}

function NewReport({ onClose, defaults }: { onClose: () => void; defaults: Record<string, string> }) {
  const nav = useNavigate();
  const vessels = useVesselOptions();
  const [f, setF] = useState({ type: 'POST_SCRAPING', vesselId: '', projectId: '', workOrderId: '', ...defaults });
  const projects = useApi<any>(f.vesselId ? '/projects' : null, { vesselId: f.vesselId }).data?.items ?? [];
  const wos = useApi<any>(f.vesselId ? '/work-orders' : null, { vesselId: f.vesselId, group: 'done', pageSize: 50 }).data?.items ?? [];
  const create = useAction(() => api('/reports', { body: { ...f, projectId: f.projectId || null, workOrderId: f.workOrderId || null } }), { success: 'Belge taslağı oluşturuldu (örnek şablon içeriğiyle)', onSuccess: (r) => nav(`/reports/${r.id}`) });
  return (
    <Modal open onClose={onClose} title="Yeni belge" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.vesselId} onClick={() => create.mutate(undefined)}>Taslak oluştur</button></>}>
      <div className="form-grid">
        <Field label="Rapor türü" full>
          <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {Object.entries(REPORT_TYPES).filter(([k]) => k !== 'INSPECTION').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={(e) => setF({ ...f, vesselId: e.target.value, projectId: '', workOrderId: '' })}><option value="">— Seçin —</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="İlgili proje"><select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">—</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="İlgili iş emri" full><select className="select" value={f.workOrderId} onChange={(e) => setF({ ...f, workOrderId: e.target.value })}><option value="">—</option>{wos.map((w: any) => <option key={w.id} value={w.id}>{w.number} · {w.title}</option>)}</select></Field>
      </div>
      <div className="notice mt-2">Rapor sistem tarafından taslak olarak hazırlanır. Teknik uygunluk, ayıpsız teslim, garanti veya ibra beyanları yalnızca yetkili onayı sırasında açıkça seçilirse eklenir.</div>
    </Modal>
  );
}
