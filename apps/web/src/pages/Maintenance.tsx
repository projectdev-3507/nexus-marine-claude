import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, Gauge, CalendarClock, Trash2, Pencil } from 'lucide-react';
import { MAINTENANCE_STATUSES, PRIORITIES } from '@nexus/shared';
import { maintItems, useMaintCats, type MaintCat } from '../lib/maintCats';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, StatusBadge, type Column } from '../components/ui';
import { usePeople, useVesselOptions } from '../lib/lookups';
import { fmtDate, fmtNum, toInputDate } from '../lib/format';
import '../styles/doc.css';
import { CATEGORY_LABELS, CATEGORY_SHORT, MAINTENANCE_STATUS_LABELS, MAINT_TONE, PRIORITY_LABELS, PRIORITY_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

export default function Maintenance() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const ls = useListState({ sort: 'plannedDate', order: 'asc' });
  const [cat, setCat] = useState<string>('ALL');
  const [status, setStatus] = useState('');
  const editId = sp.get('id');
  const creating = sp.get('new') === '1';
  const { data, isLoading } = useApi<any>('/maintenance', { ...ls.query, category: cat === 'ALL' ? undefined : cat, status: status || undefined });
  const close = () => setSp({}, { replace: true });
  const cats = useMaintCats();
  const [catModal, setCatModal] = useState<MaintCat | 'new' | null>(null);
  const manageCats = can('maintenance.manage');

  const cols: Column<any>[] = [
    { key: 'plannedDate', label: 'Planlanan', sortable: true, render: (m) => <div><b>{fmtDate(m.plannedDate)}</b>{m.dueEngineHours != null && <div className="cell-sub row" style={{ gap: 4 }}><Gauge size={12} /> {fmtNum(m.engine?.hours)} / {fmtNum(m.dueEngineHours)} s</div>}</div> },
    { key: 'title', label: 'Bakım', sortable: true, render: (m) => <div><div className="cell-title">{m.title}</div><div className="cell-sub">{CATEGORY_SHORT[m.category]}{m.intervalDays ? ` · ${m.intervalDays} günde bir` : ''}{m.intervalEngineHours ? ` · ${m.intervalEngineHours} saatte bir` : ''}</div></div> },
    { key: 'vessel', label: 'Tekne', render: (m) => <div><div>{m.vessel.name}</div><div className="cell-sub">{m.vessel.marina}</div></div> },
    { key: 'tech', label: 'Sorumlu', render: (m) => m.technician?.name ?? <span className="muted">—</span> },
    { key: 'priority', label: 'Öncelik', sortable: true, render: (m) => <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={m.priority} /> },
    { key: 'status', label: 'Durum', sortable: true, render: (m) => <div className="row-wrap" style={{ gap: 4 }}><StatusBadge map={MAINT_TONE} labels={MAINTENANCE_STATUS_LABELS} value={m.status} />{m.workOrder && <Badge tone="info" plain>{m.workOrder.number}</Badge>}</div> },
  ];

  return (
    <div>
      <PageHeader title="Bakım Yönetimi" sub="Tarih ve motor çalışma saati bazlı periyodik bakım planlama" actions={can('maintenance.manage') && <><button className="btn" onClick={() => nav('/calendar')}><CalendarClock /> Takvimden planla</button><button className="btn btn-primary" onClick={() => setSp({ new: '1' })}><Plus /> Bakım Planla</button></>} />
      {/* Başlıklar: üzerine gelince kalem (düzenle), en sonda + (yeni başlık) */}
      <div className="tabs maint-tabs" role="tablist">
        <button role="tab" className={`tab${cat === 'ALL' ? ' active' : ''}`} onClick={() => setCat('ALL')}>Tümü</button>
        {cats.active.map((c) => (
          <button key={c.key} role="tab" className={`tab${cat === c.key ? ' active' : ''}`} onClick={() => setCat(c.key)}>
            {c.label}
            {manageCats && <span className="tab-edit" role="button" title="Başlığı düzenle" onClick={(e) => { e.stopPropagation(); setCatModal(c); }}><Pencil /></span>}
          </button>
        ))}
        {manageCats && <button className="tab tab-add" title="Yeni başlık" onClick={() => setCatModal('new')}><Plus /></button>}
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Bakım veya tekne ara..." />
          <div className="pill-filter">
            {[['', 'Tümü'], ['PLANNED', 'Planlı'], ['OVERDUE', 'Gecikmiş'], ['IN_PROGRESS', 'Devam eden'], ['COMPLETED', 'Tamamlanan']].map(([k, l]) => (
              <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>
            ))}
          </div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} sort={ls.sort} onSort={ls.onSort} onRowClick={(m) => setSp({ id: m.id })} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {catModal && <MaintCategoryModal cat={catModal === 'new' ? null : catModal} onClose={() => setCatModal(null)} onSaved={(c) => setCat(c?.key ?? 'ALL')} />}
      {(creating || editId) && <MaintenanceForm id={editId} defaults={{ vesselId: sp.get('vesselId') ?? '', plannedDate: sp.get('date') ?? '' }} onClose={close} />}
    </div>
  );
}

export function MaintenanceForm({ id, defaults = {}, onClose }: { id?: string | null; defaults?: Record<string, string>; onClose: () => void }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const editable = can('maintenance.manage');
  const vessels = useVesselOptions();
  const techs = usePeople('TECHNICIAN');
  const existing = useApi<any>(id ? `/maintenance/${id}` : null).data;
  const [f, setF] = useState<any>({ title: '', category: 'MECHANICAL', subType: '', vesselId: '', description: '', plannedDate: '', startDate: '', endDate: '', technicianId: '', priority: 'MEDIUM', estimatedHours: '', actualHours: '', status: 'PLANNED', technicalNotes: '', intervalDays: '', engineId: '', intervalEngineHours: '', dueEngineHours: '', haulOutDate: '', launchDate: '', plannedMaterials: [], ...defaults });
  useEffect(() => {
    if (existing) setF({ ...existing, plannedDate: toInputDate(existing.plannedDate), startDate: toInputDate(existing.startDate), endDate: toInputDate(existing.endDate), haulOutDate: toInputDate(existing.haulOutDate), launchDate: toInputDate(existing.launchDate), technicianId: existing.technicianId ?? '', engineId: existing.engineId ?? '', plannedMaterials: existing.plannedMaterials ?? [] });
  }, [existing]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const vessel = vessels.find((v) => v.id === f.vesselId);
  const engines = vessel?.engines ?? [];
  const nn = (x: any) => (x === '' || x == null ? null : x);
  const save = useAction(
    () => {
      const body = { title: f.title, category: f.category, subType: nn(f.subType), vesselId: f.vesselId, description: nn(f.description), plannedDate: f.plannedDate, startDate: nn(f.startDate), endDate: nn(f.endDate), technicianId: nn(f.technicianId), priority: f.priority, estimatedHours: nn(f.estimatedHours), actualHours: nn(f.actualHours), status: f.status, technicalNotes: nn(f.technicalNotes), intervalDays: nn(f.intervalDays), engineId: nn(f.engineId), intervalEngineHours: nn(f.intervalEngineHours), dueEngineHours: nn(f.dueEngineHours), haulOutDate: nn(f.haulOutDate), launchDate: nn(f.launchDate), plannedMaterials: (f.plannedMaterials ?? []).filter((m: any) => m.name) };
      return id ? api(`/maintenance/${id}`, { method: 'PUT', body }) : api('/maintenance', { body });
    },
    { success: 'Bakım planı kaydedildi', onSuccess: onClose },
  );
  const toWO = useAction(() => api(`/maintenance/${id}/work-order`, { body: {} }), { success: 'İş emri oluşturuldu', onSuccess: (w) => nav(`/work-orders/${w.id}`) });
  const del = useAction(() => api(`/maintenance/${id}`, { method: 'DELETE' }), { success: 'Bakım planı silindi', onSuccess: onClose });
  const cats = useMaintCats();
  const items = maintItems(f.category);
  const setMat = (i: number, k: string, v: string) => setF({ ...f, plannedMaterials: f.plannedMaterials.map((m: any, j: number) => (j === i ? { ...m, [k]: v } : m)) });

  return (
    <Modal open onClose={onClose} size="lg" title={id ? f.title || 'Bakım planı' : 'Yeni bakım planı'} footer={
      <>
        {id && editable && <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => confirm('Bakım planı silinsin mi?') && del.mutate(undefined)}><Trash2 /> Sil</button>}
        {id && existing && !existing.workOrder && can('workorders.manage') && <button className="btn" onClick={() => toWO.mutate(undefined)}><ClipboardList /> İş emrine dönüştür</button>}
        {existing?.workOrder && <button className="btn" onClick={() => nav(`/work-orders/${existing.workOrder.id}`)}>İş emri: {existing.workOrder.number} <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={existing.workOrder.status} /></button>}
        <button className="btn" onClick={onClose}>Kapat</button>
        {editable && <button className="btn btn-primary" disabled={!f.title || !f.vesselId || !f.plannedDate} onClick={() => save.mutate(undefined)}>Kaydet</button>}
      </>
    }>
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-grid cols-3">
          <Field label="Kategori *"><select className="select" value={f.category} onChange={set('category')}>{cats.all.filter((c) => c.isActive || c.key === f.category).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
          <Field label="Bakım türü"><select className="select" value={f.subType ?? ''} onChange={(e) => setF({ ...f, subType: e.target.value, title: f.title || e.target.value })}><option value="">— Seçin —</option>{items.map((i) => <option key={i}>{i}</option>)}</select></Field>
          <Field label="Tekne *"><select className="select" value={f.vesselId} onChange={set('vesselId')}><option value="">— Seçin —</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Bakım adı *" full><input className="input" value={f.title} onChange={set('title')} /></Field>
          <Field label="Açıklama" full><textarea className="textarea" value={f.description ?? ''} onChange={set('description')} /></Field>
          <Field label="Planlanan tarih *"><input className="input" type="date" value={f.plannedDate} onChange={set('plannedDate')} /></Field>
          <Field label="Başlangıç"><input className="input" type="date" value={f.startDate ?? ''} onChange={set('startDate')} /></Field>
          <Field label="Bitiş"><input className="input" type="date" value={f.endDate ?? ''} onChange={set('endDate')} /></Field>
          <Field label="Sorumlu teknisyen"><select className="select" value={f.technicianId} onChange={set('technicianId')}><option value="">—</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Öncelik"><select className="select" value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
          <Field label="Durum"><select className="select" value={f.status} onChange={set('status')}>{MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</option>)}</select></Field>
          <Field label="Tahmini işçilik (saat)"><input className="input" type="number" value={f.estimatedHours ?? ''} onChange={set('estimatedHours')} /></Field>
          <Field label="Gerçekleşen işçilik (saat)"><input className="input" type="number" value={f.actualHours ?? ''} onChange={set('actualHours')} /></Field>
          <Field label="Tekrar (gün)" hint="Tarih bazlı hatırlatma"><input className="input" type="number" value={f.intervalDays ?? ''} onChange={set('intervalDays')} placeholder="örn. 180" /></Field>
        </div>
        <div className="divider" />
        <h3 className="mb-2 row" style={{ gap: 8 }}><Gauge size={16} /> Motor çalışma saati bazlı hatırlatma</h3>
        <div className="form-grid cols-3">
          <Field label="Motor"><select className="select" value={f.engineId} onChange={set('engineId')}><option value="">— Kullanılmıyor —</option>{engines.map((e) => <option key={e.id} value={e.id}>{e.position} ({fmtNum(e.hours)} s)</option>)}</select></Field>
          <Field label="Aralık (saat)"><input className="input" type="number" value={f.intervalEngineHours ?? ''} onChange={set('intervalEngineHours')} placeholder="örn. 250" /></Field>
          <Field label="Hedef motor saati" hint="Boş bırakılırsa mevcut saat + aralık"><input className="input" type="number" value={f.dueEngineHours ?? ''} onChange={set('dueEngineHours')} /></Field>
        </div>
        {f.category === 'HAUL_OUT' && (
          <>
            <div className="divider" />
            <h3 className="mb-2">Kara bakımı</h3>
            <div className="form-grid cols-3">
              <Field label="Karaya alma tarihi"><input className="input" type="date" value={f.haulOutDate ?? ''} onChange={set('haulOutDate')} /></Field>
              <Field label="Suya indirme tarihi"><input className="input" type="date" value={f.launchDate ?? ''} onChange={set('launchDate')} /></Field>
              <Field label="Karada kalış süresi"><div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)' }}>{f.haulOutDate && f.launchDate ? `${Math.round((+new Date(f.launchDate) - +new Date(f.haulOutDate)) / 864e5)} gün` : '—'}</div></Field>
            </div>
          </>
        )}
        <div className="divider" />
        <div className="row mb-2"><h3>Kullanılacak malzemeler</h3><span className="spacer" />{editable && <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, plannedMaterials: [...(f.plannedMaterials ?? []), { name: '', quantity: 1, unit: 'adet' }] })}><Plus /> Malzeme</button>}</div>
        {(f.plannedMaterials ?? []).map((m: any, i: number) => (
          <div key={i} className="form-grid" style={{ gridTemplateColumns: '2fr 0.7fr 0.7fr auto', marginBottom: 6 }}>
            <input className="input sm" value={m.name} onChange={(e) => setMat(i, 'name', e.target.value)} placeholder="Malzeme" />
            <input className="input sm" type="number" value={m.quantity} onChange={(e) => setMat(i, 'quantity', e.target.value)} />
            <input className="input sm" value={m.unit ?? ''} onChange={(e) => setMat(i, 'unit', e.target.value)} placeholder="birim" />
            <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => setF({ ...f, plannedMaterials: f.plannedMaterials.filter((_: any, j: number) => j !== i) })}><Trash2 /></button>
          </div>
        ))}
        <div className="mt-2"><Field label="Teknik notlar"><textarea className="textarea" value={f.technicalNotes ?? ''} onChange={set('technicalNotes')} /></Field></div>
      </fieldset>
    </Modal>
  );
}

const COLORS = ['#0B2342', '#1767AD', '#5B9BD8', '#A9CDF0', '#0E9488', '#6D4BD8', '#E07B00', '#DC2626'];

/** Bakım başlığı ekle / düzenle / kaldır: ad, kısa ad, alt bakım türleri ve renk */
function MaintCategoryModal({ cat, onClose, onSaved }: { cat: MaintCat | null; onClose: () => void; onSaved: (c: MaintCat | null) => void }) {
  const [f, setF] = useState({ label: cat?.label ?? '', short: cat?.short ?? '', color: cat?.color ?? COLORS[1], items: (cat?.items ?? []).join('\n') });
  const body = () => ({ label: f.label, short: f.short || undefined, color: f.color, items: f.items.split('\n').map((x) => x.trim()).filter(Boolean) });
  const save = useAction(() => (cat ? api<MaintCat>(`/maintenance-categories/${cat.key}`, { method: 'PUT', body: body() }) : api<MaintCat>('/maintenance-categories', { body: body() })), {
    success: cat ? 'Başlık güncellendi' : 'Yeni başlık eklendi',
    onSuccess: (c) => { onClose(); onSaved(c); },
  });
  const del = useAction(() => api<any>(`/maintenance-categories/${cat!.key}`, { method: 'DELETE' }), {
    success: 'Başlık kaldırıldı',
    onSuccess: () => { onClose(); onSaved(null); },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={cat ? 'Bakım başlığını düzenle' : 'Yeni bakım başlığı'}
      footer={
        <>
          {cat && <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => confirm(`"${cat.label}" başlığı kaldırılsın mı?\nBu başlıktaki mevcut bakım ve iş emirleri silinmez; başlık yalnızca seçim listelerinden kalkar.`) && del.mutate(undefined)}><Trash2 /> Kaldır</button>}
          <button className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn btn-primary" disabled={f.label.trim().length < 2 || save.isPending} onClick={() => save.mutate(undefined)}>{cat ? 'Kaydet' : 'Ekle'}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Başlık adı *" full><input className="input" autoFocus value={f.label} placeholder="Ör. Klima ve Soğutma Bakımları" onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Kısa ad" hint="Listelerde ve grafiklerde görünür"><input className="input" value={f.short} placeholder="Ör. Klima" onChange={(e) => setF({ ...f, short: e.target.value })} /></Field>
        <Field label="Renk" hint="Grafiklerde">
          <div className="row-wrap" style={{ gap: 6 }}>
            {COLORS.map((c) => <button key={c} type="button" className={`color-dot${f.color.toUpperCase() === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />)}
          </div>
        </Field>
        <Field label="Bakım türleri (her satıra bir tane)" full hint="Bakım planlarken 'Bakım türü' listesinde öneri olarak çıkar">
          <textarea className="textarea" rows={7} value={f.items} placeholder={'Klima gazı kontrolü\nFiltre temizliği\nKompresör kontrolü'} onChange={(e) => setF({ ...f, items: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
