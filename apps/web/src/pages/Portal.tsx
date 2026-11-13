import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardList, MapPin, Anchor, Wrench, AlertTriangle, Hammer, ChevronRight, CheckCircle2, MessageSquarePlus, Receipt, Camera, Ship, FileSignature, CalendarPlus, X } from 'lucide-react';
import { PRIORITIES } from '@nexus/shared';
import { activeMaintCats, maintItems, useMaintCats } from '../lib/maintCats';
import { RepeatPicker, defaultEnd, repeatBody, repeatText, repeatValid, todayStr, type RepeatValue } from '../components/planning';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, fileUrl, uploadFiles } from '../lib/api';
import { Badge, Card, DataTable, Empty, Field, Loading, Modal, PageHeader, Progress, Seg, StatusBadge, useToast } from '../components/ui';
import { VesselCover } from '../components/VesselCover';
import { MonthAgenda } from './PortalCalendar';
import { fmtDate, fmtDateTime, relTime } from '../lib/format';
import { faultActivity, faultClientStatus, CATEGORY_LABELS, CATEGORY_SHORT, MAINTENANCE_STATUS_LABELS, MAINT_TONE, PRIORITY_LABELS, PROJECT_STATUS_LABELS, PROJECT_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

const PROGRESS_STEPS = ['REQUESTED', 'PLANNED', 'IN_PROGRESS', 'TECHNICAL_REVIEW', 'PUBLISHED'];
const stepOf = (s: string) => ({ REQUESTED: 0, EVALUATION: 0, PLANNED: 1, ASSIGNED: 1, IN_PROGRESS: 2, ON_HOLD: 2, REVISION_REQUIRED: 2, TECHNICAL_REVIEW: 3, COMPLETED: 3, PUBLISHED: 4, CLOSED: 4 } as Record<string, number>)[s] ?? 0;
const STEP_LABELS = ['Talep alındı', 'Planlandı', 'İşlemde', 'Kontrolde', 'Tamamlandı'];

export function PortalHome() {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const vessels = useApi<any>('/vessels', { pageSize: 50 }).data?.items;
  const [sel, setSel] = useState<string | null>(null);
  const vesselId = sel ?? vessels?.[0]?.id;
  const v = useApi<any>(vesselId ? `/vessels/${vesselId}` : null).data;
  const photos = useApi<any[]>(vesselId ? '/files' : null, { vesselId }).data ?? [];
  const wos = useApi<any>(vesselId ? '/work-orders' : null, { vesselId, pageSize: 50 }).data?.items ?? [];
  const projects = useApi<any>(vesselId ? '/projects' : null, { vesselId }).data?.items ?? [];
  const homeFaults = useApi<any>('/faults', { pageSize: 50 }).data?.items ?? [];
  const quotes = useApi<any>(can('quotes.respond') ? '/quotes' : null, { status: 'SENT' }).data?.items ?? [];
  const approvals = useApi<any>('/reports', { approval: 'PENDING' }).data?.items ?? [];
  const uploadCover = useAction((files: File[]) => uploadFiles('VESSEL', vesselId!, files, { caption: 'Kapak' }), { success: 'Tekne fotoğrafı güncellendi' });
  if (!vessels) return <Loading />;
  if (!vessels.length) return <Card><Empty title="Hesabınıza bağlı tekne bulunmuyor" text="Lütfen Nexus Marin operasyon ekibiyle iletişime geçin." /></Card>;
  // Kapak yalnızca tekneye yüklenen fotoğraftır; iş emri fotoğrafları kapak olmaz
  const cover = photos.find((p) => p.mimeType.startsWith('image/') && p.entityType === 'VESSEL');
  // Arızadan açılan iş emirleri müşteriye arıza olarak gösterilir (takip arıza sayfasından)
  const faultWo = new Set(homeFaults.map((f: any) => f.workOrder?.id).filter(Boolean));
  const ownWos = wos.filter((w: any) => !faultWo.has(w.id));
  const open = ownWos.filter((w: any) => !['CLOSED', 'CANCELLED', 'PUBLISHED'].includes(w.status));
  const done = ownWos.filter((w: any) => ['PUBLISHED', 'CLOSED'].includes(w.status));
  // Açık talepler: iş emirleri + arıza bildirimleri, son işlem tarihine göre (en güncel üstte)
  const openFaults = homeFaults.filter((f: any) => f.vessel?.id === vesselId && faultClientStatus(f)[0] !== 'Giderildi');
  const openItems = [
    ...open.map((w: any) => ({ kind: 'wo', at: +new Date(w.updatedAt ?? w.createdAt), w })),
    ...openFaults.map((f: any) => ({ kind: 'fault', at: faultActivity(f), f })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="stack">
      {!v ? <Loading /> : (
        <>
          <section className="vessel-hero portal-hero">
            <VesselCover vessel={v} photoUrl={cover ? fileUrl(cover.id) : null} />
            <div className="shade" />
            <div className="ph-top">
              <div className="ph-welcome">
                <label className="ph-thumb" title="Tekne fotoğrafını değiştir">
                  {cover ? <img src={fileUrl(cover.id)} alt={v.name} /> : <Ship size={22} />}
                  <i>{uploadCover.isPending ? <span className="spin" /> : <Camera size={12} />}</i>
                  <input type="file" accept="image/*" hidden disabled={uploadCover.isPending} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) uploadCover.mutate(f); }} />
                </label>
                <div>
                  <span>Hoş geldiniz, {user?.name}</span>
                  <b>{v.name}</b>
                </div>
              </div>
              {vessels.length > 1 && (
                <select className="select" aria-label="Tekne seçin" value={vesselId} onChange={(e) => setSel(e.target.value)}>
                  {vessels.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </div>
            <div className="vh-body">
              {v.type && <Badge tone="navy" plain>{v.type}</Badge>}
              <h1 className="mt-1">{v.name}</h1>
              <div className="row-wrap mt-1" style={{ color: '#c9d9ea', gap: 16 }}>
                <span className="row" style={{ gap: 6 }}><Anchor size={15} /> {[v.make, v.model].filter(Boolean).join(' ')}{v.year ? ` · ${v.year}` : ''}{v.lengthM ? ` · ${String(v.lengthM).replace('.', ',')} m` : ''}</span>
                <span className="row" style={{ gap: 6 }}><MapPin size={15} /> {v.marina} {v.berth && `· ${v.berth}`}</span>
              </div>
              <div className="row-wrap mt-2">
                <button className="btn btn-primary" onClick={() => nav(`/request?vesselId=${v.id}`)}><MessageSquarePlus /> Servis/Bakım Talebi</button>
                <button className="btn btn-light" onClick={() => nav(`/request?vesselId=${v.id}&type=fault`)}><AlertTriangle /> Arıza bildir</button>
                <button className="btn btn-light" onClick={() => nav(`/vessels/${v.id}`)}>Tekne detayı</button>
              </div>
            </div>
          </section>

          {approvals.length > 0 && (
            <div className="notice warn" style={{ cursor: 'pointer' }} onClick={() => nav(`/reports/${approvals[0].id}`)}>
              <FileSignature /> <div><b>{approvals.length} belge onayınızı bekliyor.</b> {approvals[0].title} — incelemek ve onaylamak için tıklayın.</div>
            </div>
          )}
          {quotes.length > 0 && (
            <div className="notice" style={{ cursor: 'pointer' }} onClick={() => nav(`/quotes/${quotes[0].id}`)}>
              <Receipt /> <div><b>{quotes.length} teklif onayınızı bekliyor.</b> {quotes[0].title} — incelemek için tıklayın.</div>
            </div>
          )}

          <div className="grid g-2">
            <MonthAgenda vesselId={vesselId} />
            <Card title={<span className="row" style={{ gap: 8 }}><ClipboardList size={16} /> Açık talepler</span>} pad={false}>
              {openItems.length === 0 && <Empty title="Açık talep yok" />}
              {openItems.slice(0, 6).map((x: any) => x.kind === 'wo' ? (
                <div key={x.w.id} className="list-item clickable" onClick={() => nav(`/work-orders/${x.w.id}`)}>
                  <div className="grow"><div className="strong truncate">{x.w.title}</div><div className="xs muted">{x.w.number} · {relTime(new Date(x.at).toISOString())}</div></div>
                  <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={x.w.status} />
                </div>
              ) : (
                <div key={x.f.id} className="list-item clickable" onClick={() => nav(`/faults/${x.f.id}`)}>
                  <AlertTriangle size={16} color="var(--warn, #b26a00)" />
                  <div className="grow"><div className="strong truncate">{x.f.title}</div><div className="xs muted">Arıza bildirimi · {relTime(new Date(x.at).toISOString())}</div></div>
                  <Badge tone={faultClientStatus(x.f)[1]}>{faultClientStatus(x.f)[0]}</Badge>
                </div>
              ))}
            </Card>
          </div>

          {projects.length > 0 && (
            <Card title={<span className="row" style={{ gap: 8 }}><Hammer size={16} /> Restorasyon projeleri</span>} pad={false}>
              {projects.map((p: any) => (
                <div key={p.id} className="list-item clickable" onClick={() => nav(`/projects/${p.id}`)}>
                  <div className="grow">
                    <div className="row"><b>{p.name}</b><StatusBadge map={PROJECT_TONE} labels={PROJECT_STATUS_LABELS} value={p.status} /></div>
                    <div className="row mt-1"><div style={{ flex: 1, maxWidth: 420 }}><Progress value={p.progress} /></div><b className="mono small">%{p.progress}</b></div>
                    <div className="xs muted mt-1">{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</div>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </div>
              ))}
            </Card>
          )}

          <Card title="Son tamamlanan servisler" pad={false}>
            {done.length === 0 && <Empty />}
            {done.slice(0, 5).map((w: any) => (
              <div key={w.id} className="list-item clickable" onClick={() => nav(`/work-orders/${w.id}`)}>
                <CheckCircle2 size={18} color="var(--ok)" />
                <div className="grow"><div className="strong truncate">{w.title}</div><div className="xs muted">{fmtDate(w.finishedAt ?? w.publishedAt)}</div></div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function StatusTracker({ status }: { status: string }) {
  const s = stepOf(status);
  return (
    <div>
      <div className="row" style={{ gap: 4 }}>
        {PROGRESS_STEPS.map((_, i) => <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i <= s ? (s === 4 ? 'var(--ok)' : 'var(--marine)') : 'var(--neutral-bg)' }} />)}
      </div>
      <div className="row mt-1" style={{ justifyContent: 'space-between' }}>
        <span className="small strong" style={{ color: 'var(--marine)' }}>{STEP_LABELS[s]}</span>
        <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={status} />
      </div>
    </div>
  );
}

/** Müşteri arıza durumu: Alındı → İşlemde → Giderildi */

export function PortalMaintenance() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [planning, setPlanning] = useState(false);
  const upcoming = useApi<any>('/maintenance', { upcoming: 'true', pageSize: 100 }).data?.items ?? [];
  const history = useApi<any>('/work-orders', { group: 'done', pageSize: 100 }).data?.items ?? [];
  const progress = useApi<any>('/work-orders', { group: 'open', pageSize: 100 }).data?.items ?? [];
  const faults = useApi<any>('/faults', { pageSize: 50 }).data?.items ?? [];
  const doneMaint = useApi<any>(tab === 'history' ? '/maintenance' : null, { status: 'COMPLETED', pageSize: 50, sort: 'plannedDate', order: 'desc' }).data?.items ?? [];
  // Arızadan açılan iş emirleri ayrıca listelenmez: müşteri arızayı takip eder
  const faultWo = new Set(faults.map((f: any) => f.workOrder?.id).filter(Boolean));
  const openFaults = faults.filter((f: any) => faultClientStatus(f)[0] !== 'Giderildi').sort((a: any, b: any) => faultActivity(b) - faultActivity(a));
  const resolvedFaults = faults.filter((f: any) => faultClientStatus(f)[0] === 'Giderildi');
  // Tamamlanan işler: iş emirleri + giderilen arıza bildirimleri
  const doneItems = [
    ...history.filter((w: any) => !faultWo.has(w.id)).map((w: any) => ({ kind: 'wo', id: w.id, at: w.publishedAt ?? w.finishedAt ?? w.createdAt, title: w.title, number: w.number, sub: w.customerSummary, vessel: w.vessel.name, status: w.status })),
    ...resolvedFaults.map((f: any) => ({ kind: 'fault', id: f.id, at: f.resolvedAt ?? f.workOrder?.updatedAt ?? f.createdAt, title: f.title, vessel: f.vessel.name, f })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return (
    <div>
      <PageHeader title="İşlemler" sub="Arıza bildirimleriniz, devam eden işlemler, planlı bakımlar ve geçmiş" />
      <div className="request-cta mb-2">
        <div className="rc-ic"><MessageSquarePlus /></div>
        <div className="rc-txt"><b>Teknenizin bir ihtiyacı mı var?</b><span>Servis talebi oluşturun, arıza bildirin ya da düzenli bakım planlayın.</span></div>
        <div className="rc-act">
          <button className="btn btn-primary" onClick={() => nav('/request')}><MessageSquarePlus /> Servis/Bakım Talebi</button>
          <button className="btn btn-light" onClick={() => setPlanning(true)}><CalendarPlus /> Bakım planla</button>
          <button className="btn btn-light" onClick={() => nav('/request?type=fault')}><AlertTriangle /> Arıza bildir</button>
        </div>
      </div>
      <div className="mb-2"><Seg value={tab} onChange={setTab} options={[['upcoming', 'Güncel işlemler'], ['history', 'Geçmiş']]} /></div>
      {tab === 'upcoming' ? (
        <div className="stack">
          <Card title={<span className="row" style={{ gap: 8 }}><AlertTriangle size={16} /> Arıza bildirimlerim</span>} pad={false}>
            {openFaults.length === 0 && <Empty title="Açık arıza bildiriminiz yok" />}
            {openFaults.map((f: any) => <FaultRow key={f.id} f={f} onClick={() => nav(`/faults/${f.id}`)} />)}
          </Card>
          <Card title="Devam eden işlemler" pad={false}>
            {progress.filter((w: any) => !faultWo.has(w.id)).length === 0 && <Empty title="Devam eden işlem yok" />}
            {progress.filter((w: any) => !faultWo.has(w.id)).map((w: any) => (
              <div key={w.id} className="list-item clickable" onClick={() => nav(`/work-orders/${w.id}`)}>
                <div className="grow"><b>{w.title}</b><div className="xs muted">{w.vessel.name} · {w.number}</div><div className="mt-1" style={{ maxWidth: 420 }}><StatusTracker status={w.status} /></div></div>
                <ChevronRight size={18} className="muted" />
              </div>
            ))}
          </Card>
          <Card title="Planlı bakımlar" pad={false}>
            <DataTable rows={upcoming} onRowClick={(m: any) => nav(`/maintenance/${m.id}`)} columns={[
              { key: 'd', label: 'Tarih', render: (m: any) => <b>{fmtDate(m.plannedDate)}</b> },
              { key: 't', label: 'Bakım', render: (m: any) => <div><div className="cell-title row-wrap" style={{ gap: 6 }}>{m.title}{m.source === 'CUSTOMER' && <Badge tone="violet">Talebiniz</Badge>}</div><div className="cell-sub">{CATEGORY_LABELS[m.category]}{repeatText(m) ? ` · ${repeatText(m)}` : ''}</div></div> },
              { key: 'v', label: 'Tekne', render: (m: any) => m.vessel.name },
              { key: 's', label: 'Durum', render: (m: any) => <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} /> },
            ]} empty={<Empty title="Planlı bakım yok" text="“Bakım planla” ile düzenli bakım (ör. her Pazartesi akü kontrolü) oluşturabilirsiniz." />} />
          </Card>
        </div>
      ) : (
        <div className="stack">
          <Card pad={false} title="Tamamlanan işler">
            <DataTable rows={doneItems} onRowClick={(x: any) => nav(x.kind === 'wo' ? `/work-orders/${x.id}` : `/faults/${x.id}`)} columns={[
              { key: 'd', label: 'Tarih', render: (x: any) => fmtDate(x.at) },
              { key: 't', label: 'İş', render: (x: any) => <div><div className="cell-title row-wrap" style={{ gap: 6 }}>{x.kind === 'fault' && <AlertTriangle size={14} color="var(--ok)" />}{x.title}</div><div className="cell-sub">{x.kind === 'wo' ? [x.number, x.sub].filter(Boolean).join(' · ') : 'Arıza bildirimi'}</div></div> },
              { key: 'v', label: 'Tekne', render: (x: any) => x.vessel },
              { key: 's', label: 'Durum', render: (x: any) => x.kind === 'wo' ? <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={x.status} /> : <Badge tone={faultClientStatus(x.f)[1]}>{faultClientStatus(x.f)[0]}</Badge> },
            ]} empty={<Empty title="Henüz tamamlanan iş yok" />} />
          </Card>
          {doneMaint.length > 0 && (
            <Card title="Tamamlanan bakımlar" pad={false}>
              <DataTable rows={doneMaint} onRowClick={(m: any) => nav(`/maintenance/${m.id}`)} columns={[
                { key: 'd', label: 'Tarih', render: (m: any) => fmtDate(m.completedAt ?? m.plannedDate) },
                { key: 't', label: 'Bakım', render: (m: any) => <div><div className="cell-title">{m.title}</div><div className="cell-sub">{Array.isArray(m.checklist) && m.checklist.length ? `${m.checklist.length} adım tamamlandı` : CATEGORY_LABELS[m.category]}{m.completionNote ? ` · ${m.completionNote}` : ''}</div></div> },
                { key: 'v', label: 'Tekne', render: (m: any) => m.vessel.name },
                { key: 's', label: 'Durum', render: (m: any) => <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} /> },
              ]} />
            </Card>
          )}
        </div>
      )}
      {planning && <PortalPlanModal onClose={() => setPlanning(false)} />}
    </div>
  );
}

function FaultRow({ f, onClick }: { f: any; onClick: () => void }) {
  const [label, tone] = faultClientStatus(f);
  return (
    <div className="list-item clickable" onClick={onClick}>
      <AlertTriangle size={18} color={label === 'Giderildi' ? 'var(--ok)' : 'var(--warn, #b26a00)'} />
      <div className="grow">
        <div className="strong truncate">{f.title}</div>
        <div className="xs muted">{f.vessel.name} · {fmtDateTime(f.createdAt)}{f.workOrder?.technician ? ` · ${f.workOrder.technician.name}` : ''}</div>
      </div>
      <Badge tone={tone}>{label}</Badge>
      <ChevronRight size={18} className="muted" />
    </div>
  );
}

/** Müşteri: tek seferlik veya periyodik bakım planla → yönetim panelinde Bakım Planları'na "Müşteri talebi" olarak düşer */
function PortalPlanModal({ onClose }: { onClose: () => void }) {
  const vessels = useApi<any>('/vessels', { pageSize: 50 }).data?.items ?? [];
  const cats = useMaintCats();
  const today = todayStr();
  const [f, setF] = useState({ vesselId: '', category: '', title: '', description: '', plannedDate: today, endDate: defaultEnd('weekly', today) });
  const [rep, setRep] = useState<RepeatValue>({ mode: 'weekly', weekdays: [], monthDay: '', intervalDays: '' });
  const changeRepeat = (r: RepeatValue) => { if ((r.mode === 'none') !== (rep.mode === 'none')) setF({ ...f, endDate: defaultEnd(r.mode, f.plannedDate) }); setRep(r); };
  const category = f.category || cats.active[0]?.key || '';
  const items = maintItems(category);
  const save = useAction(() => {
    const r = repeatBody(rep);
    return api('/maintenance/request', { body: { vesselId: f.vesselId || vessels[0]?.id, category, title: f.title, description: f.description || null, plannedDate: f.plannedDate, repeatWeekdays: r.repeatWeekdays, repeatMonthDay: r.repeatMonthDay, repeatUntil: rep.mode === 'none' ? null : f.endDate || null } });
  }, { success: 'Bakım planınız oluşturuldu, operasyon ekibine iletildi', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} size="lg" title="Bakım planla" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={f.title.trim().length < 2 || !f.plannedDate || !repeatValid(rep) || save.isPending} onClick={() => save.mutate(undefined)}><CalendarPlus /> Planla</button></>}>
      <div className="form-grid">
        <Field label="Tekne"><select className="select" value={f.vesselId || vessels[0]?.id || ''} onChange={(e) => setF({ ...f, vesselId: e.target.value })}>{vessels.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Bakım türü"><select className="select" value={category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.active.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
        <Field label="Bakım *" full>
          <input className="input" list="pp-items" value={f.title} placeholder="Örn. Akü ve şarj sistemi kontrolü" onChange={(e) => setF({ ...f, title: e.target.value })} />
          <datalist id="pp-items">{items.map((i) => <option key={i} value={i} />)}</datalist>
        </Field>
        <Field label="Periyot" full><RepeatPicker value={rep} onChange={changeRepeat} allowInterval={false} /></Field>
        <Field label={rep.mode === 'none' ? 'Tarih *' : 'Başlangıç *'}><input className="input" type="date" min={today} value={f.plannedDate} onChange={(e) => setF({ ...f, plannedDate: e.target.value, endDate: rep.mode === 'none' ? e.target.value : f.endDate > e.target.value ? f.endDate : defaultEnd(rep.mode, e.target.value) })} /></Field>
        {rep.mode !== 'none' ? <Field label="Bitiş (son tekrar)" hint="Varsayılan: 1 yıl sonra"><input className="input" type="date" min={f.plannedDate} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field> : <span />}
        <Field label="Not (isteğe bağlı)" full><textarea className="textarea" value={f.description} placeholder="Tercih ettiğiniz saat, özel istekler…" onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function PortalRequest() {
  const nav = useNavigate();
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const vessels = useApi<any>('/vessels', { pageSize: 50 }).data?.items ?? [];
  const [type, setType] = useState<'service' | 'fault'>(params.get('type') === 'fault' ? 'fault' : 'service');
  const [f, setF] = useState({ vesselId: params.get('vesselId') ?? '', title: '', description: '', category: '', priority: 'MEDIUM' });
  const [files, setFiles] = useState<File[]>([]);
  const mine = useApi<any>('/work-orders', { pageSize: 20 }).data?.items ?? [];
  const myFaults = useApi<any>('/faults', { pageSize: 10 }).data?.items ?? [];
  const submit = useAction(async () => {
    const vesselId = f.vesselId || vessels[0]?.id;
    if (type === 'fault') {
      const fault = await api<any>('/faults', { body: { vesselId, title: f.title, description: f.description, severity: f.priority === 'MEDIUM' ? 'HIGH' : f.priority } });
      // Arıza kaydı oluştu; fotoğraf yüklenemezse kayıt yine de korunur
      if (files.length) await uploadFiles('FAULT', fault.id, files).catch((e) => toast(`Arıza kaydedildi ancak fotoğraf yüklenemedi: ${(e as Error).message}`, 'error'));
      return { kind: 'fault', id: fault.id };
    }
    const wo = await api<any>('/work-orders', { body: { vesselId, title: f.title, description: f.description, category: f.category || null, priority: f.priority } });
    if (files.length) await uploadFiles('WORK_ORDER', wo.id, files).catch((e) => toast(`Talep kaydedildi ancak fotoğraf yüklenemedi: ${(e as Error).message}`, 'error'));
    return wo;
  }, { success: type === 'fault' ? 'Arıza bildiriminiz alındı' : 'Servis talebiniz alındı', onSuccess: (r) => (r.kind === 'fault' ? nav(`/faults/${r.id}`) : nav(`/work-orders/${r.id}`)) });
  return (
    <div>
      <PageHeader title={type === 'fault' ? 'Arıza bildirimi' : 'Servis / bakım talebi'} sub="Talebiniz operasyon ekibimize anında iletilir." actions={<Seg value={type} onChange={setType} options={[['service', 'Servis talebi'], ['fault', 'Arıza bildirimi']]} />} />
      <div className="grid g-side">
        <Card>
          <div className="form-grid">
            <Field label="Tekne"><select className="select" value={f.vesselId || vessels[0]?.id || ''} onChange={(e) => setF({ ...f, vesselId: e.target.value })}>{vessels.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            {type === 'service' ? (
              <Field label="Bakım türü"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Belirtmek istemiyorum</option>{activeMaintCats().map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
            ) : (
              <Field label="Aciliyet"><select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
            )}
            <Field label={type === 'fault' ? 'Arıza' : 'Talep konusu'} full><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={type === 'fault' ? 'Örn. Jeneratör çalışmıyor' : 'Örn. Kış bakımı, pasta-polish'} /></Field>
            <Field label="Açıklama" full><textarea className="textarea" style={{ minHeight: 120 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Detayları, konumu ve tercih ettiğiniz tarihleri yazabilirsiniz." /></Field>
            <Field label="Fotoğraf / video ekle" full>
              {/* capture kullanılmaz: telefonda hem kamera hem galeri seçilebilsin */}
              <label className="dropzone" style={{ display: 'block' }}>
                <input type="file" hidden multiple accept="image/*,video/*,.heic,.heif" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; setFiles((x) => [...x, ...picked].slice(0, 10)); }} />
                <Camera size={16} style={{ verticalAlign: -3 }} /> {files.length ? `${files.length} dosya seçildi · eklemek için tekrar dokunun` : 'Fotoğraf çekin veya galeriden seçin'}
              </label>
              {files.length > 0 && (
                <div className="photo-picks">
                  {files.map((file, i) => <PickedThumb key={i} file={file} onRemove={() => setFiles(files.filter((_, j) => j !== i))} />)}
                </div>
              )}
            </Field>
          </div>
          <div className="row mt-3"><span className="spacer" /><button className={`btn ${type === 'fault' ? 'btn-danger' : 'btn-primary'}`} disabled={f.title.length < 2 || submit.isPending} onClick={() => submit.mutate(undefined)}>{submit.isPending ? 'Gönderiliyor…' : type === 'fault' ? 'Arızayı bildir' : 'Talebi gönder'}</button></div>
        </Card>
        <Card title="Son taleplerim" pad={false}>
          {mine.length === 0 && myFaults.length === 0 && <Empty />}
          {myFaults.filter((x: any) => x.status !== 'RESOLVED').slice(0, 5).map((x: any) => <FaultRow key={x.id} f={x} onClick={() => nav(`/faults/${x.id}`)} />)}
          {mine.slice(0, 8).map((w: any) => (
            <Link key={w.id} to={`/work-orders/${w.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="grow"><div className="strong truncate">{w.title}</div><div className="xs muted">{w.number} · {fmtDate(w.createdAt)}</div></div>
              <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} />
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}

function PickedThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/') || /hei[cf]/i.test(file.type)) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="pp" title={file.name}>
      {url ? <img src={url} alt={file.name} /> : <span>{file.name.split('.').pop()?.toUpperCase()}</span>}
      <button type="button" aria-label="Kaldır" onClick={onRemove}><X size={12} /></button>
    </div>
  );
}
