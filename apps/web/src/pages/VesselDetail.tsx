import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Plus, Gauge, MapPin, Anchor, ClipboardCheck, Wrench, AlertTriangle, FileText, Hammer, ClipboardList } from 'lucide-react';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl, fileUrl } from '../lib/api';
import { Badge, Card, DataTable, Empty, KV, Loading, Modal, Field, StatusBadge, Tabs, Progress } from '../components/ui';
import { Gallery, Uploader } from '../components/media';
import { HeroPlaceholder } from '../components/brand';
import { VesselForm } from './Vessels';
import { fmtDate, fmtMoney, fmtNum, relTime } from '../lib/format';
import {
  CATEGORY_SHORT, DOC_CATEGORY_LABELS, FAULT_STATUS_LABELS, FAULT_TONE, INSP_STATUS_LABELS, INSP_TONE, MAINTENANCE_STATUS_LABELS, MAINT_TONE,
  PRIORITY_LABELS, PRIORITY_TONE, PROJECT_STATUS_LABELS, PROJECT_TONE, QUOTE_STATUS_LABELS, QUOTE_TONE, REPORT_STATUS_LABELS, REPORT_TONE, REPORT_TYPES, WORK_ORDER_STATUS_LABELS, WO_TONE,
} from '../lib/labels';

type TabKey = 'general' | 'maintenance' | 'workorders' | 'inspections' | 'faults' | 'history' | 'projects' | 'documents' | 'photos' | 'costs';

export default function VesselDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, staff } = useAuth();
  const [tab, setTab] = useState<TabKey>('general');
  const [edit, setEdit] = useState(false);
  const { data: v } = useApi<any>(`/vessels/${id}`);
  const photos = useApi<any[]>('/files', { entityType: 'VESSEL', entityId: id }).data ?? [];
  if (!v) return <Loading />;
  const cover = photos.find((p) => p.mimeType.startsWith('image/'));
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'general', label: 'Genel Bilgiler' },
    { key: 'maintenance', label: 'Bakım Takvimi' },
    { key: 'workorders', label: 'İş Emirleri', count: v.summary.openWorkOrders || undefined },
    { key: 'inspections', label: 'Teknik Denetimler' },
    ...(staff ? [{ key: 'faults' as TabKey, label: 'Arızalar', count: v.summary.openFaults || undefined }] : []),
    { key: 'history', label: 'Servis Geçmişi' },
    { key: 'projects', label: 'Restorasyon Projeleri' },
    { key: 'documents', label: 'Belgeler' },
    { key: 'photos', label: 'Fotoğraflar' },
    ...(can('finance.view') ? [{ key: 'costs' as TabKey, label: 'Maliyetler' }] : []),
  ];

  return (
    <div>
      <div className="breadcrumb"><Link to="/vessels">Tekneler</Link> / {v.name}</div>
      <section className="vessel-hero">
        {cover ? <img className="bgimg" src={fileUrl(cover.id)} alt={v.name} /> : <HeroPlaceholder />}
        <div className="shade" />
        <div className="vh-body row-wrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row-wrap" style={{ gap: 6, marginBottom: 8 }}>
              {v.type && <Badge tone="navy" plain>{v.type}</Badge>}
              {!v.isActive && <Badge tone="neutral">Pasif</Badge>}
              {v.summary.openFaults > 0 && <Badge tone="danger">{v.summary.openFaults} açık arıza</Badge>}
            </div>
            <h1>{v.name}</h1>
            <div className="row-wrap mt-1" style={{ color: '#c9d9ea', gap: 16 }}>
              <span className="row" style={{ gap: 6 }}><Anchor size={15} /> {[v.make, v.model].filter(Boolean).join(' ')} · {v.year}</span>
              <span className="row" style={{ gap: 6 }}><MapPin size={15} /> {v.marina} {v.berth && `· ${v.berth}`}</span>
            </div>
          </div>
          <div className="row-wrap">
            {can('workorders.manage', 'workorders.request') && <button className="btn btn-primary" onClick={() => nav(`/work-orders?new=1&vesselId=${v.id}`)}><Plus /> {can('workorders.manage') ? 'İş Emri' : 'Servis Talebi'}</button>}
            {can('inspections.perform') && <button className="btn btn-light" onClick={() => api('/inspections', { body: { vesselId: v.id } }).then((r) => nav(`/inspections/${r.id}`))}><ClipboardCheck /> Denetim</button>}
            {can('vessels.manage') && <button className="btn btn-light" onClick={() => setEdit(true)}><Pencil /> Düzenle</button>}
          </div>
        </div>
      </section>

      <div className="grid g-4 mt-3">
        <Mini icon={ClipboardList} label="Açık iş emri" value={v.summary.openWorkOrders} />
        <Mini icon={AlertTriangle} label="Açık arıza" value={v.summary.openFaults} tone={v.summary.openFaults ? 'var(--danger)' : undefined} />
        <Mini icon={Wrench} label="Sıradaki bakım" value={v.summary.nextMaintenance ? fmtDate(v.summary.nextMaintenance.plannedDate, { day: '2-digit', month: 'short' }) : '—'} sub={v.summary.nextMaintenance?.title} />
        <Mini icon={Hammer} label="Aktif proje" value={v.summary.activeProject ? 'Var' : 'Yok'} sub={v.summary.activeProject?.name} />
      </div>

      <div className="mt-3">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'general' && <General v={v} />}
        {tab === 'maintenance' && <MaintenanceTab vesselId={v.id} />}
        {tab === 'workorders' && <WorkOrdersTab vesselId={v.id} />}
        {tab === 'inspections' && <InspectionsTab vesselId={v.id} />}
        {tab === 'faults' && <FaultsTab vesselId={v.id} />}
        {tab === 'history' && <HistoryTab vesselId={v.id} />}
        {tab === 'projects' && <ProjectsTab vesselId={v.id} />}
        {tab === 'documents' && <DocumentsTab vesselId={v.id} />}
        {tab === 'photos' && (
          <Card title="Tekne fotoğrafları">
            {can('vessels.manage') && <div className="mb-2"><Uploader entityType="VESSEL" entityId={v.id} /></div>}
            <VesselPhotos vesselId={v.id} />
          </Card>
        )}
        {tab === 'costs' && <CostsTab vesselId={v.id} />}
      </div>
      {edit && <VesselForm initial={v} onClose={() => setEdit(false)} />}
    </div>
  );
}

function Mini({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: any; sub?: string; tone?: string }) {
  return (
    <div className="card card-pad row" style={{ gap: 14 }}>
      <span className="kpi-icon" style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--sky)', color: 'var(--marine)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon size={19} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="xs muted">{label}</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: tone ?? 'var(--navy)' }}>{value}</div>
        {sub && <div className="xs muted truncate">{sub}</div>}
      </div>
    </div>
  );
}

function General({ v }: { v: any }) {
  const { can } = useAuth();
  const [hoursFor, setHoursFor] = useState<any | null>(null);
  const [hours, setHours] = useState('');
  const save = useAction(() => api(`/vessels/${v.id}/engines/${hoursFor.id}/hours`, { method: 'PATCH', body: { hours: Number(hours) } }), { success: 'Motor saati güncellendi', onSuccess: () => setHoursFor(null) });
  const captains = v.members.filter((m: any) => m.relation === 'CAPTAIN');
  return (
    <div className="grid g-side">
      <div className="stack">
        <Card title="Tekne bilgileri">
          <KV items={[
            ['Tekne adı', v.name], ['Tip', v.type], ['Marka / Model', [v.make, v.model].filter(Boolean).join(' ')],
            ['Üretim yılı', v.year], ['Uzunluk', v.lengthM ? `${v.lengthM} m` : null], ['Bayrak', v.flag],
            ['Marina', v.marina], ['Bağlama noktası', v.berth], ['Tekne sahibi', v.owner?.name],
          ]} />
        </Card>
        <Card title={<span className="row" style={{ gap: 8 }}><Gauge size={17} /> Motorlar ve çalışma saatleri</span>} pad={false}>
          <DataTable
            rows={[...v.engines].sort((a: any, b: any) => engineRank(a.position) - engineRank(b.position))}
            columns={[
              { key: 'p', label: 'Konum', render: (e: any) => <b>{e.position}</b> },
              { key: 'm', label: 'Marka / Model', render: (e: any) => [e.make, e.model].filter(Boolean).join(' ') || '—' },
              { key: 's', label: 'Seri no', render: (e: any) => <span className="mono">{e.serialNumber ?? '—'}</span> },
              { key: 'h', label: 'Çalışma saati', align: 'right', render: (e: any) => <div><b className="mono">{fmtNum(e.hours)} s</b><div className="cell-sub">{e.hoursUpdatedAt ? relTime(e.hoursUpdatedAt) : ''}</div></div> },
              ...(can('vessels.manage', 'workorders.execute') ? [{ key: 'a', label: '', align: 'right' as const, render: (e: any) => <button className="btn btn-sm" onClick={(x) => { x.stopPropagation(); setHoursFor(e); setHours(String(e.hours)); }}>Güncelle</button> }] : []),
            ]}
            empty={<Empty title="Motor kaydı yok" />}
          />
        </Card>
        <Card title="Ekipman envanteri" pad={false}>
          <DataTable
            rows={(v.equipment ?? []).map((e: any, i: number) => ({ ...e, id: String(i) }))}
            columns={[
              { key: 'n', label: 'Ekipman', render: (e: any) => <b>{e.name}</b> },
              { key: 'm', label: 'Marka / Model', render: (e: any) => [e.make, e.model].filter(Boolean).join(' ') || '—' },
              { key: 's', label: 'Seri no', render: (e: any) => <span className="mono">{e.serial ?? '—'}</span> },
            ]}
            empty={<Empty title="Ekipman kaydı yok" />}
          />
        </Card>
      </div>
      <div className="stack">
        <Card title="İletişim">
          <div className="stack" style={{ gap: 12 }}>
            <div><div className="xs muted">Tekne sahibi</div><b>{v.owner?.name ?? '—'}</b>{v.owner?.phone && <div className="small">{v.owner.phone}</div>}</div>
            {captains.map((c: any) => <div key={c.id}><div className="xs muted">Kaptan</div><b>{c.user.name}</b><div className="small">{c.user.phone}</div></div>)}
            {v.contactPhone && <div><div className="xs muted">Tekne iletişim</div><div className="small">{v.contactPhone}<br />{v.contactEmail}</div></div>}
          </div>
        </Card>
        <Card title="Jeneratör">
          <KV cols={2} items={[['Marka / Model', [v.generatorInfo?.make, v.generatorInfo?.model].filter(Boolean).join(' ')], ['Güç', v.generatorInfo?.powerKw ? `${v.generatorInfo.powerKw} kW` : null]]} />
        </Card>
        <Card title="Aküler">
          <KV cols={2} items={[
            ['Servis', v.batteryInfo?.service ? `${v.batteryInfo.service.count ?? '?'} × ${v.batteryInfo.service.capacityAh ?? '?'}Ah ${v.batteryInfo.service.type ?? ''}` : null],
            ['Marş', v.batteryInfo?.start ? `${v.batteryInfo.start.count ?? '?'} × ${v.batteryInfo.start.capacityAh ?? '?'}Ah` : null],
            ['Montaj', fmtDate(v.batteryInfo?.installedAt)],
          ]} />
        </Card>
        {v.notes && <Card title="Dahili notlar"><p className="small">{v.notes}</p></Card>}
      </div>
      <Modal open={!!hoursFor} onClose={() => setHoursFor(null)} title={`${hoursFor?.position} — çalışma saati`} footer={<><button className="btn" onClick={() => setHoursFor(null)}>Vazgeç</button><button className="btn btn-primary" onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
        <Field label="Güncel çalışma saati" hint="Motor saati bazlı bakım hatırlatmaları bu değere göre hesaplanır."><input className="input" type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

function MaintenanceTab({ vesselId }: { vesselId: string }) {
  const nav = useNavigate();
  const { data, isLoading } = useApi<any>('/maintenance', { vesselId, pageSize: 100, sort: 'plannedDate', order: 'asc' });
  return (
    <Card pad={false} title="Bakım planları" action={<button className="btn btn-sm" onClick={() => nav(`/maintenance?new=1&vesselId=${vesselId}`)}><Plus /> Bakım planla</button>}>
      <DataTable loading={isLoading} rows={data?.items ?? []} onRowClick={(m: any) => nav(`/maintenance?id=${m.id}`)} columns={[
        { key: 'd', label: 'Tarih', render: (m: any) => <b>{fmtDate(m.plannedDate)}</b> },
        { key: 't', label: 'Bakım', render: (m: any) => <div><div className="cell-title">{m.title}</div><div className="cell-sub">{CATEGORY_SHORT[m.category]}{m.dueEngineHours ? ` · ${fmtNum(m.dueEngineHours)} motor saati` : ''}</div></div> },
        { key: 'tech', label: 'Teknisyen', render: (m: any) => m.technician?.name ?? '—' },
        { key: 'p', label: 'Öncelik', render: (m: any) => <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={m.priority} /> },
        { key: 's', label: 'Durum', render: (m: any) => <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} /> },
      ]} />
    </Card>
  );
}

function WorkOrdersTab({ vesselId }: { vesselId: string }) {
  const nav = useNavigate();
  const { data, isLoading } = useApi<any>('/work-orders', { vesselId, pageSize: 100 });
  return (
    <Card pad={false}>
      <DataTable loading={isLoading} rows={data?.items ?? []} onRowClick={(w: any) => nav(`/work-orders/${w.id}`)} columns={[
        { key: 'n', label: 'No', render: (w: any) => <span className="mono strong">{w.number}</span> },
        { key: 't', label: 'İş', render: (w: any) => <div><div className="cell-title">{w.title}</div><div className="cell-sub">{w.category ? CATEGORY_SHORT[w.category] : ''}</div></div> },
        { key: 'tech', label: 'Teknisyen', render: (w: any) => w.technician?.name ?? '—' },
        { key: 'd', label: 'Planlanan', render: (w: any) => fmtDate(w.plannedStart) },
        { key: 's', label: 'Durum', render: (w: any) => <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /> },
      ]} />
    </Card>
  );
}

function InspectionsTab({ vesselId }: { vesselId: string }) {
  const nav = useNavigate();
  const { data, isLoading } = useApi<any>('/inspections', { vesselId, pageSize: 50 });
  return (
    <Card pad={false}>
      <DataTable loading={isLoading} rows={data?.items ?? []} onRowClick={(i: any) => nav(`/inspections/${i.id}`)} columns={[
        { key: 'n', label: 'No', render: (i: any) => <span className="mono strong">{i.number}</span> },
        { key: 'd', label: 'Tarih', render: (i: any) => fmtDate(i.date) },
        { key: 'i', label: 'Denetçi', render: (i: any) => i.inspector.name },
        { key: 'r', label: 'Sonuç', render: (i: any) => <div className="row-wrap" style={{ gap: 4 }}><Badge tone="ok" plain>{i.stats.ok} uygun</Badge>{i.stats.attention > 0 && <Badge tone="warn" plain>{i.stats.attention} dikkat</Badge>}{i.stats.fault > 0 && <Badge tone="danger" plain>{i.stats.fault} arıza</Badge>}</div> },
        { key: 's', label: 'Durum', render: (i: any) => <StatusBadge map={INSP_TONE} labels={INSP_STATUS_LABELS} value={i.status} /> },
        { key: 'pdf', label: '', align: 'right', render: (i: any) => <a className="btn btn-sm" href={authedUrl(`/inspections/${i.id}/pdf`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><FileText /> PDF</a> },
      ]} />
    </Card>
  );
}

function FaultsTab({ vesselId }: { vesselId: string }) {
  const nav = useNavigate();
  const { data, isLoading } = useApi<any>('/faults', { vesselId, pageSize: 100 });
  return (
    <Card pad={false}>
      <DataTable loading={isLoading} rows={data?.items ?? []} onRowClick={(f: any) => f.workOrder && nav(`/work-orders/${f.workOrder.id}`)} columns={[
        { key: 't', label: 'Arıza', render: (f: any) => <div><div className="cell-title">{f.title}</div><div className="cell-sub">{f.source === 'INSPECTION' ? `Denetim ${f.inspectionItem?.inspection.number ?? ''}` : f.source === 'CUSTOMER' ? 'Müşteri bildirimi' : 'Manuel kayıt'}</div></div> },
        { key: 'sv', label: 'Önem', render: (f: any) => <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={f.severity} /> },
        { key: 'd', label: 'Tarih', render: (f: any) => fmtDate(f.createdAt) },
        { key: 'wo', label: 'İş emri', render: (f: any) => f.workOrder ? <Badge tone="info" plain>{f.workOrder.number}</Badge> : '—' },
        { key: 's', label: 'Durum', render: (f: any) => <StatusBadge map={FAULT_TONE} labels={FAULT_STATUS_LABELS} value={f.status} /> },
      ]} />
    </Card>
  );
}

const KIND_META: Record<string, [string, string]> = {
  WORK_ORDER: ['İş emri', 'info'], MAINTENANCE: ['Bakım', 'ok'], INSPECTION: ['Denetim', 'violet'], FAULT: ['Arıza', 'danger'], REPORT: ['Rapor', 'neutral'], PROJECT: ['Proje', 'warn'],
};

function HistoryTab({ vesselId }: { vesselId: string }) {
  const nav = useNavigate();
  const { data } = useApi<any[]>(`/vessels/${vesselId}/timeline`);
  if (!data) return <Loading />;
  const link = (e: any) => ({ WORK_ORDER: `/work-orders/${e.id}`, INSPECTION: `/inspections/${e.id}`, REPORT: `/reports/${e.id}`, PROJECT: `/projects/${e.id}`, MAINTENANCE: `/maintenance?id=${e.id}`, FAULT: `/faults?id=${e.id}` } as any)[e.kind];
  return (
    <Card title="Servis geçmişi — tüm operasyonlar">
      {data.length === 0 && <Empty />}
      <div className="timeline">
        {data.map((e) => (
          <div key={e.kind + e.id} className={`tl-item ${KIND_META[e.kind][1] === 'danger' ? 'danger' : KIND_META[e.kind][1] === 'ok' ? 'ok' : ''}`} style={{ cursor: 'pointer' }} onClick={() => nav(link(e))}>
            <div className="row-wrap" style={{ gap: 8 }}>
              <Badge tone={KIND_META[e.kind][1] as any} plain>{KIND_META[e.kind][0]}</Badge>
              <span className="xs muted">{fmtDate(e.date)}</span>
            </div>
            <div className="strong mt-1">{e.title}</div>
            {e.summary && <div className="small muted">{e.summary}</div>}
            {e.faults > 0 && <div className="small" style={{ color: 'var(--danger)' }}>{e.faults} arıza tespit edildi</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProjectsTab({ vesselId }: { vesselId: string }) {
  const nav = useNavigate();
  const { data } = useApi<any>('/projects', { vesselId });
  const items = data?.items ?? [];
  return (
    <div className="grid g-2">
      {items.length === 0 && <Card><Empty title="Restorasyon projesi yok" /></Card>}
      {items.map((p: any) => (
        <div key={p.id} className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => nav(`/projects/${p.id}`)}>
          <div className="row"><h3 style={{ flex: 1 }}>{p.name}</h3><StatusBadge map={PROJECT_TONE} labels={PROJECT_STATUS_LABELS} value={p.status} /></div>
          <div className="small muted mt-1">{fmtDate(p.startDate)} – {fmtDate(p.endDate)} · {p.manager?.name}</div>
          <div className="row mt-2"><Progress value={p.progress} /><b className="mono small">%{p.progress}</b></div>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ vesselId }: { vesselId: string }) {
  const { data } = useApi<any>('/documents', { vesselId });
  const reports = useApi<any>('/reports', { vesselId }).data?.items ?? [];
  return (
    <div className="grid g-2">
      <Card title="Belgeler ve sözleşmeler" pad={false}>
        {(data?.items ?? []).length === 0 && <Empty />}
        {(data?.items ?? []).map((d: any) => (
          <div key={d.id} className="list-item">
            <FileText size={18} color="var(--marine)" />
            <div className="grow"><div className="strong">{d.title}</div><div className="xs muted">{DOC_CATEGORY_LABELS[d.category]}{d.expiryDate ? ` · Geçerlilik ${fmtDate(d.expiryDate)}` : ''}</div></div>
            {d.attachment && <a className="btn btn-sm" href={fileUrl(d.attachment.id)} target="_blank" rel="noreferrer">Aç</a>}
          </div>
        ))}
      </Card>
      <Card title="Teknik raporlar" pad={false}>
        {reports.length === 0 && <Empty />}
        {reports.map((r: any) => (
          <div key={r.id} className="list-item">
            <FileText size={18} color="var(--navy)" />
            <div className="grow"><Link className="strong" to={`/reports/${r.id}`}>{r.title}</Link><div className="xs muted">{r.number} · {REPORT_TYPES[r.type as keyof typeof REPORT_TYPES]}</div></div>
            <StatusBadge map={REPORT_TONE} labels={REPORT_STATUS_LABELS} value={r.status} />
            <a className="btn btn-sm" href={authedUrl(`/reports/${r.id}/pdf`)} target="_blank" rel="noreferrer">PDF</a>
          </div>
        ))}
      </Card>
    </div>
  );
}

function VesselPhotos({ vesselId }: { vesselId: string }) {
  const { data } = useApi<any[]>('/files', { vesselId });
  return <Gallery items={data ?? []} editable />;
}

function CostsTab({ vesselId }: { vesselId: string }) {
  const { data } = useApi<any>(`/vessels/${vesselId}/costs`);
  if (!data) return <Loading />;
  return (
    <div className="stack">
      <div className="grid g-3">
        <div className="card card-pad"><div className="xs muted">Malzeme maliyeti</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{fmtMoney(data.materialCost)}</div></div>
        <div className="card card-pad"><div className="xs muted">Onaylı teklifler</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{fmtMoney(data.quotes.filter((q: any) => q.status === 'APPROVED').reduce((s: number, q: any) => s + q.total, 0))}</div></div>
        <div className="card card-pad"><div className="xs muted">Alınan ödemeler</div><div className="kpi-value mt-1" style={{ fontSize: 24, color: 'var(--ok)' }}>{fmtMoney(data.paid)}</div></div>
      </div>
      <Card title="Teklifler" pad={false}>
        <DataTable rows={data.quotes} columns={[
          { key: 'n', label: 'No', render: (q: any) => <Link to={`/finance/quotes/${q.id}`} className="mono strong">{q.number}</Link> },
          { key: 't', label: 'Başlık', render: (q: any) => q.title },
          { key: 's', label: 'Durum', render: (q: any) => <StatusBadge map={QUOTE_TONE} labels={QUOTE_STATUS_LABELS} value={q.status} /> },
          { key: 'a', label: 'Toplam (KDV dahil)', align: 'right', render: (q: any) => <b className="mono">{fmtMoney(q.total, q.currency)}</b> },
        ]} />
      </Card>
      <Card title="Malzeme kullanımı" pad={false}>
        <DataTable rows={data.materials} columns={[
          { key: 'd', label: 'Tarih', render: (m: any) => fmtDate(m.usedAt) },
          { key: 'm', label: 'Malzeme', render: (m: any) => m.material.name },
          { key: 'w', label: 'İş emri', render: (m: any) => m.workOrder?.number ?? 'Proje' },
          { key: 'q', label: 'Miktar', align: 'right', render: (m: any) => `${fmtNum(m.quantity, 2)} ${m.material.unit}` },
          { key: 'c', label: 'Tutar', align: 'right', render: (m: any) => <span className="mono">{fmtMoney(m.quantity * m.unitCost)}</span> },
        ]} />
      </Card>
    </div>
  );
}

const engineRank = (p: string) => (/iskele/i.test(p) ? 0 : /sancak/i.test(p) ? 1 : /ana/i.test(p) ? 2 : 3);
