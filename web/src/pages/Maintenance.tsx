import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, Gauge, CalendarClock, Trash2, Pencil, Repeat, UserRound } from 'lucide-react';
import { HelperPicker, RepeatPicker, defaultEnd, parsePackage, repeatBody, repeatFrom, repeatText, repeatValid, teamText, todayStr, type RepeatValue } from '../components/planning';
import { MAINTENANCE_STATUSES, PRIORITIES } from '@nexus/shared';
import { useMaintCats, type MaintCat } from '../lib/maintCats';
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
  const [source, setSource] = useState('');
  // Eski bağlantılar (?id=) bakım detayına gider
  const legacyId = sp.get('id');
  useEffect(() => { if (legacyId) nav(`/maintenance/${legacyId}`, { replace: true }); }, [legacyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const editId = null as string | null;
  const creating = sp.get('new') === '1';
  const { data, isLoading } = useApi<any>('/maintenance', { ...ls.query, category: cat === 'ALL' ? undefined : cat, status: status || undefined, source: source || undefined });
  const close = () => setSp({}, { replace: true });
  const cats = useMaintCats();
  const [catModal, setCatModal] = useState<MaintCat | 'new' | null>(null);
  const manageCats = can('maintenance.manage');

  const cols: Column<any>[] = [
    { key: 'plannedDate', label: 'Planlanan', sortable: true, render: (m) => <div><b>{fmtDate(m.plannedDate)}</b>{m.dueEngineHours != null && <div className="cell-sub row" style={{ gap: 4 }}><Gauge size={12} /> {fmtNum(m.engine?.hours)} / {fmtNum(m.dueEngineHours)} s</div>}</div> },
    { key: 'title', label: 'Bakım', sortable: true, render: (m) => <div><div className="cell-title row-wrap" style={{ gap: 6 }}>{m.title}{Array.isArray(m.checklist) && m.checklist.length > 0 && <span className="xs muted">· {m.checklist.filter((x: any) => x.done).length}/{m.checklist.length} adım</span>}{m.source === 'CUSTOMER' && <Badge tone="violet"><UserRound size={11} /> Müşteri talebi</Badge>}</div><div className="cell-sub">{repeatText(m) ? <><Repeat size={11} style={{ verticalAlign: -1 }} /> {repeatText(m)}</> : ''}{m.intervalEngineHours ? ` · ${m.intervalEngineHours} saatte bir` : ''}</div></div> },
    { key: 'vessel', label: 'Tekne', render: (m) => <div><div>{m.vessel.name}</div><div className="cell-sub">{m.vessel.marina}</div></div> },
    { key: 'tech', label: 'Teknisyen', render: (m) => teamText(m) || <span className="muted">—</span> },
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
          <button key={c.key} role="tab" title={c.label} className={`tab${cat === c.key ? ' active' : ''}`} onClick={() => setCat(c.key)}>
            {c.short || c.label}
            {manageCats && <span className="tab-edit" role="button" title="Paketi düzenle" onClick={(e) => { e.stopPropagation(); setCatModal(c); }}><Pencil /></span>}
          </button>
        ))}
        {manageCats && <button className="tab tab-add" title="Yeni paket" onClick={() => setCatModal('new')}><Plus /></button>}
      </div>
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Bakım veya tekne ara..." />
          <div className="pill-filter">
            {[['', 'Tümü'], ['PLANNED', 'Planlı'], ['OVERDUE', 'Gecikmiş'], ['IN_PROGRESS', 'Devam eden'], ['COMPLETED', 'Tamamlanan']].map(([k, l]) => (
              <button key={k} className={status === k && !source ? 'active' : ''} onClick={() => { setStatus(k); setSource(''); }}>{l}</button>
            ))}
            <button className={source === 'CUSTOMER' ? 'active' : ''} onClick={() => { setSource(source ? '' : 'CUSTOMER'); setStatus(''); }}>Müşteri talepleri</button>
          </div>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} sort={ls.sort} onSort={ls.onSort} onRowClick={(m) => nav(`/maintenance/${m.id}`)} />
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
  const [rep, setRep] = useState<RepeatValue>(repeatFrom(null));
  // Yeni planda başlangıç bugün (veya takvimden seçilen gün), bitiş aynı gün; periyodik seçilince bitiş 6 ay sonrası
  const start0 = defaults.plannedDate || todayStr();
  const [f, setF] = useState<any>({ helperIds: [], title: '', category: 'MECHANICAL', subType: '', vesselId: '', description: '', startDate: start0, endDate: start0, technicianId: '', priority: 'MEDIUM', estimatedHours: '', actualHours: '', status: 'PLANNED', technicalNotes: '', intervalDays: '', engineId: '', intervalEngineHours: '', dueEngineHours: '', haulOutDate: '', launchDate: '', plannedMaterials: [], ...defaults, plannedDate: undefined });
  const periodic = rep.mode !== 'none';
  const [stepsText, setStepsText] = useState('');
  const planPkgs = useApi<any[]>(editable && !id ? '/maintenance/packages' : null).data ?? [];
  const [newPkg, setNewPkg] = useState(false);
  // "Paketten doldur": bakım paketleri; açıklama / süre / periyot daha önce bu paketle açılmış plandan gelir
  const pkgOf = (c: MaintCat) => {
    const prev = planPkgs.find((p) => p.title === c.label);
    return { ...(prev ?? {}), title: c.label, category: c.key, subType: '', checklist: c.items.length ? c.items : prev?.checklist ?? [] };
  };
  const fillPackage = (p: any) => {
    setF((x: any) => ({ ...x, title: p.title, category: p.category ?? x.category, subType: p.subType ?? '', description: p.description ?? x.description ?? '', estimatedHours: p.estimatedHours ?? x.estimatedHours }));
    setStepsText(p.checklist.join('\n'));
    if (p.repeatWeekdays?.length || p.repeatMonthDay) {
      const r = repeatFrom(p);
      setRep(r);
      setF((x: any) => ({ ...x, endDate: defaultEnd(r.mode, x.startDate || todayStr()) }));
    }
  };
  // Paket metni yapıştırılırsa (başlık + açıklama + "* madde" satırları) alanlar otomatik dolar
  const onStepsPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const p = parsePackage(e.clipboardData.getData('text'));
    if (!p.hasBullets) return;
    e.preventDefault();
    setStepsText((t) => [t.trim(), ...p.steps].filter(Boolean).join('\n'));
    setF((x: any) => ({ ...x, title: x.title || p.title, description: x.description || p.description }));
  };
  useEffect(() => {
    if (!existing) return;
    const r = repeatFrom(existing);
    setRep(r);
    setStepsText(Array.isArray(existing.checklist) ? existing.checklist.map((x: any) => x.label).join('\n') : '');
    const st = toInputDate(existing.startDate ?? existing.plannedDate);
    // Periyodik planda "Bitiş" = serinin bitiş tarihi
    const en = r.mode !== 'none' ? toInputDate(existing.repeatUntil) : toInputDate(existing.endDate ?? existing.startDate ?? existing.plannedDate);
    setF({ ...existing, helperIds: existing.helperIds ?? [], startDate: st, endDate: en, haulOutDate: toInputDate(existing.haulOutDate), launchDate: toInputDate(existing.launchDate), technicianId: existing.technicianId ?? '', engineId: existing.engineId ?? '', plannedMaterials: existing.plannedMaterials ?? [] });
  }, [existing]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const changeRepeat = (r: RepeatValue) => {
    // Periyot türü değişince bitiş otomatik: periyodik → başlangıç + 6 ay, tek seferlik → başlangıç günü
    if ((r.mode === 'none') !== (rep.mode === 'none')) setF({ ...f, endDate: defaultEnd(r.mode, f.startDate || todayStr()) });
    setRep(r);
  };
  const changeStart = (v: string) => setF({ ...f, startDate: v, endDate: !periodic ? (f.endDate && f.endDate >= v ? f.endDate : v) : f.endDate && f.endDate > v ? f.endDate : defaultEnd(rep.mode, v) });
  const vessel = vessels.find((v) => v.id === f.vesselId);
  const engines = vessel?.engines ?? [];
  const nn = (x: any) => (x === '' || x == null ? null : x);
  // Adımlar: mevcut tamamlanma bilgileri korunur
  const stepsList = () => {
    const old: any[] = Array.isArray(existing?.checklist) ? existing.checklist : [];
    return stepsText.split('\n').map((l) => l.replace(/^([*\-•·–]|\d+[.)])\s+/, '').trim()).filter(Boolean).map((label) => old.find((o) => o.label === label) ?? { label, done: false });
  };
  const save = useAction(
    () => {
      const body = { title: f.title, category: f.category, subType: nn(f.subType), vesselId: f.vesselId, description: nn(f.description), plannedDate: f.startDate, startDate: nn(f.startDate), endDate: periodic ? null : nn(f.endDate), repeatUntil: periodic ? nn(f.endDate) : null, technicianId: nn(f.technicianId), priority: f.priority, estimatedHours: nn(f.estimatedHours), actualHours: nn(f.actualHours), status: f.status, technicalNotes: nn(f.technicalNotes), ...repeatBody(rep), helperIds: (f.helperIds ?? []).filter((h: string) => h !== f.technicianId), engineId: nn(f.engineId), intervalEngineHours: nn(f.intervalEngineHours), dueEngineHours: nn(f.dueEngineHours), haulOutDate: nn(f.haulOutDate), launchDate: nn(f.launchDate), plannedMaterials: (f.plannedMaterials ?? []).filter((m: any) => m.name), checklist: stepsList() };
      return id ? api(`/maintenance/${id}`, { method: 'PUT', body }) : api('/maintenance', { body });
    },
    { success: 'Bakım planı kaydedildi', onSuccess: (r: any) => { onClose(); if (!id && r?.id) nav(`/maintenance/${r.id}`); } },
  );
  const del = useAction((series: boolean) => api<any>(`/maintenance/${id}${series ? '?series=1' : ''}`, { method: 'DELETE' }), { success: 'Bakım planı silindi', onSuccess: onClose });
  const inSeries = !!existing?.seriesId && !!(existing.repeatWeekdays?.length || existing.repeatMonthDay);
  const cats = useMaintCats();
  const setMat = (i: number, k: string, v: string) => setF({ ...f, plannedMaterials: f.plannedMaterials.map((m: any, j: number) => (j === i ? { ...m, [k]: v } : m)) });

  return (
    <Modal open onClose={onClose} size="lg" title={id ? f.title || 'Bakım planı' : 'Yeni bakım planı'} footer={
      <>
        {id && editable && (
          <span className="row" style={{ marginRight: 'auto', gap: 4 }}>
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => confirm(inSeries ? 'Yalnızca bu tarihteki bakım silinsin mi? (Tekrar devam eder)' : 'Bakım planı silinsin mi?') && del.mutate(false)}><Trash2 /> Sil</button>
            {inSeries && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} title="Bu ve sonraki tüm tekrarlar silinir, tekrar durur" onClick={() => confirm('Bu bakım ve sonraki tüm tekrarları silinsin mi? Periyodik plan durdurulur.') && del.mutate(true)}><Repeat /> Tekrarı durdur</button>}
          </span>
        )}
        {existing?.workOrder && <button className="btn" onClick={() => nav(`/work-orders/${existing.workOrder.id}`)}>İş emri: {existing.workOrder.number} <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={existing.workOrder.status} /></button>}
        <button className="btn" onClick={onClose}>Kapat</button>
        {editable && <button className="btn btn-primary" disabled={!f.title || !f.vesselId || !f.startDate || !repeatValid(rep) || save.isPending} onClick={() => save.mutate(undefined)}>Kaydet</button>}
      </>
    }>
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
        {existing?.source === 'CUSTOMER' && <div className="notice mb-2"><UserRound /><div><b>Müşteri talebi</b> · {existing.requester?.name ?? 'Müşteri'} bu bakımı portaldan planladı. Teknisyen atayıp kaydedebilir veya iş emrine dönüştürebilirsiniz.</div></div>}
        {editable && !id && (
          <div className="row mb-2" style={{ gap: 8 }}>
            <span className="small muted">Paketten doldur:</span>
            <select className="select sm" style={{ width: 'auto', minWidth: 240 }} value="" onChange={(e) => { const v = e.target.value; if (v === '__new') return setNewPkg(true); const c = cats.active.find((x) => x.key === v); if (c) fillPackage(pkgOf(c)); }}>
              <option value="">— Bakım paketi seçin —</option>
              {cats.active.map((c) => <option key={c.key} value={c.key}>{c.label}{c.items.length ? ` (${c.items.length} adım)` : ''}</option>)}
              {can('maintenance.manage') && <option value="__new">+ Yeni paket ekle</option>}
            </select>
          </div>
        )}
        {newPkg && <MaintCategoryModal cat={null} onClose={() => setNewPkg(false)} onSaved={(c) => c && fillPackage(pkgOf(c))} />}
        <div className="form-grid">
          <Field label="Tekne *"><select className="select" value={f.vesselId} onChange={set('vesselId')}><option value="">— Seçin —</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Bakım adı *" full><input className="input" value={f.title} onChange={set('title')} /></Field>
          <Field label="Açıklama" full><textarea className="textarea" value={f.description ?? ''} placeholder="Ör. Temel Koruma Paketi · Haftada 1 ziyaret · 30 dakika havalandırma" onChange={set('description')} /></Field>
          <Field label="Bakım adımları (her satıra bir madde)" full hint="Paket metnini (başlık + * maddeler) buraya yapıştırırsanız başlık, açıklama ve adımlar otomatik dolar">
            <textarea className="textarea" rows={6} value={stepsText} onPaste={onStepsPaste} placeholder={'Akü ve şarj sistemi kontrolü\nSintine kontrolü\nBağlama halatları kontrolü'} onChange={(e) => setStepsText(e.target.value)} />
          </Field>
        </div>
        <div className="divider" />
        <h3 className="mb-2 row" style={{ gap: 8 }}><Repeat size={16} /> Periyodik bakım</h3>
        <RepeatPicker value={rep} onChange={changeRepeat} />
        {inSeries && <div className="xs muted mt-1">Bu plan tekrarlı bir serinin parçası. Kaydedince sonraki (henüz iş emrine dönüşmemiş) tarihler bu plana göre güncellenir.</div>}
        <div className="form-grid cols-3 mt-2">
          <Field label="Başlangıç *" hint={periodic ? 'İlk bakım bu tarihten sonraki ilk seçili gün' : undefined}><input className="input" type="date" value={f.startDate ?? ''} onChange={(e) => changeStart(e.target.value)} /></Field>
          <Field label={periodic ? 'Bitiş (son tekrar)' : 'Bitiş'} hint={periodic ? 'Varsayılan: başlangıçtan 1 yıl sonra · takvimde bu tarihe kadar görünür' : undefined}><input className="input" type="date" min={f.startDate || undefined} value={f.endDate ?? ''} onChange={set('endDate')} /></Field>
          <span />
          <Field label="Sorumlu teknisyen"><select className="select" value={f.technicianId} onChange={set('technicianId')}><option value="">—</option>{techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Ek teknisyenler" full={false}><HelperPicker techs={techs} value={f.helperIds ?? []} exclude={f.technicianId} disabled={!editable} onChange={(helperIds) => setF({ ...f, helperIds })} /></Field>
          <Field label="Öncelik"><select className="select" value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select></Field>
          <Field label="Durum"><select className="select" value={f.status} onChange={set('status')}>{MAINTENANCE_STATUSES.map((s) => <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</option>)}</select></Field>
          <Field label="Tahmini işçilik (saat)"><input className="input" type="number" value={f.estimatedHours ?? ''} onChange={set('estimatedHours')} /></Field>
          <Field label="Gerçekleşen işçilik (saat)"><input className="input" type="number" value={f.actualHours ?? ''} onChange={set('actualHours')} /></Field>
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

/** Bakım paketi ekle / düzenle / kaldır: ad, kısa ad, bakım adımları ve renk */
function MaintCategoryModal({ cat, onClose, onSaved }: { cat: MaintCat | null; onClose: () => void; onSaved: (c: MaintCat | null) => void }) {
  const [f, setF] = useState({ label: cat?.label ?? '', short: cat?.short ?? '', color: cat?.color ?? COLORS[1], items: (cat?.items ?? []).join('\n') });
  const body = () => ({ label: f.label, short: f.short || undefined, color: f.color, items: f.items.split('\n').map((x) => x.trim()).filter(Boolean) });
  const save = useAction(() => (cat ? api<MaintCat>(`/maintenance-categories/${cat.key}`, { method: 'PUT', body: body() }) : api<MaintCat>('/maintenance-categories', { body: body() })), {
    success: cat ? 'Paket güncellendi' : 'Yeni paket eklendi',
    onSuccess: (c) => { onClose(); onSaved(c); },
  });
  const del = useAction(() => api<any>(`/maintenance-categories/${cat!.key}`, { method: 'DELETE' }), {
    success: 'Paket kaldırıldı',
    onSuccess: () => { onClose(); onSaved(null); },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={cat ? 'Bakım paketini düzenle' : 'Yeni bakım paketi'}
      footer={
        <>
          {cat && <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => confirm(`"${cat.label}" paketi kaldırılsın mı?\nBu paketle açılmış mevcut bakımlar silinmez; paket yalnızca seçim listelerinden kalkar.`) && del.mutate(undefined)}><Trash2 /> Kaldır</button>}
          <button className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn btn-primary" disabled={f.label.trim().length < 2 || save.isPending} onClick={() => save.mutate(undefined)}>{cat ? 'Kaydet' : 'Ekle'}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Paket adı *" full><input className="input" autoFocus value={f.label} placeholder="Ör. Klima Bakım Paketi" onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Kısa ad" hint="Listelerde ve grafiklerde görünür"><input className="input" value={f.short} placeholder="Ör. Klima" onChange={(e) => setF({ ...f, short: e.target.value })} /></Field>
        <Field label="Renk" hint="Grafiklerde">
          <div className="row-wrap" style={{ gap: 6 }}>
            {COLORS.map((c) => <button key={c} type="button" className={`color-dot${f.color.toUpperCase() === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} aria-label={c} />)}
          </div>
        </Field>
        <Field label="Bakım adımları (her satıra bir madde)" full hint="Paket seçilince bakım adımlarına otomatik dolar">
          <textarea className="textarea" rows={7} value={f.items} placeholder={'Klima gazı kontrolü\nFiltre temizliği\nKompresör kontrolü'} onChange={(e) => setF({ ...f, items: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
