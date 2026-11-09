import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardList, MapPin, Anchor, Wrench, AlertTriangle, Hammer, ChevronRight, CheckCircle2, MessageSquarePlus, Receipt, Camera, Ship } from 'lucide-react';
import { MAINTENANCE_CATEGORY_KEYS, PRIORITIES } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, fileUrl, uploadFiles } from '../lib/api';
import { Badge, Card, DataTable, Empty, Field, Loading, PageHeader, Progress, Seg, StatusBadge } from '../components/ui';
import { VesselCover } from '../components/VesselCover';
import { fmtDate, relTime } from '../lib/format';
import { CATEGORY_LABELS, CATEGORY_SHORT, MAINTENANCE_STATUS_LABELS, MAINT_TONE, PRIORITY_LABELS, PROJECT_STATUS_LABELS, PROJECT_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

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
  const maint = useApi<any>(vesselId ? '/maintenance' : null, { vesselId, upcoming: 'true', pageSize: 5 }).data?.items ?? [];
  const projects = useApi<any>(vesselId ? '/projects' : null, { vesselId }).data?.items ?? [];
  const quotes = useApi<any>(can('quotes.respond') ? '/quotes' : null, { status: 'SENT' }).data?.items ?? [];
  const uploadCover = useAction((files: File[]) => uploadFiles('VESSEL', vesselId!, files, { caption: 'Kapak' }), { success: 'Tekne fotoğrafı güncellendi' });
  if (!vessels) return <Loading />;
  if (!vessels.length) return <Card><Empty title="Hesabınıza bağlı tekne bulunmuyor" text="Lütfen Nexus Marine operasyon ekibiyle iletişime geçin." /></Card>;
  // Kapak yalnızca tekneye yüklenen fotoğraftır; iş emri fotoğrafları kapak olmaz
  const cover = photos.find((p) => p.mimeType.startsWith('image/') && p.entityType === 'VESSEL');
  const open = wos.filter((w: any) => !['CLOSED', 'CANCELLED', 'PUBLISHED'].includes(w.status));
  const done = wos.filter((w: any) => ['PUBLISHED', 'CLOSED'].includes(w.status));
  const current = open.find((w: any) => w.status === 'IN_PROGRESS') ?? open[0];

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
                <button className="btn btn-primary" onClick={() => nav(`/request?vesselId=${v.id}`)}><MessageSquarePlus /> Servis talebi</button>
                <button className="btn btn-light" onClick={() => nav(`/request?vesselId=${v.id}&type=fault`)}><AlertTriangle /> Arıza bildir</button>
                <button className="btn btn-light" onClick={() => nav(`/vessels/${v.id}`)}>Tekne detayı</button>
              </div>
            </div>
          </section>

          {quotes.length > 0 && (
            <div className="notice" style={{ cursor: 'pointer' }} onClick={() => nav(`/quotes/${quotes[0].id}`)}>
              <Receipt /> <div><b>{quotes.length} teklif onayınızı bekliyor.</b> {quotes[0].title} — incelemek için tıklayın.</div>
            </div>
          )}

          <div className="grid g-3">
            <Card title={<span className="row" style={{ gap: 8 }}><Wrench size={16} /> Güncel servis durumu</span>}>
              {current ? (
                <div className="stack" style={{ gap: 12, cursor: 'pointer' }} onClick={() => nav(`/work-orders/${current.id}`)}>
                  <div><b>{current.title}</b><div className="xs muted">{current.number} · {current.technician?.name ?? 'Planlanıyor'}</div></div>
                  <StatusTracker status={current.status} />
                </div>
              ) : <Empty title="Aktif servis yok" icon={<CheckCircle2 />} text="Tekneniz için devam eden bir işlem bulunmuyor." />}
            </Card>
            <Card title={<span className="row" style={{ gap: 8 }}><CalendarClock size={16} /> Yaklaşan bakım</span>} pad={false}>
              {maint.length === 0 && <Empty title="Planlı bakım yok" />}
              {maint.slice(0, 4).map((m: any) => (
                <div key={m.id} className="list-item">
                  <div className="date-tile"><b>{new Date(m.plannedDate).getDate()}</b><span>{new Date(m.plannedDate).toLocaleDateString('tr-TR', { month: 'short' })}</span></div>
                  <div className="grow"><div className="strong truncate">{m.title}</div><div className="xs muted">{CATEGORY_SHORT[m.category]}</div></div>
                  <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} />
                </div>
              ))}
            </Card>
            <Card title={<span className="row" style={{ gap: 8 }}><ClipboardList size={16} /> Açık talepler</span>} pad={false}>
              {open.length === 0 && <Empty title="Açık talep yok" />}
              {open.slice(0, 5).map((w: any) => (
                <div key={w.id} className="list-item clickable" onClick={() => nav(`/work-orders/${w.id}`)}>
                  <div className="grow"><div className="strong truncate">{w.title}</div><div className="xs muted">{w.number} · {relTime(w.createdAt)}</div></div>
                  <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} />
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

export function PortalMaintenance() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const upcoming = useApi<any>('/maintenance', { upcoming: 'true', pageSize: 100 }).data?.items ?? [];
  const history = useApi<any>('/work-orders', { group: 'done', pageSize: 100 }).data?.items ?? [];
  const progress = useApi<any>('/work-orders', { group: 'open', pageSize: 100 }).data?.items ?? [];
  return (
    <div>
      <PageHeader title="Bakımlar" sub="Planlı bakımlar, devam eden işlemler ve bakım geçmişi" />
      <div className="request-cta mb-2">
        <div className="rc-ic"><MessageSquarePlus /></div>
        <div className="rc-txt"><b>Teknenizin bir ihtiyacı mı var?</b><span>Servis talebi oluşturun ya da bir arızayı bildirin, ekibimiz hemen planlasın.</span></div>
        <div className="rc-act">
          <button className="btn btn-primary" onClick={() => nav('/request')}><MessageSquarePlus /> Servis talebi</button>
          <button className="btn btn-light" onClick={() => nav('/request?type=fault')}><AlertTriangle /> Arıza bildir</button>
        </div>
      </div>
      <div className="mb-2"><Seg value={tab} onChange={setTab} options={[['upcoming', 'Planlı ve devam eden'], ['history', 'Bakım geçmişi']]} /></div>
      {tab === 'upcoming' ? (
        <div className="stack">
          <Card title="Devam eden işlemler" pad={false}>
            {progress.length === 0 && <Empty title="Devam eden işlem yok" />}
            {progress.map((w: any) => (
              <div key={w.id} className="list-item clickable" onClick={() => nav(`/work-orders/${w.id}`)}>
                <div className="grow"><b>{w.title}</b><div className="xs muted">{w.vessel.name} · {w.number}</div><div className="mt-1" style={{ maxWidth: 420 }}><StatusTracker status={w.status} /></div></div>
                <ChevronRight size={18} className="muted" />
              </div>
            ))}
          </Card>
          <Card title="Planlı bakımlar" pad={false}>
            <DataTable rows={upcoming} columns={[
              { key: 'd', label: 'Tarih', render: (m: any) => <b>{fmtDate(m.plannedDate)}</b> },
              { key: 't', label: 'Bakım', render: (m: any) => <div><div className="cell-title">{m.title}</div><div className="cell-sub">{CATEGORY_LABELS[m.category]}</div></div> },
              { key: 'v', label: 'Tekne', render: (m: any) => m.vessel.name },
              { key: 's', label: 'Durum', render: (m: any) => <StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} /> },
            ]} empty={<Empty title="Planlı bakım yok" />} />
          </Card>
        </div>
      ) : (
        <Card pad={false}>
          <DataTable rows={history} onRowClick={(w: any) => nav(`/work-orders/${w.id}`)} columns={[
            { key: 'd', label: 'Tarih', render: (w: any) => fmtDate(w.publishedAt ?? w.finishedAt ?? w.createdAt) },
            { key: 't', label: 'İşlem', render: (w: any) => <div><div className="cell-title">{w.title}</div><div className="cell-sub">{w.customerSummary}</div></div> },
            { key: 'v', label: 'Tekne', render: (w: any) => w.vessel.name },
            { key: 's', label: 'Durum', render: (w: any) => <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /> },
          ]} empty={<Empty title="Henüz yayınlanmış bakım kaydı yok" />} />
        </Card>
      )}
    </div>
  );
}

export function PortalRequest() {
  const nav = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const vessels = useApi<any>('/vessels', { pageSize: 50 }).data?.items ?? [];
  const [type, setType] = useState<'service' | 'fault'>(params.get('type') === 'fault' ? 'fault' : 'service');
  const [f, setF] = useState({ vesselId: params.get('vesselId') ?? '', title: '', description: '', category: '', priority: 'MEDIUM' });
  const [files, setFiles] = useState<FileList | null>(null);
  const mine = useApi<any>('/work-orders', { pageSize: 20 }).data?.items ?? [];
  const submit = useAction(async () => {
    const vesselId = f.vesselId || vessels[0]?.id;
    if (type === 'fault') {
      const fault = await api('/faults', { body: { vesselId, title: f.title, description: f.description, severity: f.priority === 'MEDIUM' ? 'HIGH' : f.priority } });
      if (files?.length) await uploadFiles('FAULT', fault.id, files);
      return { kind: 'fault' };
    }
    const wo = await api('/work-orders', { body: { vesselId, title: f.title, description: f.description, category: f.category || null, priority: f.priority } });
    if (files?.length) await uploadFiles('WORK_ORDER', wo.id, files);
    return wo;
  }, { success: type === 'fault' ? 'Arıza bildiriminiz alındı' : 'Servis talebiniz alındı', onSuccess: (r) => (r.kind === 'fault' ? setF({ ...f, title: '', description: '' }) : nav(`/work-orders/${r.id}`)) });
  return (
    <div>
      <PageHeader title={type === 'fault' ? 'Arıza bildirimi' : 'Servis / bakım talebi'} sub="Talebiniz operasyon ekibimize anında iletilir." actions={<Seg value={type} onChange={setType} options={[['service', 'Servis talebi'], ['fault', 'Arıza bildirimi']]} />} />
      <div className="grid g-side">
        <Card>
          <div className="form-grid">
            <Field label="Tekne"><select className="select" value={f.vesselId || vessels[0]?.id || ''} onChange={(e) => setF({ ...f, vesselId: e.target.value })}>{vessels.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
            {type === 'service' ? (
              <Field label="Bakım türü"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Belirtmek istemiyorum</option>{MAINTENANCE_CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}</select></Field>
            ) : (
              <Field label="Aciliyet"><select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
            )}
            <Field label={type === 'fault' ? 'Arıza' : 'Talep konusu'} full><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={type === 'fault' ? 'Örn. Jeneratör çalışmıyor' : 'Örn. Kış bakımı, pasta-polish'} /></Field>
            <Field label="Açıklama" full><textarea className="textarea" style={{ minHeight: 120 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Detayları, konumu ve tercih ettiğiniz tarihleri yazabilirsiniz." /></Field>
            <Field label="Fotoğraf ekle" full>
              <label className="dropzone" style={{ display: 'block' }}>
                <input type="file" hidden multiple accept="image/*" capture="environment" onChange={(e) => setFiles(e.target.files)} />
                {files?.length ? `${files.length} fotoğraf seçildi` : 'Fotoğraf çekin veya galeriden seçin'}
              </label>
            </Field>
          </div>
          <div className="row mt-3"><span className="spacer" /><button className={`btn ${type === 'fault' ? 'btn-danger' : 'btn-primary'}`} disabled={f.title.length < 2 || submit.isPending} onClick={() => submit.mutate(undefined)}>{type === 'fault' ? 'Arızayı bildir' : 'Talebi gönder'}</button></div>
        </Card>
        <Card title="Son taleplerim" pad={false}>
          {mine.length === 0 && <Empty />}
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
