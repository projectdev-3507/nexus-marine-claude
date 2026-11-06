import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, FileText, CalendarRange, Check, X } from 'lucide-react';
import { useApi, useAction } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, DataTable, Empty, Field, KV, Loading, Modal, PageHeader, Progress, StatusBadge, Tabs } from '../components/ui';
import { Gallery, Uploader } from '../components/media';
import { usePeople, useVesselOptions, useMaterialOptions } from '../lib/lookups';
import { addDays, fmtDate, fmtMoney, fmtNum, toInputDate } from '../lib/format';
import { CR_STATUS_LABELS, CR_TONE, PHASE_STATUS_LABELS, PHASE_TONE, PROJECT_STATUS_LABELS, PROJECT_TONE, REPORT_STATUS_LABELS, REPORT_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

export function ProjectsList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [form, setForm] = useState(false);
  const { data } = useApi<any>('/projects', { pageSize: 100 });
  if (!data) return <Loading />;
  return (
    <div>
      <PageHeader title="Restorasyon Projeleri" sub="Uzun süreli gövde, teak ve yüzey restorasyon projeleri" actions={can('projects.manage') && <button className="btn btn-primary" onClick={() => setForm(true)}><Plus /> Yeni Proje</button>} />
      <div className="grid g-2">
        {data.items.length === 0 && <Card><Empty title="Proje yok" /></Card>}
        {data.items.map((p: any) => (
          <div key={p.id} className="card card-pad stack" style={{ cursor: 'pointer', gap: 12 }} onClick={() => nav(`/projects/${p.id}`)}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{p.name}</h3>
                <div className="small muted">{p.vessel.name} · Sorumlu: {p.manager?.name ?? '—'}</div>
              </div>
              <StatusBadge map={PROJECT_TONE} labels={PROJECT_STATUS_LABELS} value={p.status} />
            </div>
            <div className="row"><div style={{ flex: 1 }}><Progress value={p.progress} /></div><b className="mono">%{p.progress}</b></div>
            <div className="row-wrap small muted" style={{ gap: 14 }}>
              <span><CalendarRange size={13} style={{ verticalAlign: -2 }} /> {fmtDate(p.startDate)} – {fmtDate(p.endDate)}</span>
              <span>{p.phaseCount} aşama</span>
              {p._count.changeRequests > 0 && <Badge tone="warn">{p._count.changeRequests} ek iş talebi</Badge>}
              {p.budget != null && <span>Bütçe {fmtMoney(p.budget, p.currency)}</span>}
            </div>
          </div>
        ))}
      </div>
      {form && <ProjectForm onClose={() => setForm(false)} onSaved={(p) => nav(`/projects/${p.id}`)} />}
    </div>
  );
}

function ProjectForm({ initial, onClose, onSaved }: { initial?: any; onClose: () => void; onSaved?: (p: any) => void }) {
  const { can } = useAuth();
  const vessels = useVesselOptions();
  const people = usePeople();
  const managers = people.filter((p) => p.roles.some((r) => ['OPERATIONS_MANAGER', 'SUPER_ADMIN', 'TECHNICIAN'].includes(r)));
  const [f, setF] = useState<any>({ name: '', vesselId: '', managerId: '', description: '', startDate: '', endDate: '', status: 'PLANNING', budget: '', currency: 'EUR', template: 'HULL_RESTORATION', ...initial, ...(initial ? { startDate: toInputDate(initial.startDate), endDate: toInputDate(initial.endDate), managerId: initial.managerId ?? '' } : {}) });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = useAction(() => {
    const body = { name: f.name, vesselId: f.vesselId, managerId: f.managerId || null, description: f.description || null, startDate: f.startDate || null, endDate: f.endDate || null, status: f.status, budget: f.budget === '' ? null : f.budget, currency: f.currency, template: initial ? undefined : f.template };
    return initial ? api(`/projects/${initial.id}`, { method: 'PUT', body }) : api('/projects', { body });
  }, { success: 'Proje kaydedildi', onSuccess: (p) => { onClose(); onSaved?.(p); } });
  return (
    <Modal open onClose={onClose} title={initial ? 'Projeyi düzenle' : 'Yeni restorasyon projesi'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.name || !f.vesselId} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Proje adı" full><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={set('vesselId')} disabled={!!initial}><option value="">—</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Proje sorumlusu"><select className="select" value={f.managerId} onChange={set('managerId')}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Başlangıç"><input className="input" type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="Planlanan bitiş"><input className="input" type="date" value={f.endDate} onChange={set('endDate')} /></Field>
        <Field label="Durum"><select className="select" value={f.status} onChange={set('status')}>{Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {can('finance.manage') && <Field label="Proje bütçesi"><div className="row"><input className="input" type="number" value={f.budget ?? ''} onChange={set('budget')} /><select className="select" style={{ width: 90 }} value={f.currency} onChange={set('currency')}>{['EUR', 'USD', 'TRY', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select></div></Field>}
        {!initial && <Field label="Aşama şablonu" full><select className="select" value={f.template} onChange={set('template')}><option value="HULL_RESTORATION">Gövde restorasyonu (10 standart aşama)</option><option value="NONE">Boş proje</option></select></Field>}
        <Field label="Açıklama" full><textarea className="textarea" value={f.description ?? ''} onChange={set('description')} /></Field>
      </div>
    </Modal>
  );
}

type TabKey = 'plan' | 'phases' | 'changes' | 'work' | 'materials' | 'finance' | 'docs' | 'photos';

export function ProjectDetail() {
  const { id } = useParams();
  const { can, staff } = useAuth();
  const nav = useNavigate();
  const { data: p } = useApi<any>(`/projects/${id}`);
  const [tab, setTab] = useState<TabKey>('plan');
  const [edit, setEdit] = useState(false);
  const [cr, setCr] = useState(false);
  if (!p) return <Loading />;
  const manage = can('projects.manage');
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'plan', label: 'Zaman Çizelgesi' },
    { key: 'phases', label: 'Aşamalar ve Görevler', count: p.phases.length },
    { key: 'changes', label: 'Ek İşler', count: p.changeRequests.filter((c: any) => c.status === 'PENDING').length || undefined },
    ...(staff ? [{ key: 'work' as TabKey, label: 'İş Emirleri', count: p.workOrders.length }, { key: 'materials' as TabKey, label: 'Malzemeler' }] : []),
    ...(p.finance ? [{ key: 'finance' as TabKey, label: 'Bütçe ve Tahsilat' }] : []),
    { key: 'docs', label: 'Teknik Belgeler' },
    { key: 'photos', label: 'Fotoğraf Galerisi', count: p.attachments.length },
  ];
  return (
    <div>
      <PageHeader
        crumbs={staff ? <><Link to="/projects">Restorasyon Projeleri</Link> / {p.name}</> : undefined}
        title={p.name}
        sub={<span className="row-wrap" style={{ gap: 8 }}><StatusBadge map={PROJECT_TONE} labels={PROJECT_STATUS_LABELS} value={p.status} /><Link to={`/vessels/${p.vessel.id}`}>{p.vessel.name}</Link><span>{p.vessel.marina}</span></span>}
        actions={
          <>
            <button className="btn" onClick={() => setCr(true)}><Plus /> Ek iş talebi</button>
            {can('reports.manage') && <button className="btn" onClick={() => nav(`/reports?new=1&type=HULL_RESTORATION&vesselId=${p.vessel.id}&projectId=${p.id}`)}><FileText /> Rapor oluştur</button>}
            {manage && <button className="btn btn-primary" onClick={() => setEdit(true)}><Pencil /> Düzenle</button>}
          </>
        }
      />
      <div className="grid g-4 mb-2">
        <div className="card card-pad"><div className="xs muted">İlerleme</div><div className="row mt-1"><div className="kpi-value" style={{ fontSize: 26 }}>%{p.progress}</div></div><div className="mt-1"><Progress value={p.progress} /></div></div>
        <div className="card card-pad"><div className="xs muted">Zaman çizelgesi</div><div className="strong mt-1">{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</div>{p.impact.extraDays > 0 && <div className="xs" style={{ color: 'var(--warn)' }}>Ek işlerle tahmini bitiş: {fmtDate(p.impact.projectedEnd)} (+{p.impact.extraDays} gün)</div>}</div>
        <div className="card card-pad"><div className="xs muted">Proje sorumlusu</div><div className="strong mt-1">{p.manager?.name ?? '—'}</div><div className="xs muted">{p.phases.filter((x: any) => x.status === 'DONE').length}/{p.phases.length} aşama tamamlandı</div></div>
        {p.finance ? (
          <div className="card card-pad"><div className="xs muted">Kalan bakiye</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{fmtMoney(p.finance.balance, p.currency)}</div><div className="xs muted">Sözleşme {fmtMoney(p.finance.contract, p.currency)} · Tahsilat {fmtMoney(p.finance.paid, p.currency)}</div></div>
        ) : (
          <div className="card card-pad"><div className="xs muted">Ek iş talepleri</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{p.changeRequests.length}</div></div>
        )}
      </div>
      {p.description && <p className="muted mb-2">{p.description}</p>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'plan' && <Gantt project={p} />}
      {tab === 'phases' && <Phases project={p} manage={manage} />}
      {tab === 'changes' && <ChangeRequests project={p} manage={manage} finance={!!p.finance} />}
      {tab === 'work' && (
        <Card pad={false} action={can('workorders.manage') && <button className="btn btn-sm" onClick={() => nav(`/work-orders?new=1&vesselId=${p.vessel.id}`)}><Plus /> İş emri</button>} title="Projeye bağlı iş emirleri">
          <DataTable rows={p.workOrders} onRowClick={(w: any) => nav(`/work-orders/${w.id}`)} columns={[
            { key: 'n', label: 'No', render: (w: any) => <span className="mono strong">{w.number}</span> },
            { key: 't', label: 'İş', render: (w: any) => w.title },
            { key: 'tech', label: 'Teknisyen', render: (w: any) => w.technician?.name ?? '—' },
            { key: 's', label: 'Durum', render: (w: any) => <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /> },
          ]} />
        </Card>
      )}
      {tab === 'materials' && <ProjectMaterials project={p} manage={manage} />}
      {tab === 'finance' && p.finance && <ProjectFinance project={p} />}
      {tab === 'docs' && (
        <Card title="Teknik belgeler ve raporlar" pad={false}>
          {p.reports.length === 0 && <Empty />}
          {p.reports.map((r: any) => (
            <div key={r.id} className="list-item clickable" onClick={() => nav(`/reports/${r.id}`)}>
              <FileText size={18} color="var(--marine)" />
              <div className="grow"><div className="strong">{r.title}</div><div className="xs muted">{r.number}</div></div>
              <StatusBadge map={REPORT_TONE} labels={REPORT_STATUS_LABELS} value={r.status} />
            </div>
          ))}
        </Card>
      )}
      {tab === 'photos' && (
        <Card title="Fotoğraf galerisi">
          {manage && <div className="mb-2"><Uploader entityType="PROJECT" entityId={p.id} tagOptions /></div>}
          <Gallery items={p.attachments} editable={manage} />
        </Card>
      )}
      {edit && <ProjectForm initial={p} onClose={() => setEdit(false)} />}
      {cr && <ChangeRequestForm projectId={p.id} manage={manage} finance={can('finance.manage')} onClose={() => setCr(false)} />}
    </div>
  );
}

function Gantt({ project }: { project: any }) {
  const phases = project.phases;
  const dates = phases.flatMap((ph: any) => [ph.startDate, ph.endDate]).filter(Boolean).map((d: string) => new Date(d).getTime());
  if (project.startDate) dates.push(new Date(project.startDate).getTime());
  if (project.impact?.projectedEnd || project.endDate) dates.push(new Date(project.impact?.projectedEnd ?? project.endDate).getTime());
  if (!dates.length) return <Card><Empty title="Tarih planı yok" text="Aşamalara başlangıç ve bitiş tarihi ekleyin." /></Card>;
  const min = Math.min(...dates) - 2 * 864e5;
  const max = Math.max(...dates) + 3 * 864e5;
  const pct = (t: number) => ((t - min) / (max - min)) * 100;
  const weeks: Date[] = [];
  for (let d = new Date(min); d.getTime() <= max; d = addDays(d, 7)) weeks.push(d);
  const today = Date.now();
  return (
    <Card pad={false}>
      <div className="gantt">
        <div className="gantt-inner">
          <div className="gantt-scale">
            <div className="g-label xs muted strong" style={{ padding: '8px 14px' }}>AŞAMA</div>
            <div className="ticks">{weeks.map((w) => <div key={w.toISOString()} className="tick" style={{ left: `${pct(w.getTime())}%` }}>{w.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</div>)}</div>
          </div>
          {phases.map((ph: any) => {
            const s = ph.startDate ? new Date(ph.startDate).getTime() : null;
            const e = ph.endDate ? new Date(ph.endDate).getTime() : s;
            const tasksDone = ph.tasks.filter((t: any) => t.done).length;
            return (
              <div key={ph.id} className="gantt-row">
                <div className="g-label">{ph.order}. {ph.name}<span>{ph.responsible?.name ?? '—'} · {tasksDone}/{ph.tasks.length} görev</span></div>
                <div className="gantt-track">
                  {today >= min && today <= max && <div className="gantt-today" style={{ left: `${pct(today)}%` }} />}
                  {s && e && <div className={`gantt-bar ${ph.status}`} style={{ left: `${pct(s)}%`, width: `${Math.max(2, pct(e + 864e5) - pct(s))}%` }} title={`${fmtDate(ph.startDate)} – ${fmtDate(ph.endDate)}`}>{PHASE_STATUS_LABELS[ph.status]}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="legend" style={{ padding: '10px 16px' }}>
        <span><i style={{ background: '#bfe6cd' }} />Tamamlandı</span><span><i style={{ background: '#f9d7a6' }} />Devam ediyor</span><span><i style={{ background: '#c7d9ec' }} />Başlamadı</span><span><i style={{ background: 'var(--danger)' }} />Bugün</span>
      </div>
    </Card>
  );
}

function Phases({ project, manage }: { project: any; manage: boolean }) {
  const people = usePeople();
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [editPhase, setEditPhase] = useState<any | null>(null);
  const toggle = useAction((t: any) => api(`/projects/${project.id}/tasks/${t.id}`, { method: 'PATCH', body: { done: !t.done } }));
  const addTask = useAction((phaseId: string) => api(`/projects/${project.id}/phases/${phaseId}/tasks`, { body: { title: newTask[phaseId] } }), { onSuccess: () => setNewTask({}) });
  const delTask = useAction((tid: string) => api(`/projects/${project.id}/tasks/${tid}`, { method: 'DELETE' }));
  const savePhase = useAction(() => {
    const { id: pid, tasks, responsible, projectId, ...body } = editPhase;
    const payload = { ...body, responsibleId: body.responsibleId || null, startDate: body.startDate || null, endDate: body.endDate || null };
    return pid ? api(`/projects/${project.id}/phases/${pid}`, { method: 'PUT', body: payload }) : api(`/projects/${project.id}/phases`, { body: payload });
  }, { success: 'Aşama kaydedildi', onSuccess: () => setEditPhase(null) });
  const delPhase = useAction((pid: string) => api(`/projects/${project.id}/phases/${pid}`, { method: 'DELETE' }), { success: 'Aşama silindi' });
  return (
    <div className="stack">
      {manage && <div><button className="btn" onClick={() => setEditPhase({ name: '', status: 'NOT_STARTED', responsibleId: '', startDate: '', endDate: '', materials: '', notes: '' })}><Plus /> Aşama ekle</button></div>}
      {project.phases.map((ph: any) => (
        <div key={ph.id} className="card">
          <div className="card-head">
            <div className="row" style={{ minWidth: 0 }}>
              <span className="num" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--sky)', color: 'var(--marine)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12.5, flex: 'none' }}>{ph.order}</span>
              <div style={{ minWidth: 0 }}><h3>{ph.name}</h3><div className="xs muted">{ph.responsible?.name ?? 'Sorumlu atanmadı'} · {fmtDate(ph.startDate)} – {fmtDate(ph.endDate)}</div></div>
            </div>
            <div className="row">
              <StatusBadge map={PHASE_TONE} labels={PHASE_STATUS_LABELS} value={ph.status} />
              {manage && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditPhase({ ...ph, startDate: toInputDate(ph.startDate), endDate: toInputDate(ph.endDate), responsibleId: ph.responsibleId ?? '' })}><Pencil /></button>}
              {manage && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => confirm('Aşama silinsin mi?') && delPhase.mutate(ph.id)}><Trash2 /></button>}
            </div>
          </div>
          <div className="card-body">
            {ph.materials && <div className="small mb-2"><span className="muted">Malzeme:</span> {ph.materials}</div>}
            {ph.notes && <div className="small mb-2 muted">{ph.notes}</div>}
            <div className="stack" style={{ gap: 4 }}>
              {ph.tasks.map((t: any) => (
                <div key={t.id} className="row">
                  <label className="checkbox" style={{ flex: 1 }}><input type="checkbox" checked={t.done} disabled={!manage} onChange={() => toggle.mutate(t)} /><span style={{ textDecoration: t.done ? 'line-through' : undefined, color: t.done ? 'var(--muted)' : undefined }}>{t.title}</span>{t.weight !== 1 && <span className="xs muted">×{t.weight}</span>}</label>
                  {manage && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => delTask.mutate(t.id)}><X /></button>}
                </div>
              ))}
              {manage && (
                <div className="row mt-1">
                  <input className="input sm" placeholder="Görev ekle" value={newTask[ph.id] ?? ''} onChange={(e) => setNewTask({ [ph.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && newTask[ph.id] && addTask.mutate(ph.id)} />
                  <button className="btn btn-sm" disabled={!newTask[ph.id]} onClick={() => addTask.mutate(ph.id)}><Plus /></button>
                </div>
              )}
            </div>
            {manage && <div className="mt-2"><Uploader entityType="PHASE" entityId={ph.id} compact /></div>}
            {project.attachments.filter((a: any) => a.entityId === ph.id).length > 0 && <div className="mt-2"><Gallery items={project.attachments.filter((a: any) => a.entityId === ph.id)} editable={manage} /></div>}
          </div>
        </div>
      ))}
      {editPhase && (
        <Modal open onClose={() => setEditPhase(null)} title={editPhase.id ? 'Aşamayı düzenle' : 'Yeni aşama'} footer={<><button className="btn" onClick={() => setEditPhase(null)}>Vazgeç</button><button className="btn btn-primary" disabled={!editPhase.name} onClick={() => savePhase.mutate(undefined)}>Kaydet</button></>}>
          <div className="form-grid">
            <Field label="Aşama adı" full><input className="input" value={editPhase.name} onChange={(e) => setEditPhase({ ...editPhase, name: e.target.value })} /></Field>
            <Field label="Sorumlu"><select className="select" value={editPhase.responsibleId} onChange={(e) => setEditPhase({ ...editPhase, responsibleId: e.target.value })}><option value="">—</option>{people.filter((x) => !x.roles.every((r) => ['OWNER', 'CAPTAIN'].includes(r))).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Durum"><select className="select" value={editPhase.status} onChange={(e) => setEditPhase({ ...editPhase, status: e.target.value })}>{Object.entries(PHASE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Başlangıç"><input className="input" type="date" value={editPhase.startDate} onChange={(e) => setEditPhase({ ...editPhase, startDate: e.target.value })} /></Field>
            <Field label="Bitiş"><input className="input" type="date" value={editPhase.endDate} onChange={(e) => setEditPhase({ ...editPhase, endDate: e.target.value })} /></Field>
            <Field label="Malzemeler" full><input className="input" value={editPhase.materials ?? ''} onChange={(e) => setEditPhase({ ...editPhase, materials: e.target.value })} /></Field>
            <Field label="Notlar" full><textarea className="textarea" value={editPhase.notes ?? ''} onChange={(e) => setEditPhase({ ...editPhase, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChangeRequests({ project, manage, finance }: { project: any; manage: boolean; finance: boolean }) {
  const decide = useAction(({ cid, status }: { cid: string; status: string }) => api(`/projects/${project.id}/change-requests/${cid}`, { method: 'PUT', body: { status } }), { success: 'Karar kaydedildi' });
  const approved = project.changeRequests.filter((c: any) => c.status === 'APPROVED');
  return (
    <div className="stack">
      <div className="grid g-3">
        <div className="card card-pad"><div className="xs muted">Onaylı ek iş</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{approved.length}</div></div>
        <div className="card card-pad"><div className="xs muted">Süreye etkisi</div><div className="kpi-value mt-1" style={{ fontSize: 24, color: 'var(--warn)' }}>+{project.impact.extraDays} gün</div></div>
        {finance && <div className="card card-pad"><div className="xs muted">Maliyete etkisi</div><div className="kpi-value mt-1" style={{ fontSize: 24 }}>{fmtMoney(project.impact.extraCost, project.currency)}</div></div>}
      </div>
      <Card pad={false} title="Ek iş talepleri (kaptan / müşteri)">
        <DataTable rows={project.changeRequests} columns={[
          { key: 't', label: 'Talep', render: (c: any) => <div><div className="cell-title">{c.title}</div><div className="cell-sub">{c.description}</div></div> },
          { key: 'r', label: 'Talep eden', render: (c: any) => <div>{c.requestedBy}<div className="cell-sub">{fmtDate(c.createdAt)}</div></div> },
          { key: 'd', label: 'Ek süre', align: 'right', render: (c: any) => `${c.extraDays} gün` },
          ...(finance ? [{ key: 'c', label: 'Ek maliyet', align: 'right' as const, render: (c: any) => <span className="mono">{fmtMoney(c.extraCost, project.currency)}</span> }] : []),
          { key: 's', label: 'Durum', render: (c: any) => <StatusBadge map={CR_TONE} labels={CR_STATUS_LABELS} value={c.status} /> },
          ...(manage ? [{ key: 'a', label: '', align: 'right' as const, render: (c: any) => c.status === 'PENDING' && <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><button className="btn btn-sm btn-success" onClick={() => decide.mutate({ cid: c.id, status: 'APPROVED' })}><Check /> Onayla</button><button className="btn btn-sm" onClick={() => decide.mutate({ cid: c.id, status: 'REJECTED' })}><X /> Reddet</button></div> }] : []),
        ]} empty={<Empty title="Ek iş talebi yok" />} />
      </Card>
    </div>
  );
}

function ChangeRequestForm({ projectId, manage, finance, onClose }: { projectId: string; manage: boolean; finance: boolean; onClose: () => void }) {
  const [f, setF] = useState({ title: '', description: '', extraDays: 0, extraCost: 0, requestedBy: '' });
  const save = useAction(() => api(`/projects/${projectId}/change-requests`, { body: f }), { success: 'Ek iş talebi kaydedildi', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title="Ek iş talebi" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={f.title.length < 2} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Talep" full><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Açıklama" full><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {manage && <Field label="Talep eden"><input className="input" value={f.requestedBy} onChange={(e) => setF({ ...f, requestedBy: e.target.value })} placeholder="Kaptan adı" /></Field>}
        {manage && <Field label="Ek süre (gün)"><input className="input" type="number" value={f.extraDays} onChange={(e) => setF({ ...f, extraDays: Number(e.target.value) })} /></Field>}
        {finance && <Field label="Ek maliyet"><input className="input" type="number" value={f.extraCost} onChange={(e) => setF({ ...f, extraCost: Number(e.target.value) })} /></Field>}
      </div>
    </Modal>
  );
}

function ProjectMaterials({ project, manage }: { project: any; manage: boolean }) {
  const materials = useMaterialOptions();
  const [m, setM] = useState({ materialId: '', quantity: '' });
  const add = useAction(() => api(`/projects/${project.id}/materials`, { body: { materialId: m.materialId, quantity: Number(m.quantity) } }), { success: 'Malzeme eklendi', onSuccess: () => setM({ materialId: '', quantity: '' }) });
  return (
    <Card pad={false} title="Kullanılan malzemeler">
      {manage && (
        <div className="toolbar">
          <select className="select sm" style={{ flex: 2 }} value={m.materialId} onChange={(e) => setM({ ...m, materialId: e.target.value })}><option value="">Malzeme seçin</option>{materials.map((x) => <option key={x.id} value={x.id}>{x.name} ({fmtNum(x.stock)} {x.unit})</option>)}</select>
          <input className="input sm" style={{ width: 110 }} type="number" placeholder="Miktar" value={m.quantity} onChange={(e) => setM({ ...m, quantity: e.target.value })} />
          <button className="btn btn-sm btn-primary" disabled={!m.materialId || !m.quantity} onClick={() => add.mutate(undefined)}><Plus /> Ekle</button>
        </div>
      )}
      <DataTable rows={project.materials} columns={[
        { key: 'd', label: 'Tarih', render: (u: any) => fmtDate(u.usedAt) },
        { key: 'm', label: 'Malzeme', render: (u: any) => u.material.name },
        { key: 'q', label: 'Miktar', align: 'right', render: (u: any) => `${fmtNum(u.quantity, 2)} ${u.material.unit}` },
        ...(project.finance ? [{ key: 'c', label: 'Tutar', align: 'right' as const, render: (u: any) => <span className="mono">{fmtMoney(u.quantity * u.unitCost)}</span> }] : []),
      ]} />
    </Card>
  );
}

function ProjectFinance({ project }: { project: any }) {
  const { can } = useAuth();
  const [inst, setInst] = useState({ dueDate: '', amount: '', note: '' });
  const [pay, setPay] = useState({ amount: '', method: 'Havale', note: '' });
  const vessel = project.vessel;
  const addInst = useAction(() => api(`/projects/${project.id}/installments`, { body: inst }), { success: 'Ödeme planına eklendi', onSuccess: () => setInst({ dueDate: '', amount: '', note: '' }) });
  const togglePaid = useAction((i: any) => api(`/projects/${project.id}/installments/${i.id}`, { method: 'PATCH', body: { paid: !i.paid } }));
  const addPay = useAction(() => api('/payments', { body: { customerId: vessel.ownerId, projectId: project.id, amount: Number(pay.amount), currency: project.currency, method: pay.method, note: pay.note } }), { success: 'Tahsilat kaydedildi', onSuccess: () => setPay({ amount: '', method: 'Havale', note: '' }) });
  const f = project.finance;
  return (
    <div className="stack">
      <div className="grid g-4">
        <div className="card card-pad"><div className="xs muted">Proje bedeli</div><div className="kpi-value mt-1" style={{ fontSize: 22 }}>{fmtMoney(project.budget, project.currency)}</div></div>
        <div className="card card-pad"><div className="xs muted">Onaylı ek işler</div><div className="kpi-value mt-1" style={{ fontSize: 22 }}>{fmtMoney(project.impact.extraCost, project.currency)}</div></div>
        <div className="card card-pad"><div className="xs muted">Alınan ödemeler</div><div className="kpi-value mt-1" style={{ fontSize: 22, color: 'var(--ok)' }}>{fmtMoney(f.paid, project.currency)}</div></div>
        <div className="card card-pad"><div className="xs muted">Kalan bakiye</div><div className="kpi-value mt-1" style={{ fontSize: 22, color: f.balance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoney(f.balance, project.currency)}</div></div>
      </div>
      <div className="grid g-2">
        <Card title="Ödeme planı" pad={false}>
          <DataTable rows={project.installments} columns={[
            { key: 'd', label: 'Vade', render: (i: any) => <b>{fmtDate(i.dueDate)}</b> },
            { key: 'n', label: 'Açıklama', render: (i: any) => i.note ?? '—' },
            { key: 'a', label: 'Tutar', align: 'right', render: (i: any) => <span className="mono">{fmtMoney(i.amount, project.currency)}</span> },
            { key: 's', label: 'Durum', render: (i: any) => <button className="btn btn-sm btn-ghost" disabled={!can('finance.manage')} onClick={() => togglePaid.mutate(i)}>{i.paid ? <Badge tone="ok">Ödendi</Badge> : new Date(i.dueDate) < new Date() ? <Badge tone="danger">Gecikmiş</Badge> : <Badge tone="warn">Bekliyor</Badge>}</button> },
          ]} />
          {can('finance.manage') && (
            <div className="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
              <input className="input sm" type="date" style={{ width: 150 }} value={inst.dueDate} onChange={(e) => setInst({ ...inst, dueDate: e.target.value })} />
              <input className="input sm" type="number" placeholder="Tutar" style={{ width: 110 }} value={inst.amount} onChange={(e) => setInst({ ...inst, amount: e.target.value })} />
              <input className="input sm" placeholder="Not" style={{ flex: 1 }} value={inst.note} onChange={(e) => setInst({ ...inst, note: e.target.value })} />
              <button className="btn btn-sm" disabled={!inst.dueDate || !inst.amount} onClick={() => addInst.mutate(undefined)}><Plus /></button>
            </div>
          )}
        </Card>
        <Card title="Tahsilatlar" pad={false}>
          <DataTable rows={project.payments} columns={[
            { key: 'd', label: 'Tarih', render: (x: any) => fmtDate(x.date) },
            { key: 'm', label: 'Yöntem', render: (x: any) => <div>{x.method ?? '—'}<div className="cell-sub">{x.note}</div></div> },
            { key: 'a', label: 'Tutar', align: 'right', render: (x: any) => <b className="mono">{fmtMoney(x.amount, x.currency)}</b> },
          ]} />
          {can('finance.manage') && vessel.ownerId && (
            <div className="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
              <input className="input sm" type="number" placeholder="Tutar" style={{ width: 110 }} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <select className="select sm" style={{ width: 120 }} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{['Havale', 'Nakit', 'Kredi kartı', 'Çek'].map((x) => <option key={x}>{x}</option>)}</select>
              <input className="input sm" placeholder="Not" style={{ flex: 1 }} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
              <button className="btn btn-sm btn-primary" disabled={!pay.amount} onClick={() => addPay.mutate(undefined)}><Plus /> Tahsilat</button>
            </div>
          )}
        </Card>
      </div>
      <KV items={[['Malzeme maliyeti (dahili)', fmtMoney(f.materialCost)], ['Brüt marj (tahmini)', fmtMoney(f.contract - f.materialCost, project.currency)], ['Tahsilat oranı', f.contract ? `%${Math.round((f.paid / f.contract) * 100)}` : '—']]} />
    </div>
  );
}
