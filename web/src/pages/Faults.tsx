import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ClipboardList, CheckCircle2, UserRound, Phone, Mail, Camera, AlertTriangle, MessageSquare, Lock, Eye, Users, Send, Wrench } from 'lucide-react';
import { AttachmentStrip, Gallery, MEDIA_ACCEPT, Uploader } from '../components/media';
import { HelperPicker, teamText } from '../components/planning';
import { usePeople } from '../lib/lookups';
import { PRIORITIES } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Avatar, Badge, Card, DataTable, Field, KV, Loading, Modal, PageHeader, Pager, SearchInput, StatusBadge, type Column } from '../components/ui';
import { useVesselOptions } from '../lib/lookups';
import { fmtDateTime, relTime } from '../lib/format';
import { faultClientStatus, FAULT_STATUS_LABELS, FAULT_TONE, PRIORITY_LABELS, PRIORITY_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

const SOURCE: Record<string, string> = { INSPECTION: 'Denetim', CUSTOMER: 'Müşteri / kaptan', MANUAL: 'Manuel' };

export default function Faults() {
  const nav = useNavigate();
  const { can } = useAuth();
  // Eski bildirim linkleri (/faults?id=…) arıza detayına gider
  const [sp] = useSearchParams();
  useEffect(() => { const id = sp.get('id'); if (id) nav(`/faults/${id}`, { replace: true }); }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [woFor, setWoFor] = useState<any>(null);
  const ls = useListState();
  const [status, setStatus] = useState('OPEN,IN_PROGRESS');
  const [create, setCreate] = useState(false);
  const { data, isLoading } = useApi<any>('/faults', { ...ls.query, status: status || undefined });
  const resolve = useAction((id: string) => api(`/faults/${id}`, { method: 'PUT', body: { status: 'RESOLVED' } }), { success: 'Arıza giderildi olarak işaretlendi' });
  const cols: Column<any>[] = [
    { key: 't', label: 'Arıza', render: (f) => <div style={{ maxWidth: 380 }}><div className="cell-title">{f.title}</div><div className="cell-sub truncate">{f.description}</div></div> },
    { key: 'v', label: 'Tekne', render: (f) => <Link to={`/vessels/${f.vessel.id}`} onClick={(e) => e.stopPropagation()}>{f.vessel.name}</Link> },
    { key: 'src', label: 'Kaynak', render: (f) => <div>{SOURCE[f.source] ?? f.source}{f.inspectionItem && <div className="cell-sub"><Link to={`/inspections/${f.inspectionItem.inspection.id}`}>{f.inspectionItem.inspection.number} · {f.inspectionItem.itemCode}</Link></div>}</div> },
    { key: 'sev', label: 'Önem', render: (f) => <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={f.severity} /> },
    { key: 'd', label: 'Açılış', render: (f) => <div><div>{fmtDateTime(f.createdAt)}</div><div className="cell-sub">{relTime(f.createdAt)}</div></div> },
    { key: 's', label: 'Durum', render: (f) => <StatusBadge map={FAULT_TONE} labels={FAULT_STATUS_LABELS} value={f.status} /> },
    { key: 'a', label: '', align: 'right', render: (f) => (
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {f.workOrder ? <Link className="btn btn-sm" to={`/work-orders/${f.workOrder.id}`}>{f.workOrder.number}</Link> : can('workorders.manage') && <button className="btn btn-sm btn-primary" onClick={() => setWoFor(f)}><ClipboardList /> İş emri aç</button>}
        {can('workorders.manage') && f.status !== 'RESOLVED' && <button className="btn btn-sm btn-ghost btn-icon" title="Giderildi" onClick={() => resolve.mutate(f.id)}><CheckCircle2 /></button>}
      </div>
    ) },
  ];
  return (
    <div>
      <PageHeader title="Arızalar" sub="Denetimlerden, müşterilerden ve personelden gelen arıza kayıtları · açılış tarihine göre (en yeni üstte)" actions={can('faults.report') && <button className="btn btn-primary" onClick={() => setCreate(true)}><Plus /> Arıza bildir</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} />
          <div className="pill-filter">{[['OPEN,IN_PROGRESS', 'Açık'], ['OPEN', 'İşlem bekleyen'], ['RESOLVED', 'Giderilen'], ['', 'Tümü']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(f) => nav(`/faults/${f.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {create && <FaultForm onClose={() => setCreate(false)} />}
      {woFor && <FaultWorkOrderModal fault={woFor} onClose={() => setWoFor(null)} />}
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

/** Arızadan iş emri: sorumlu + ek teknisyenler, öncelik */
function FaultWorkOrderModal({ fault, onClose }: { fault: any; onClose: () => void }) {
  const nav = useNavigate();
  const techs = usePeople('TECHNICIAN');
  const [f, setF] = useState({ technicianId: '', helperIds: [] as string[], priority: fault.severity ?? 'HIGH' });
  const save = useAction(() => api<any>(`/faults/${fault.id}/work-order`, { body: { technicianId: f.technicianId || undefined, helperIds: f.helperIds.filter((h) => h !== f.technicianId), priority: f.priority } }), { success: 'İş emri oluşturuldu', onSuccess: (w) => nav(`/work-orders/${w.id}`) });
  return (
    <Modal open onClose={onClose} title="Arızadan iş emri aç" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}><ClipboardList /> İş emri aç</button></>}>
      <div className="stack">
        <div className="small"><b>{fault.title}</b><div className="muted">{fault.vessel?.name}</div></div>
        <div className="form-grid">
          <Field label="Sorumlu teknisyen"><select className="select" value={f.technicianId} onChange={(e) => setF({ ...f, technicianId: e.target.value })}><option value="">— Daha sonra atanacak —</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Öncelik"><select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
          <Field label="Ek teknisyenler" full><HelperPicker techs={techs} value={f.helperIds} exclude={f.technicianId} onChange={(helperIds) => setF({ ...f, helperIds })} /></Field>
        </div>
        <p className="xs muted">Müşterinin yüklediği fotoğraflar iş emrinde de görünür; atanan teknisyenlere bildirim gider.</p>
      </div>
    </Modal>
  );
}

/** Arıza detayı: müşteri talebi, fotoğraflar, bağlı iş emri; sağ üstte "İş emri aç" */
export function FaultDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, staff, user } = useAuth();
  const { data: f } = useApi<any>(`/faults/${id}`);
  const [wo, setWo] = useState(false);
  const [comment, setComment] = useState('');
  const [channel, setChannel] = useState<'client' | 'team'>('client');
  const send = useAction((internal: boolean) => api(`/faults/${id}/comments`, { body: { body: comment, internal } }), { success: 'Yorum eklendi', onSuccess: () => setComment('') });
  const resolve = useAction(() => api(`/faults/${id}`, { method: 'PUT', body: { status: 'RESOLVED' } }), { success: 'Arıza giderildi olarak işaretlendi' });
  const delFault = useAction(() => api(`/faults/${id}`, { method: 'DELETE' }), { success: 'Arıza silindi', onSuccess: () => nav('/faults') });
  if (!f) return <Loading />;
  const customer = f.source === 'CUSTOMER';
  return (
    <div>
      <PageHeader
        crumbs={staff ? <><Link to="/faults">Arızalar</Link> / {f.vessel.name}</> : <><Link to="/maintenance">İşlemler</Link> / Arıza bildirimi</>}
        title={f.title}
        sub={<span className="row-wrap" style={{ gap: 8 }}>{staff ? <StatusBadge map={FAULT_TONE} labels={FAULT_STATUS_LABELS} value={f.status} /> : <Badge tone={faultClientStatus(f)[1]}>{faultClientStatus(f)[0]}</Badge>}<StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={f.severity} />{customer && <Badge tone="violet"><UserRound size={11} /> Müşteri talebi</Badge>}<span>{fmtDateTime(f.createdAt)} · {relTime(f.createdAt)}</span></span>}
        actions={
          <>
            {can('workorders.manage') && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} disabled={delFault.isPending} onClick={() => confirm(`"${f.title}" arızası silinsin mi?${f.workOrder ? `\n${f.workOrder.number} iş emri silinmez.` : ''}\nBu işlem geri alınamaz.`) && delFault.mutate(undefined)}><Trash2 /> Sil</button>}
            {can('workorders.manage') && f.status !== 'RESOLVED' && <button className="btn" onClick={() => resolve.mutate(undefined)}><CheckCircle2 /> Giderildi</button>}
            {!staff ? null : f.workOrder ? <button className="btn btn-primary" onClick={() => nav(`/work-orders/${f.workOrder.id}`)}><ClipboardList /> İş emri {f.workOrder.number}</button> : can('workorders.manage') && <button className="btn btn-primary" onClick={() => setWo(true)}><ClipboardList /> İş emri aç</button>}
          </>
        }
      />
      <div className="grid g-side">
        <div className="stack">
          <Card title={customer ? <span className="row" style={{ gap: 8 }}><UserRound size={16} /> Müşteri talebi</span> : <span className="row" style={{ gap: 8 }}><AlertTriangle size={16} /> Arıza bildirimi</span>}>
            <h3 style={{ margin: '0 0 6px' }}>{f.title}</h3>
            {f.description ? <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{f.description}</p> : <p className="muted" style={{ margin: 0 }}>Açıklama girilmemiş.</p>}
            <div className="divider" />
            <KV items={[
              ['Bildiren', f.reporter?.name ?? (f.source === 'INSPECTION' ? 'Denetim' : '—')],
              ['Bildirim zamanı', fmtDateTime(f.createdAt)],
              ['Kaynak', SOURCE[f.source] ?? f.source],
              ['Önem', PRIORITY_LABELS[f.severity as keyof typeof PRIORITY_LABELS] ?? f.severity],
              ...(f.inspectionItem ? [['Denetim', <Link to={`/inspections/${f.inspectionItem.inspection.id}`}>{f.inspectionItem.inspection.number} · {f.inspectionItem.itemCode} {f.inspectionItem.label}</Link>] as [string, any]] : []),
              ...(f.resolvedAt ? [['Giderildi', fmtDateTime(f.resolvedAt)] as [string, any]] : []),
            ]} />
            {staff && customer && f.reporter && (f.reporter.phone || f.reporter.email) && (
              <div className="row-wrap mt-2" style={{ gap: 8 }}>
                {f.reporter.phone && <a className="btn btn-sm" href={`tel:${f.reporter.phone}`}><Phone /> {f.reporter.phone}</a>}
                {f.reporter.email && <a className="btn btn-sm" href={`mailto:${f.reporter.email}`}><Mail /> {f.reporter.email}</a>}
              </div>
            )}
          </Card>
          <Card title={<span className="row" style={{ gap: 8 }}><Camera size={16} /> Fotoğraflar</span>}>
            {staff && f.status !== 'RESOLVED' && <div className="mb-2"><Uploader entityType="FAULT" entityId={f.id} accept={MEDIA_ACCEPT} /></div>}
            {(f.attachments ?? []).length ? <Gallery items={f.attachments} editable={staff} /> : <p className="muted small" style={{ margin: 0 }}>Fotoğraf eklenmemiş.</p>}
            {f.workOrder && <p className="xs muted mt-2">Bu fotoğraflar {f.workOrder.number} iş emrinde teknisyenlere de görünür.</p>}
          </Card>
          {!staff && (f.serviceFiles ?? []).length > 0 && (
            <Card title={<span className="row" style={{ gap: 8 }}><Wrench size={16} /> Servis fotoğrafları</span>}>
              <Gallery items={f.serviceFiles} />
            </Card>
          )}
          {(() => {
            const all: any[] = f.comments ?? [];
            const team = all.filter((c) => c.internal);
            const client = all.filter((c) => !c.internal);
            const isTeam = staff && channel === 'team';
            const list = staff ? (isTeam ? team : client) : all;
            return (
              <Card className={`comments-card${isTeam ? ' is-team' : ''}`} title={<span className="row" style={{ gap: 8 }}><MessageSquare size={16} /> Yorumlar</span>}>
                <div className="stack" style={{ gap: 12 }}>
                  {staff && (
                    <div className="cm-tabs" role="tablist">
                      <button role="tab" aria-selected={!isTeam} className={`cm-client${!isTeam ? ' active' : ''}`} onClick={() => setChannel('client')}><Users size={15} /> Müşteriyle <em>{client.length}</em></button>
                      <button role="tab" aria-selected={isTeam} className={`cm-team${isTeam ? ' active' : ''}`} onClick={() => setChannel('team')}><Lock size={15} /> Ekip içi <em>{team.length}</em></button>
                    </div>
                  )}
                  {staff && (
                    <div className={`cm-note${isTeam ? ' team' : ''}`}>
                      {isTeam ? <><Lock size={14} /> Yalnızca ekip görür — müşteri bu yorumları göremez.</> : <><Eye size={14} /> Buraya yazılanları müşteri görür{f.workOrder ? ` (${f.workOrder.number} iş emrinin müşteri yorumlarıyla aynıdır)` : ''}.</>}
                    </div>
                  )}
                  {!staff && <p className="xs muted" style={{ margin: 0 }}>Arızanızla ilgili sorularınızı buradan yazabilirsiniz; ekibimizin yanıtları da burada görünür.</p>}
                  {list.length === 0 && <span className="small muted">{isTeam ? 'Henüz ekip içi yorum yok.' : 'Henüz yorum yok.'}</span>}
                  {list.map((c: any) => (
                    <div key={c.id} className={`cm-item${c.internal ? ' team' : ''}${c.userId && c.userId === user?.id ? ' mine' : ''}`}>
                      <Avatar name={c.userName} size="sm" />
                      <div className="cm-bubble">
                        <div className="small"><b>{c.userName}</b> <span className="muted xs">{relTime(c.createdAt)}</span></div>
                        {c.body && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>}
                        <AttachmentStrip items={c.files ?? []} />
                      </div>
                    </div>
                  ))}
                  <div className="composer">
                    <textarea className="textarea" placeholder={isTeam ? 'Ekip içi yorum yazın… (müşteri görmez)' : 'Yorum yazın…'} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 64 }} />
                    <div className="row composer-bar">
                      <span className="spacer" />
                      <button className={`btn btn-sm ${isTeam ? 'btn-team' : 'btn-primary'}`} disabled={!comment.trim() || send.isPending} onClick={() => send.mutate(!!isTeam)}>
                        {send.isPending ? 'Gönderiliyor…' : <>{isTeam ? <Lock /> : <Send />} {isTeam ? 'Ekibe gönder' : 'Gönder'}</>}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>
        <div className="stack">
          {!staff && <FaultProgress f={f} />}
          {staff && <Card title="İş emri">
            {f.workOrder ? (
              <div className="stack" style={{ gap: 8 }}>
                <Link to={`/work-orders/${f.workOrder.id}`} className="strong">{f.workOrder.number} · {f.workOrder.title}</Link>
                <div><StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={f.workOrder.status} /></div>
                <div className="small muted">{teamText(f.workOrder) || 'Teknisyen henüz atanmadı'}</div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <p className="muted small" style={{ margin: 0 }}>Bu arıza için henüz iş emri açılmadı.</p>
                {can('workorders.manage') && <button className="btn btn-primary" onClick={() => setWo(true)}><ClipboardList /> İş emri aç</button>}
              </div>
            )}
          </Card>}
          <Card title="Tekne">
            <KV items={[
              ['Tekne', staff ? <Link to={`/vessels/${f.vessel.id}`}>{f.vessel.name}</Link> : f.vessel.name],
              ['Marina / Bağlama', [f.vessel.marina, f.vessel.berth].filter(Boolean).join(' · ') || null],
              ...(staff ? [['Tekne sahibi', f.vessel.owner?.name ?? null] as [string, any]] : []),
            ]} />
          </Card>
        </div>
      </div>
      {wo && <FaultWorkOrderModal fault={f} onClose={() => setWo(false)} />}
    </div>
  );
}

/** Müşteri: arızanın ilerleme adımları (iş emri numarası gösterilmez) */
const F_STEPS = ['Talebiniz alındı', 'İnceleniyor', 'Planlandı', 'İşlemde', 'Kontrol ediliyor', 'Giderildi'];
function FaultProgress({ f }: { f: any }) {
  const [label] = faultClientStatus(f);
  const cur = Math.max(0, F_STEPS.indexOf(label === 'Beklemede' ? 'İşlemde' : label));
  const p = f.progress;
  return (
    <Card title="Durum">
      <div className="stack" style={{ gap: 10 }}>
        <ol className="fault-steps">
          {F_STEPS.map((st, i) => <li key={st} className={i < cur ? 'done' : i === cur ? (cur === F_STEPS.length - 1 ? 'done' : 'cur') : ''}><i />{st}</li>)}
        </ol>
        {label === 'Beklemede' && <div className="small muted">İş geçici olarak beklemeye alındı.</div>}
        {p?.technician && label !== 'Giderildi' && <div className="small"><Wrench size={13} /> Teknisyen: <b>{p.technician}</b></div>}
        {p?.summary && <div className="notice ok" style={{ margin: 0 }}><CheckCircle2 /><div style={{ whiteSpace: 'pre-wrap' }}>{p.summary}</div></div>}
        {(p?.updatedAt || f.resolvedAt) && <div className="xs muted">Son güncelleme: {fmtDateTime(f.resolvedAt ?? p.updatedAt)}</div>}
      </div>
    </Card>
  );
}
