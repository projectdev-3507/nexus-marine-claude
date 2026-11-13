import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Square, CheckCircle2, Send, UserPlus, Pencil, Lock, MessageSquare, Plus, Trash2, Clock, RotateCcw, PauseCircle, XCircle, Paperclip, X, FileText, Film, Image as ImageIcon, Users, Eye } from 'lucide-react';
import { WORK_ORDER_STATUS_LABELS, WORK_ORDER_TRANSITIONS, TECHNICIAN_TRANSITIONS, type WorkOrderStatus } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, uploadFiles } from '../lib/api';
import { Avatar, Badge, Card, Empty, Field, KV, Loading, Modal, PageHeader, StatusBadge, Progress } from '../components/ui';
import { AttachmentStrip, Gallery, MEDIA_ACCEPT, Uploader } from '../components/media';
import { WorkOrderForm } from './WorkOrders';
import { useMaterialOptions, usePeople } from '../lib/lookups';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, relTime, toInputDateTime } from '../lib/format';
import { CATEGORY_LABELS, PRIORITY_LABELS, PRIORITY_TONE, WO_TONE, FAULT_STATUS_LABELS, FAULT_TONE } from '../lib/labels';
import { HelperPicker, teamText } from '../components/planning';

const FLOW: WorkOrderStatus[] = ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED', 'CLOSED'];

const ACTION_META: Partial<Record<WorkOrderStatus, { label: string; icon: any; cls: string }>> = {
  EVALUATION: { label: 'Değerlendirmeye al', icon: Clock, cls: 'btn' },
  PLANNED: { label: 'Planlandı', icon: Clock, cls: 'btn' },
  ASSIGNED: { label: 'Teknisyene ilet', icon: UserPlus, cls: 'btn btn-primary' },
  IN_PROGRESS: { label: 'İşe başla', icon: Play, cls: 'btn btn-primary' },
  TECHNICAL_REVIEW: { label: 'İşi bitir · kontrole gönder', icon: Square, cls: 'btn btn-primary' },
  COMPLETED: { label: 'Teknik kontrolü onayla', icon: CheckCircle2, cls: 'btn btn-success' },
  REVISION_REQUIRED: { label: 'Revizyon iste', icon: RotateCcw, cls: 'btn' },
  PUBLISHED: { label: 'Müşteriye yayınla', icon: Send, cls: 'btn btn-primary' },
  CLOSED: { label: 'Kapat', icon: Lock, cls: 'btn' },
  ON_HOLD: { label: 'Beklemeye al', icon: PauseCircle, cls: 'btn' },
  CANCELLED: { label: 'İptal et', icon: XCircle, cls: 'btn btn-ghost' },
};

export default function WorkOrderDetail() {
  const { id } = useParams();
  const { user, manager, staff, can } = useAuth();
  const { data: w } = useApi<any>(`/work-orders/${id}`);
  const [edit, setEdit] = useState(false);
  const [assign, setAssign] = useState(false);
  const [transition, setTransition] = useState<WorkOrderStatus | null>(null);
  const [comment, setComment] = useState('');
  // Yorum kanalı (personel): müşteriyle mi, ekip içi mi
  const [channel, setChannel] = useState<'client' | 'team'>('client');
  const [mat, setMat] = useState({ materialId: '', quantity: '' });
  const materials = useMaterialOptions();

  const saveChecklist = useAction((checklist: any[]) => api(`/work-orders/${id}`, { method: 'PUT', body: { checklist } }));
  const [pending, setPending] = useState<File[]>([]);
  const addComment = useAction(
    async (internal: boolean) => {
      const c = await api<any>(`/work-orders/${id}/comments`, { body: { body: comment, internal: staff ? internal : false, withFiles: pending.length > 0 } });
      if (pending.length) await uploadFiles('COMMENT', c.id, pending);
      return c;
    },
    { success: 'Yorum eklendi', onSuccess: () => { setComment(''); setPending([]); } },
  );
  const delFile = useAction((fileId: string) => api(`/files/${fileId}`, { method: 'DELETE' }), { success: 'Dosya silindi' });
  const addMat = useAction(() => api(`/work-orders/${id}/materials`, { body: { materialId: mat.materialId, quantity: Number(mat.quantity) } }), { success: 'Malzeme eklendi, stoktan düşüldü', onSuccess: () => setMat({ materialId: '', quantity: '' }) });
  const delMat = useAction((usageId: string) => api(`/work-orders/${id}/materials/${usageId}`, { method: 'DELETE' }), { success: 'Malzeme kaldırıldı' });

  if (!w) return <Loading />;
  const mine = w.technician?.id === user?.id || (w.helperIds ?? []).includes(user?.id);
  const allowed = (WORK_ORDER_TRANSITIONS[w.status as WorkOrderStatus] ?? []).filter((to) => {
    // ASSIGNED normalde atama ile olur; teknisyen zaten atanmışsa "Teknisyene ilet" olarak sunulur
    if (manager) return to !== 'ASSIGNED' || !!w.technician;
    return mine && can('workorders.execute') && TECHNICIAN_TRANSITIONS.some(([f, t]) => f === w.status && t === to);
  });
  const checklist: Array<{ label: string; done: boolean }> = w.checklist ?? [];
  const done = checklist.filter((c) => c.done).length;
  const canEditChecklist = staff && (manager || mine) && !['COMPLETED', 'PUBLISHED', 'CLOSED', 'CANCELLED'].includes(w.status);
  const flowIdx = FLOW.indexOf(w.status);
  const canUpload = staff ? manager || mine : true;

  return (
    <div>
      <PageHeader
        crumbs={<><Link to="/work-orders">İş Emirleri</Link> / {w.number}</>}
        title={w.title}
        sub={<span className="row-wrap" style={{ gap: 8 }}><span className="mono strong">{w.number}</span><StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /><StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={w.priority} /><Link to={`/vessels/${w.vessel.id}`}>{w.vessel.name}</Link></span>}
        actions={
          <>
            {manager && w.technician && ['REQUESTED', 'EVALUATION', 'PLANNED', 'ASSIGNED', 'ON_HOLD'].includes(w.status) && <button className="btn" onClick={() => setAssign(true)}><UserPlus /> Yeniden ata</button>}
            {manager && !w.technician && ['ASSIGNED', 'ON_HOLD'].includes(w.status) && <button className="btn" onClick={() => setAssign(true)}><UserPlus /> Teknisyen ata</button>}
            {manager && <button className="btn" onClick={() => setEdit(true)}><Pencil /> Düzenle</button>}
          </>
        }
      />

      {staff && (() => {
        // Sıradaki adım: ne yapılması gerektiğini tek cümleyle söyler, ana eylemi büyük butonla sunar
        const primaryOrder: WorkOrderStatus[] = ['IN_PROGRESS', 'TECHNICAL_REVIEW', 'COMPLETED', 'PUBLISHED', 'CLOSED', 'ASSIGNED', 'PLANNED', 'EVALUATION'];
        // Teknisyen yoksa "Teknisyene ilet" gösterilmez (önce atama gerekir); ASSIGNED'den geri "Planlandı" da gösterilmez
        const acts = allowed.filter((s) => (s !== 'ASSIGNED' || !!w.technician) && !(s === 'PLANNED' && w.status === 'ASSIGNED'));
        const primary = primaryOrder.find((s) => acts.includes(s));
        const secondary = acts.filter((s) => s !== primary && ACTION_META[s]);
        const needsTech = manager && !w.technician && ['REQUESTED', 'EVALUATION', 'PLANNED'].includes(w.status);
        const step = Math.max(0, flowIdx);
        const tech = w.technician?.name ?? 'Teknisyen';
        const msg = nextStepText(w.status, { manager, mine, tech, hasTech: !!w.technician });
        const off = ['ON_HOLD', 'REVISION_REQUIRED', 'CANCELLED'].includes(w.status);
        return (
          <div className={`next-step mb-2${off ? ' warn' : ''}${w.status === 'CLOSED' || w.status === 'PUBLISHED' ? ' done' : ''}`}>
            <div className="ns-top">
              <span className="ns-step">{off ? WORK_ORDER_STATUS_LABELS[w.status as WorkOrderStatus] : `Adım ${step + 1} / ${FLOW.length} · ${WORK_ORDER_STATUS_LABELS[w.status as WorkOrderStatus]}`}</span>
              <div className="ns-bar"><i style={{ width: `${((step + 1) / FLOW.length) * 100}%` }} /></div>
            </div>
            <div className="ns-body">
              <div className="ns-msg"><b>Sıradaki adım</b><span>{msg}</span></div>
              <div className="ns-actions">
                {needsTech && <button className="btn btn-primary btn-lg" onClick={() => setAssign(true)}><UserPlus /> Teknisyen ata</button>}
                {primary && ACTION_META[primary] && (() => { const m = ACTION_META[primary]!; return <button className={`${m.cls.includes('btn-') ? m.cls : 'btn btn-primary'} btn-lg`} onClick={() => setTransition(primary)}><m.icon /> {m.label}</button>; })()}
                {secondary.map((to) => { const m = ACTION_META[to]!; return <button key={to} className="btn btn-sm" onClick={() => setTransition(to)}><m.icon /> {m.label}</button>; })}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid g-side">
        <div className="stack">
          <Card title="İş detayları">
            {w.description && <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{w.description}</p>}
            <KV items={[
              ['Tekne', <Link to={`/vessels/${w.vessel.id}`}>{w.vessel.name}</Link>],
              ['Marina / Bağlama', [w.vessel.marina, w.vessel.berth].filter(Boolean).join(' · ')],
              ['Kategori', w.category ? CATEGORY_LABELS[w.category] : null],
              ['Talep eden', w.requestedBy?.name],
              [w.helpers?.length ? 'Teknisyenler' : 'Atanan teknisyen', teamText(w) || null],
              ['Planlanan', w.plannedStart ? `${fmtDateTime(w.plannedStart)}${w.plannedEnd ? ' → ' + fmtDateTime(w.plannedEnd) : ''}` : null],
              ['Planlanan süre', w.plannedHours != null ? `${w.plannedHours} saat` : undefined],
              ['Başlangıç / bitiş', w.startedAt ? `${fmtDateTime(w.startedAt)}${w.finishedAt ? ' → ' + fmtDateTime(w.finishedAt) : ''}` : null],
              ['Gerçekleşen süre', w.actualHours != null ? `${w.actualHours} saat` : null],
            ]} />
            {w.customerSummary && (
              <div className="notice mt-2"><CheckCircle2 /><div><b>Müşteri özeti</b><div>{w.customerSummary}</div></div></div>
            )}
          </Card>

          {(checklist.length > 0 || canEditChecklist) && (
            <Card title={`Kontrol listesi · ${done}/${checklist.length}`}>
              <Progress value={checklist.length ? (done / checklist.length) * 100 : 0} />
              <div className="stack mt-2" style={{ gap: 8 }}>
                {checklist.map((c, i) => (
                  <label key={i} className="checkbox" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={c.done} disabled={!canEditChecklist} onChange={() => saveChecklist.mutate(checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
                    <span style={{ textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--muted)' : undefined }}>{c.label}</span>
                  </label>
                ))}
                {checklist.length === 0 && <Empty title="Kontrol maddesi yok" />}
              </div>
            </Card>
          )}

          <Card title="Fotoğraflar ve dosyalar">
            {canUpload && !['CLOSED', 'CANCELLED'].includes(w.status) && <div className="mb-2"><Uploader entityType="WORK_ORDER" entityId={w.id} tagOptions={staff} accept={MEDIA_ACCEPT} /></div>}
            <Gallery items={w.attachments ?? []} editable />
            {!staff && <p className="xs muted mt-2">Yalnızca operasyon ekibi tarafından onaylanmış fotoğraflar görüntülenir.</p>}
          </Card>

          {staff && (
            <Card title="Kullanılan malzemeler" pad={false}>
              {(w.materials ?? []).length === 0 && <Empty title="Malzeme kaydı yok" />}
              {(w.materials ?? []).map((m: any) => (
                <div key={m.id} className="list-item">
                  <div className="grow"><div className="strong">{m.material.name}</div><div className="xs muted">{fmtDateTime(m.usedAt)}</div></div>
                  <b className="mono">{fmtNum(m.quantity, 2)} {m.material.unit}</b>
                  {m.unitCost != null && <span className="mono small muted" style={{ width: 90, textAlign: 'right' }}>{fmtMoney(m.quantity * m.unitCost)}</span>}
                  {manager && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => delMat.mutate(m.id)}><Trash2 /></button>}
                </div>
              ))}
              {(manager || mine) && !['CLOSED', 'CANCELLED'].includes(w.status) && (
                <div className="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
                  <select className="select sm" style={{ flex: 2, minWidth: 180 }} value={mat.materialId} onChange={(e) => setMat({ ...mat, materialId: e.target.value })}>
                    <option value="">Malzeme seçin</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({fmtNum(m.stock)} {m.unit} stok)</option>)}
                  </select>
                  <input className="input sm" style={{ width: 100 }} type="number" placeholder="Miktar" value={mat.quantity} onChange={(e) => setMat({ ...mat, quantity: e.target.value })} />
                  <button className="btn btn-sm btn-primary" disabled={!mat.materialId || !mat.quantity} onClick={() => addMat.mutate(undefined)}><Plus /> Ekle</button>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="stack">
          {w.faults?.length > 0 && (
            <Card title="İlişkili arızalar" pad={false}>
              {w.faults.map((f: any) => (
                <Link key={f.id} to={staff ? `/faults/${f.id}` : '/maintenance'} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow"><div className="strong">{f.title}</div>{f.source === 'CUSTOMER' && <div className="xs muted">Müşteri bildirimi · {fmtDateTime(f.createdAt)}</div>}{f.description && <div className="xs muted truncate">{f.description}</div>}</div>
                  <StatusBadge map={FAULT_TONE} labels={FAULT_STATUS_LABELS} value={f.status} />
                </Link>
              ))}
            </Card>
          )}
          {(w.project || w.maintenancePlan || w.parentPlan || w.reports?.length > 0) && (
            <Card title="Bağlantılar">
              <div className="stack small" style={{ gap: 8 }}>
                {w.project && <div>Proje: <Link to={`/projects/${w.project.id}`}>{w.project.name}</Link></div>}
                {w.parentPlan && <div>Bağlı bakım: <Link to={`/maintenance/${w.parentPlan.id}`}>{w.parentPlan.title} · {fmtDate(w.parentPlan.plannedDate)}</Link></div>}
                {w.maintenancePlan && <div>Bakım planı: <Link to={`/maintenance/${w.maintenancePlan.id}`}>{w.maintenancePlan.title}</Link></div>}
                {w.reports?.map((r: any) => <div key={r.id}>Rapor: <Link to={`/reports/${r.id}`}>{r.number}</Link></div>)}
              </div>
            </Card>
          )}
          {(() => {
            const all: any[] = w.comments ?? [];
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
                  {isTeam ? <><Lock size={14} /> Yalnızca ekip görür — müşteri (tekne sahibi / kaptan) bu yorumları göremez.</> : <><Eye size={14} /> Buraya yazılanları müşteri (tekne sahibi / kaptan) görür.</>}
                </div>
              )}
              {list.length === 0 && <span className="small muted">{isTeam ? 'Henüz ekip içi yorum yok.' : 'Henüz yorum yok.'}</span>}
              {list.map((c: any) => (
                <div key={c.id} className={`cm-item${c.internal ? ' team' : ''}${c.user.id === user?.id ? ' mine' : ''}`}>
                  <Avatar name={c.user.name} size="sm" />
                  <div className="cm-bubble">
                    <div className="small"><b>{c.user.name}</b> <span className="muted xs">{relTime(c.createdAt)}</span></div>
                    {c.body && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>}
                    <AttachmentStrip
                      items={(w.commentFiles ?? []).filter((f: any) => f.entityId === c.id)}
                      onDelete={c.user.id === user?.id || manager ? (a) => delFile.mutate(a.id) : undefined}
                    />
                  </div>
                </div>
              ))}
              <div className="composer">
                <textarea className="textarea" placeholder={isTeam ? 'Ekip içi yorum yazın… (müşteri görmez)' : 'Yorum yazın…'} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 64 }} />
                {pending.length > 0 && (
                  <div className="pending-files">
                    {pending.map((f, i) => (
                      <span key={i} className="pf">
                        {f.type.startsWith('image/') ? <ImageIcon /> : f.type.startsWith('video/') ? <Film /> : <FileText />}
                        <span className="pf-name">{f.name}</span>
                        <small>{(f.size / 1048576).toFixed(1)} MB</small>
                        <button onClick={() => setPending(pending.filter((_, j) => j !== i))} aria-label="Kaldır"><X /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="row composer-bar">
                  <label className="btn btn-sm attach-btn" title="Fotoğraf, video veya belge ekle">
                    <Paperclip /> <span>Ekle</span>
                    <input type="file" multiple hidden accept={MEDIA_ACCEPT} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; setPending([...pending, ...fs].slice(0, 10)); }} />
                  </label>
                  <span className="spacer" />
                  <button className={`btn btn-sm ${isTeam ? 'btn-team' : 'btn-primary'}`} disabled={(!comment.trim() && !pending.length) || addComment.isPending} onClick={() => addComment.mutate(isTeam)}>
                    {addComment.isPending ? (pending.length ? 'Yükleniyor…' : 'Gönderiliyor…') : <>{isTeam ? <Lock /> : <Send />} {isTeam ? 'Ekibe gönder' : 'Gönder'}</>}
                  </button>
                </div>
              </div>
            </div>
          </Card>
            );
          })()}
          <Card title="İş geçmişi">
            <div className="timeline">
              {(w.history ?? []).map((h: any, i: number) => (
                <div key={i} className={`tl-item ${['COMPLETED', 'PUBLISHED', 'CLOSED'].includes(h.toStatus) ? 'ok' : h.toStatus === 'REVISION_REQUIRED' ? 'danger' : ''}`}>
                  <div className="small strong">{h.fromStatus ? `${WORK_ORDER_STATUS_LABELS[h.fromStatus as WorkOrderStatus]} → ` : ''}{WORK_ORDER_STATUS_LABELS[h.toStatus as WorkOrderStatus]}</div>
                  <div className="xs muted">{fmtDateTime(h.createdAt)}{h.user ? ` · ${h.user.name}` : ''}</div>
                  {h.note && <div className="xs">{h.note}</div>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {edit && <WorkOrderForm initial={{ ...w, vesselId: w.vessel.id, technicianId: w.technician?.id ?? '', helperIds: w.helperIds ?? [], plannedStart: toInputDateTime(w.plannedStart), plannedEnd: toInputDateTime(w.plannedEnd), checklist: w.checklist ?? [] }} onClose={() => setEdit(false)} />}
      {assign && <AssignModal wo={w} onClose={() => setAssign(false)} />}
      {transition && <TransitionModal wo={w} to={transition} onClose={() => setTransition(null)} />}
    </div>
  );
}

/** Duruma ve kullanıcıya göre "şimdi ne yapılmalı" açıklaması */
function nextStepText(status: string, { manager, mine, tech, hasTech }: { manager: boolean; mine: boolean; tech: string; hasTech?: boolean }) {
  switch (status) {
    case 'REQUESTED': return manager ? (hasTech ? `Yeni talep geldi. ${tech} atandı; "Planlandı" ile işi teknisyene iletin.` : 'Yeni talep geldi. İnceleyip teknisyen atayın veya planlayın.') : 'Talep operasyon ekibinin incelemesini bekliyor.';
    case 'EVALUATION': return manager ? (hasTech ? `Talep değerlendiriliyor. ${tech} atandı; "Planlandı" ile işi teknisyene iletin.` : 'Talep değerlendiriliyor. Teknisyen atayarak işi planlayın.') : 'Talep değerlendiriliyor.';
    case 'PLANNED': return hasTech ? (manager ? `İş planlandı, ${tech} atandı. "Teknisyene ilet" ile işi başlatın.` : `İş planlandı, ${tech} atandı.`) : (manager ? 'İş planlandı. Bir teknisyen atayın.' : 'İş planlandı, teknisyen ataması bekleniyor.');
    case 'ASSIGNED': return mine ? 'Bu iş sana atandı. Tekneye vardığında "İşe başla"ya bas.' : `${tech} işe başlamayı bekliyor.`;
    case 'IN_PROGRESS': return mine ? 'Çalışma sürüyor. Fotoğrafları ekle; bitince "İşi bitir · kontrole gönder"e bas.' : `${tech} şu anda bu iş üzerinde çalışıyor.`;
    case 'REVISION_REQUIRED': return mine ? 'Yönetici revizyon istedi. Notları okuyup işe tekrar başla.' : `${tech} revizyonu yapacak.`;
    case 'ON_HOLD': return manager ? 'İş beklemede. Hazır olduğunda planlayın.' : 'İş beklemeye alındı.';
    case 'TECHNICAL_REVIEW': return manager ? 'İş bitti. Fotoğraf ve notları kontrol edip onaylayın ya da revizyon isteyin.' : 'İş bitti, yönetici kontrolü bekleniyor.';
    case 'COMPLETED': return manager ? 'Kontrol onaylandı. Kısa bir özetle müşteriye yayınlayın.' : 'Kontrol onaylandı, müşteriye yayınlanacak.';
    case 'PUBLISHED': return manager ? 'Müşteriye yayınlandı. Her şey tamamsa işi kapatın.' : 'Müşteriye yayınlandı.';
    case 'CLOSED': return 'İş tamamlandı ve kapatıldı.';
    case 'CANCELLED': return 'Bu iş emri iptal edildi.';
    default: return '';
  }
}

function AssignModal({ wo, onClose }: { wo: any; onClose: () => void }) {
  const techs = usePeople('TECHNICIAN');
  const status = useApi<any[]>('/technicians').data ?? [];
  const [f, setF] = useState({ technicianId: wo.technician?.id ?? '', helperIds: (wo.helperIds ?? []) as string[], plannedStart: toInputDateTime(wo.plannedStart), plannedEnd: toInputDateTime(wo.plannedEnd) });
  const save = useAction(() => api(`/work-orders/${wo.id}/assign`, { body: { ...f, helperIds: f.helperIds.filter((h) => h !== f.technicianId), plannedStart: f.plannedStart || null, plannedEnd: f.plannedEnd || null } }), { success: 'Teknisyenler atandı ve bilgilendirildi', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Teknisyen ata (sorumlu)" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.technicianId} onClick={() => save.mutate(undefined)}>Ata</button></>}>
      <div className="stack">
        <div className="stack" style={{ gap: 6 }}>
          {techs.map((t) => {
            const s = status.find((x) => x.id === t.id);
            return (
              <label key={t.id} className="row" style={{ border: `1.5px solid ${f.technicianId === t.id ? 'var(--marine)' : 'var(--border)'}`, borderRadius: 10, padding: '8px 12px', cursor: 'pointer', background: f.technicianId === t.id ? 'var(--sky)' : undefined }}>
                <input type="radio" name="tech" checked={f.technicianId === t.id} onChange={() => setF({ ...f, technicianId: t.id })} style={{ accentColor: 'var(--marine)' }} />
                <Avatar name={t.name} size="sm" />
                <div style={{ flex: 1 }}><b className="small">{t.name}</b><div className="xs muted">{t.title}</div></div>
                {s && <span className="xs muted">{s.openCount} açık iş · bugün {s.todayCount}</span>}
              </label>
            );
          })}
        </div>
        <Field label="Ek teknisyenler" hint="Sorumlu teknisyene ek olarak bu işte çalışacaklar"><HelperPicker techs={techs} value={f.helperIds} exclude={f.technicianId} onChange={(helperIds) => setF({ ...f, helperIds })} /></Field>
        <div className="form-grid">
          <Field label="Planlanan başlangıç"><input className="input" type="datetime-local" value={f.plannedStart} onChange={(e) => setF({ ...f, plannedStart: e.target.value })} /></Field>
          <Field label="Planlanan bitiş"><input className="input" type="datetime-local" value={f.plannedEnd} onChange={(e) => setF({ ...f, plannedEnd: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function TransitionModal({ wo, to, onClose }: { wo: any; to: WorkOrderStatus; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState(wo.customerSummary ?? '');
  const save = useAction(() => api(`/work-orders/${wo.id}/status`, { body: { status: to, note: note || null, customerSummary: to === 'PUBLISHED' ? summary : undefined } }), { success: `Durum güncellendi: ${WORK_ORDER_STATUS_LABELS[to]}`, onSuccess: onClose });
  const m = ACTION_META[to]!;
  return (
    <Modal open onClose={onClose} title={m.label} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className={m.cls.includes('btn-') ? m.cls : 'btn btn-primary'} disabled={(to === 'PUBLISHED' && !summary.trim()) || (to === 'REVISION_REQUIRED' && !note.trim())} onClick={() => save.mutate(undefined)}>Onayla</button></>}>
      <div className="stack">
        <p className="muted">{WORK_ORDER_STATUS_LABELS[wo.status as WorkOrderStatus]} → <b>{WORK_ORDER_STATUS_LABELS[to]}</b></p>
        {to === 'TECHNICAL_REVIEW' && <div className="notice">İş bitiş zamanı kaydedilecek ve operasyon yöneticisine kontrol bildirimi gönderilecek.</div>}
        {to === 'PUBLISHED' && (
          <>
            <div className="notice">Yayınlandığında tekne sahibi ve kaptan bilgilendirilir. Yalnızca "müşteriye görünür" olarak işaretlenmiş fotoğraflar paylaşılır.</div>
            <Field label="Müşteriye görünecek özet *"><textarea className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Yapılan işlemler ve sonuç..." /></Field>
          </>
        )}
        <Field label={to === 'REVISION_REQUIRED' ? 'Revizyon nedeni *' : 'Not (isteğe bağlı)'}><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
