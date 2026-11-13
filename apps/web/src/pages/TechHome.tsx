import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Square, Camera, MapPin, Clock, ChevronRight, CheckCircle2, Hourglass, ClipboardCheck, Ship, Wrench } from 'lucide-react';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, uploadFiles } from '../lib/api';
import { Empty, Loading, Modal, StatusBadge } from '../components/ui';
import { MEDIA_ACCEPT } from '../components/media';
import { fmtTime, sameDay, addDays } from '../lib/format';
import { PRIORITY_LABELS, PRIORITY_TONE } from '../lib/labels';
import '../styles/simple.css';

/** Teknisyen ana sayfası: "bugün ne yapacağım?" sorusuna tek ekranda cevap */
export default function TechHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data } = useApi<any>('/work-orders', { group: 'open', pageSize: 100 }, { refetchInterval: 60_000 });
  // Bugüne kadar (gecikmişler dahil) ve yarın yapılacak bakımlar
  const until = new Date(); until.setDate(until.getDate() + 1); until.setHours(23, 59, 59, 0);
  const maint = useApi<any>('/maintenance', { status: 'PLANNED,OVERDUE,IN_PROGRESS', to: until.toISOString(), pageSize: 50, sort: 'plannedDate', order: 'asc' }, { refetchInterval: 60_000 }).data?.items ?? [];
  const [confirm, setConfirm] = useState<{ wo: any; to: 'IN_PROGRESS' | 'TECHNICAL_REVIEW' } | null>(null);
  const [note, setNote] = useState('');
  const move = useAction(
    () => api(`/work-orders/${confirm!.wo.id}/status`, { body: { status: confirm!.to, note: note || null } }),
    { success: confirm?.to === 'IN_PROGRESS' ? 'İşe başlandı, kolay gelsin!' : 'İş kontrole gönderildi', onSuccess: () => { setConfirm(null); setNote(''); } },
  );
  const upload = useAction(({ id, files }: { id: string; files: File[] }) => uploadFiles('WORK_ORDER', id, files, { tag: 'GENERAL' }), { success: 'Fotoğraf / video eklendi' });

  if (!data) return <Loading />;
  const items: any[] = (data.items ?? []).slice().sort((a: any, b: any) => +new Date(a.plannedStart ?? a.createdAt) - +new Date(b.plannedStart ?? b.createdAt));
  const active = items.filter((w) => w.status === 'IN_PROGRESS');
  const queue = items.filter((w) => ['ASSIGNED', 'REVISION_REQUIRED', 'ON_HOLD'].includes(w.status));
  const review = items.filter((w) => w.status === 'TECHNICAL_REVIEW');
  const today = new Date();
  const todays = queue.filter((w) => w.plannedStart && sameDay(new Date(w.plannedStart), today) || (w.plannedStart && new Date(w.plannedStart) < today));
  const tomorrow = queue.filter((w) => w.plannedStart && sameDay(new Date(w.plannedStart), addDays(today, 1)));
  const later = queue.filter((w) => !todays.includes(w) && !tomorrow.includes(w));
  const hour = today.getHours();
  const greet = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi çalışmalar' : 'İyi akşamlar';

  const pickFiles = (id: string) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = MEDIA_ACCEPT;
    inp.multiple = true;
    inp.onchange = () => { const f = Array.from(inp.files ?? []); if (f.length) upload.mutate({ id, files: f }); };
    inp.click();
  };

  const Job = ({ w, big }: { w: any; big?: boolean }) => (
    <div className={`job${big ? ' big' : ''}`}>
      <div className="job-main" onClick={() => nav(`/work-orders/${w.id}`)}>
        <div className="job-time">
          {w.plannedStart ? <><b>{fmtTime(w.plannedStart)}</b><span>{new Date(w.plannedStart).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span></> : <span>—</span>}
        </div>
        <div className="job-info">
          <b>{w.title.split(' — ')[0]}</b>
          <span><Ship size={13} /> {w.vessel?.name}{w.vessel?.marina ? ` · ${w.vessel.marina}` : ''}</span>
          <div className="job-tags">
            <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={w.priority} />
            {w.status === 'REVISION_REQUIRED' && <span className="tag-warn">Revizyon istendi</span>}
            {w.status === 'ON_HOLD' && <span className="tag-muted">Beklemede</span>}
          </div>
        </div>
        <ChevronRight className="job-go" />
      </div>
      <div className="job-actions">
        {w.status === 'IN_PROGRESS' && (
          <>
            <button className="btn btn-light-2" onClick={() => pickFiles(w.id)} disabled={upload.isPending}><Camera /> {upload.isPending ? 'Yükleniyor…' : 'Fotoğraf / video'}</button>
            <button className="btn btn-primary" onClick={() => setConfirm({ wo: w, to: 'TECHNICAL_REVIEW' })}><Square /> İşi bitir</button>
          </>
        )}
        {['ASSIGNED', 'REVISION_REQUIRED'].includes(w.status) && (
          <button className="btn btn-primary" onClick={() => setConfirm({ wo: w, to: 'IN_PROGRESS' })}><Play /> İşe başla</button>
        )}
      </div>
    </div>
  );

  const Section = ({ title, list, icon }: { title: string; list: any[]; icon: React.ReactNode }) =>
    list.length ? (
      <section className="job-section">
        <h3>{icon} {title} <em>{list.length}</em></h3>
        <div className="stack" style={{ gap: 10 }}>{list.map((w) => <Job key={w.id} w={w} />)}</div>
      </section>
    ) : null;

  return (
    <div className="tech-home">
      <header className="tech-hero">
        <span>{today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1>{greet}, {user?.name.split(' ')[0]}</h1>
        <p>{active.length ? (active.length > 1 ? `${active.length} devam eden işin var.` : 'Devam eden bir işin var.') : todays.length ? `Bugün ${todays.length} işin var.` : queue.length ? 'Bugün için planlı işin yok.' : 'Sana atanmış açık iş yok.'}</p>
        <div className="tech-stats">
          <div><b>{active.length}</b><span>Süren</span></div>
          <div><b>{todays.length}</b><span>Bugün</span></div>
          <div><b>{queue.length}</b><span>Bekleyen</span></div>
          <div><b>{review.length}</b><span>Kontrolde</span></div>
        </div>
      </header>

      {active.length > 0 && (
        <section className="job-section">
          <h3><Clock size={16} /> Şu an çalıştığın iş</h3>
          <div className="stack" style={{ gap: 10 }}>{active.map((w) => <Job key={w.id} w={w} big />)}</div>
        </section>
      )}

      {maint.length > 0 && (
        <section className="job-section">
          <h3><Wrench size={16} /> Bakımlarım <em>{maint.length}</em></h3>
          <div className="stack" style={{ gap: 8 }}>
            {maint.map((m: any) => {
              const steps: any[] = Array.isArray(m.checklist) ? m.checklist : [];
              return (
                <div key={m.id} className="job-mini" style={{ cursor: 'pointer' }} onClick={() => nav(`/maintenance/${m.id}`)}>
                  {m.status === 'OVERDUE' ? <Hourglass size={16} color="var(--danger)" /> : <Wrench size={16} />}
                  <span>{m.title}</span>
                  <small>{m.vessel?.name} · {new Date(m.plannedDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}{steps.length ? ` · ${steps.filter((x) => x.done).length}/${steps.length}` : ''}{m.status === 'OVERDUE' ? ' · gecikmiş' : ''}</small>
                  <ChevronRight size={16} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Section title="Bugün" list={todays} icon={<ClipboardCheck size={16} />} />
      <Section title="Yarın" list={tomorrow} icon={<MapPin size={16} />} />
      <Section title="Sonraki işler" list={later} icon={<Hourglass size={16} />} />

      {review.length > 0 && (
        <section className="job-section muted-section">
          <h3><CheckCircle2 size={16} /> Yönetici kontrolünde <em>{review.length}</em></h3>
          <div className="stack" style={{ gap: 8 }}>
            {review.map((w) => (
              <div key={w.id} className="job-mini" onClick={() => nav(`/work-orders/${w.id}`)}>
                <CheckCircle2 size={16} /> <span>{w.title.split(' — ')[0]}</span> <small>{w.vessel?.name}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {!items.length && !maint.length && <div className="card"><Empty title="Şu an sana atanmış iş yok" text="Yeni bir iş atandığında burada ve bildirimlerde göreceksin." icon={<CheckCircle2 />} /></div>}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.to === 'IN_PROGRESS' ? 'İşe başla' : 'İşi bitir ve kontrole gönder'}
        footer={<><button className="btn" onClick={() => setConfirm(null)}>Vazgeç</button><button className="btn btn-primary" disabled={move.isPending} onClick={() => move.mutate(undefined)}>{confirm?.to === 'IN_PROGRESS' ? 'Başla' : 'Gönder'}</button></>}
      >
        {confirm && (
          <div className="stack">
            <div><b>{confirm.wo.title.split(' — ')[0]}</b><div className="small muted">{confirm.wo.vessel?.name}</div></div>
            {confirm.to === 'TECHNICAL_REVIEW' && <div className="notice">Bitiş saati kaydedilir ve yöneticiye kontrol bildirimi gider. Göndermeden önce fotoğrafları eklemeyi unutma.</div>}
            <textarea className="textarea" placeholder="Not (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
