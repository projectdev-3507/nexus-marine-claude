import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ClipboardList, Pencil, Plus, Repeat, RotateCcw, Send, Camera, MessageSquare, ListChecks, CalendarDays, Lock, Eye, Users } from 'lucide-react';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Avatar, Badge, Card, Empty, Field, KV, Loading, Modal, PageHeader, Progress, StatusBadge } from '../components/ui';
import { Gallery, MEDIA_ACCEPT, Uploader } from '../components/media';
import { repeatText, teamText } from '../components/planning';
import { fmtDate, fmtDateTime, relTime } from '../lib/format';
import { CATEGORY_LABELS, MAINTENANCE_STATUS_LABELS, MAINT_TONE, PRIORITY_LABELS, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';
import { MaintenanceForm } from './Maintenance';
import { WorkOrderForm } from './WorkOrders';
import '../styles/doc.css';

type Step = { label: string; done: boolean; doneAt?: string | null; doneBy?: string | null };

/**
 * Bakım görevi: paket adımları (ör. Silver Care maddeleri), "Tamamla", fotoğraf, yorum ve
 * bakıma bağlı ek işler (iş emirleri). Müşteri aynı sayfayı özet olarak görür.
 */
export default function MaintenanceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, staff, user } = useAuth();
  const { data: m } = useApi<any>(`/maintenance/${id}`);
  const [edit, setEdit] = useState(false);
  const [done, setDone] = useState(false);
  const [extra, setExtra] = useState(false);
  const [comment, setComment] = useState('');
  // Yorum kanalı (personel): müşteriyle mi, ekip içi mi — iş emirlerindeki gibi
  const [channel, setChannel] = useState<'client' | 'team'>('client');
  const step = useAction((b: { index: number; done: boolean }) => api(`/maintenance/${id}/steps`, { body: b }));
  const reopen = useAction(() => api(`/maintenance/${id}/reopen`, { body: {} }), { success: 'Bakım yeniden açıldı' });
  const send = useAction((internal: boolean) => api(`/maintenance/${id}/comments`, { body: { body: comment, internal: staff ? internal : false } }), { success: 'Yorum eklendi', onSuccess: () => setComment('') });
  if (!m) return <Loading />;

  const steps: Step[] = Array.isArray(m.checklist) ? m.checklist : [];
  const doneCount = steps.filter((s) => s.done).length;
  const completed = m.status === 'COMPLETED';
  const work = !!m.canWork && !completed;
  const idx = (m.series ?? []).findIndex((x: any) => x.id === m.id);
  const prev = idx > 0 ? m.series[idx - 1] : null;
  const next = idx >= 0 && idx < m.series.length - 1 ? m.series[idx + 1] : null;

  return (
    <div>
      <PageHeader
        crumbs={<>{staff ? <Link to="/maintenance">Bakım Planları</Link> : <Link to="/maintenance">İşlemler</Link>} / {m.vessel.name}</>}
        title={m.title}
        sub={
          <span className="row-wrap" style={{ gap: 8 }}>
            <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} />
            <span className="row" style={{ gap: 4 }}><CalendarDays size={14} /> {fmtDate(m.plannedDate)}</span>
            {repeatText(m) && <Badge tone="info" plain><Repeat size={11} /> {repeatText(m)}</Badge>}
            <Link to={`/vessels/${m.vessel.id}`}>{m.vessel.name}</Link>
          </span>
        }
        actions={
          <>
            {staff && can('maintenance.manage') && <button className="btn" onClick={() => setEdit(true)}><Pencil /> Düzenle</button>}
            {staff && can('workorders.manage') && <button className="btn" onClick={() => setExtra(true)}><Plus /> Ek iş emri</button>}
            {completed && staff && can('maintenance.manage') && <button className="btn" onClick={() => reopen.mutate(undefined)}><RotateCcw /> Yeniden aç</button>}
            {work && <button className="btn btn-success" onClick={() => setDone(true)}><CheckCircle2 /> Tamamla</button>}
          </>
        }
      />

      {completed && (
        <div className="notice ok mb-2">
          <CheckCircle2 />
          <div><b>Bakım tamamlandı</b> · {fmtDateTime(m.completedAt)}{m.completedBy ? ` · ${m.completedBy}` : ''}{steps.length ? ` · ${doneCount}/${steps.length} adım` : ''}{m.completionNote && <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{m.completionNote}</div>}</div>
        </div>
      )}

      <div className="grid g-side">
        <div className="stack">
          <Card title={<span className="row" style={{ gap: 8 }}><ListChecks size={16} /> Bakım adımları{steps.length > 0 && <span className="muted small">· {doneCount}/{steps.length}</span>}</span>}>
            {m.description && <p className="mb-2" style={{ whiteSpace: 'pre-wrap' }}>{m.description}</p>}
            {steps.length > 0 && <div className="mb-2"><Progress value={(doneCount / steps.length) * 100} ok={doneCount === steps.length} /></div>}
            {steps.length === 0 && <Empty title="Adım tanımlanmamış" text={staff ? 'Düzenle → "Bakım adımları" alanına paket maddelerini yazabilirsiniz.' : undefined} />}
            <div className="maint-steps">
              {steps.map((s, i) => (
                <label key={i} className={`maint-step${s.done ? ' done' : ''}${work ? '' : ' ro'}`}>
                  {work ? <input type="checkbox" checked={s.done} disabled={step.isPending} onChange={(e) => step.mutate({ index: i, done: e.target.checked })} /> : s.done ? <CheckCircle2 size={18} className="ok-ic" /> : <Circle size={18} className="muted" />}
                  <span className="grow">{s.label}</span>
                  {s.done && s.doneAt && <small className="muted">{s.doneBy ? `${s.doneBy} · ` : ''}{fmtDateTime(s.doneAt)}</small>}
                </label>
              ))}
            </div>
            {work && steps.length > 0 && doneCount < steps.length && <p className="xs muted mt-2">Adımları tek tek işaretleyebilir ya da "Tamamla" ile hepsini tamamlayabilirsiniz.</p>}
          </Card>

          <Card title={<span className="row" style={{ gap: 8 }}><Camera size={16} /> Fotoğraflar</span>}>
            {staff && m.canWork && <div className="mb-2"><Uploader entityType="MAINTENANCE" entityId={m.id} accept={MEDIA_ACCEPT} tagOptions /></div>}
            {(m.attachments ?? []).length ? <Gallery items={m.attachments} editable={staff} /> : <p className="muted small" style={{ margin: 0 }}>Fotoğraf eklenmemiş.</p>}
            {staff && <p className="xs muted mt-2">Müşteri yalnızca "müşteriye görünür" işaretli fotoğrafları görür.</p>}
          </Card>

          {(() => {
            const all: any[] = m.comments ?? [];
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
                    <div key={c.id} className={`cm-item${c.internal ? ' team' : ''}${c.userId && c.userId === user?.id ? ' mine' : ''}`}>
                      <Avatar name={c.userName} size="sm" />
                      <div className="cm-bubble">
                        <div className="small"><b>{c.userName}</b> <span className="muted xs">{relTime(c.createdAt)}</span></div>
                        <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
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
          <Card title="Bakım bilgileri">
            <KV items={[
              ['Tekne', <Link to={`/vessels/${m.vessel.id}`}>{m.vessel.name}</Link>],
              ['Marina', [m.vessel.marina, m.vessel.berth].filter(Boolean).join(' · ') || null],
              ['Tarih', fmtDate(m.plannedDate)],
              ['Periyot', repeatText(m) || 'Tek seferlik'],
              ...(m.repeatUntil ? [['Tekrar bitişi', fmtDate(m.repeatUntil)] as [string, any]] : []),
              ['Teknisyenler', teamText(m) || 'Atanmadı'],
              ...(staff ? [['Öncelik', PRIORITY_LABELS[m.priority as keyof typeof PRIORITY_LABELS] ?? m.priority] as [string, any], ['Tahmini süre', m.estimatedHours != null ? `${m.estimatedHours} saat` : null] as [string, any]] : []),
              ...(m.source === 'CUSTOMER' ? [['Talep', `Müşteri talebi${m.requester ? ` · ${m.requester.name}` : ''}`] as [string, any]] : []),
            ]} />
            {staff && m.technicalNotes && <><div className="divider" /><div className="small"><b>Teknik notlar</b><div style={{ whiteSpace: 'pre-wrap' }}>{m.technicalNotes}</div></div></>}
          </Card>

          {staff && (
            <Card title={<span className="row" style={{ gap: 8 }}><ClipboardList size={16} /> Ek işler (iş emirleri)</span>} pad={false}>
              {(m.extraWorkOrders ?? []).length === 0 && <Empty title="Bağlı iş emri yok" text="Bakım sırasında ek bir iş çıkarsa buradan iş emri açabilirsiniz." />}
              {(m.extraWorkOrders ?? []).map((w: any) => (
                <Link key={w.id} to={`/work-orders/${w.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow"><div className="strong truncate">{w.title}</div><div className="xs muted">{w.number}{w.technician ? ` · ${w.technician.name}` : ''}</div></div>
                  <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} />
                </Link>
              ))}
              {m.workOrder && (
                <Link to={`/work-orders/${m.workOrder.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="grow"><div className="strong">{m.workOrder.number}</div><div className="xs muted">Eski bağlantı</div></div>
                  <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={m.workOrder.status} />
                </Link>
              )}
              {can('workorders.manage') && <div className="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}><button className="btn btn-sm" onClick={() => setExtra(true)}><Plus /> Ek iş emri aç</button></div>}
            </Card>
          )}

          {(m.series ?? []).length > 1 && (
            <Card title={<span className="row" style={{ gap: 8 }}><Repeat size={16} /> Tekrarlar</span>}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <button className="btn btn-sm" disabled={!prev} onClick={() => nav(`/maintenance/${prev.id}`)}>← {prev ? fmtDate(prev.plannedDate) : 'Önceki'}</button>
                <span className="xs muted">{idx + 1} / {m.series.length}</span>
                <button className="btn btn-sm" disabled={!next} onClick={() => nav(`/maintenance/${next.id}`)}>{next ? fmtDate(next.plannedDate) : 'Sonraki'} →</button>
              </div>
              <div className="xs muted mt-2">Tamamlanan: {m.series.filter((x: any) => x.status === 'COMPLETED').length} · Gecikmiş: {m.series.filter((x: any) => x.status === 'OVERDUE').length}</div>
            </Card>
          )}
        </div>
      </div>

      {edit && <MaintenanceForm id={m.id} onClose={() => setEdit(false)} />}
      {extra && <WorkOrderForm vesselId={m.vessel.id} initial={{ vesselId: m.vessel.id, parentPlanId: m.id, parentPlan: { id: m.id, title: m.title, plannedDate: m.plannedDate, category: m.category }, technicianId: m.technicianId ?? '', helperIds: m.helperIds ?? [] }} onClose={() => setExtra(false)} onCreated={(w) => nav(`/work-orders/${w.id}`)} />}
      {done && <CompleteModal m={m} steps={steps} onClose={() => setDone(false)} />}
    </div>
  );
}

/** Tamamla: tüm adımlar tamamlanır; not müşteriye özet olarak görünür */
export function CompleteModal({ m, steps, onClose }: { m: any; steps: Step[]; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const save = useAction(() => api(`/maintenance/${m.id}/complete`, { body: { note: note || null, actualHours: hours || null } }), { success: 'Bakım tamamlandı', onSuccess: onClose });
  const open = steps.filter((s) => !s.done).length;
  return (
    <Modal open onClose={onClose} title="Bakımı tamamla" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-success" disabled={save.isPending} onClick={() => save.mutate(undefined)}><CheckCircle2 /> Tamamla</button></>}>
      <div className="stack">
        <div><b>{m.title}</b><div className="small muted">{m.vessel?.name} · {fmtDate(m.plannedDate)}</div></div>
        {steps.length > 0 && <div className="notice">{open ? `Kalan ${open} adım da tamamlandı olarak işaretlenecek.` : 'Tüm adımlar tamamlandı.'}</div>}
        <Field label="Müşteriye özet (isteğe bağlı)"><textarea className="textarea" value={note} placeholder="Ör. Tüm kontroller yapıldı, akü voltajı normal. Sintinede su yok." onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Gerçekleşen süre (saat)"><input className="input" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
