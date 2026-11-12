import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FileText, CalendarRange, Layers, Hammer, Ruler, FileSignature, ScrollText, CalendarCheck2, FolderOpen, Filter, Pencil, Trash2, ClipboardCheck } from 'lucide-react';
import { APPROVAL_STATUS_LABELS, type ReportType } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api, authedUrl } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, StatusBadge, type Column } from '../components/ui';
import { useVesselOptions } from '../lib/lookups';
import { fmtDate } from '../lib/format';
import { REPORT_STATUS_LABELS, REPORT_TONE } from '../lib/labels';
import '../styles/doc.css';

/** Teknik raporlar ile sözleşmeler ayrı sayfalarda; aynı liste bileşeni */
export const REPORT_GROUPS = {
  reports: ['INSPECTION', 'WEEKLY_SERVICE', 'POST_SCRAPING', 'HULL_RESTORATION', 'TEAK_CARPENTRY', 'CUSTOM'] as ReportType[],
  contracts: ['DELIVERY_PROTOCOL', 'PROJECT_PROPOSAL'] as ReportType[],
};
export const groupOf = (type: string) => ((REPORT_GROUPS.contracts as string[]).includes(type) ? 'contracts' : 'reports');

const TYPE_ICON: Record<string, any> = {
  INSPECTION: ClipboardCheck,
  WEEKLY_SERVICE: CalendarCheck2,
  POST_SCRAPING: Ruler,
  HULL_RESTORATION: Hammer,
  TEAK_CARPENTRY: Layers,
  DELIVERY_PROTOCOL: FileSignature,
  PROJECT_PROPOSAL: ScrollText,
  CUSTOM: FileText,
};
const TONES = ['blue', 'teal', 'violet', 'navy', 'amber'];

export interface Category { id: string; name: string; description?: string | null; tone: string; baseType: string; group: string; builtIn: boolean; count: number; pending: number }

export default function Reports({ group = 'reports' }: { group?: 'reports' | 'contracts' }) {
  const nav = useNavigate();
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const ls = useListState();
  const contracts = group === 'contracts';
  const cats = useApi<Category[]>('/reports/categories', { group }).data;
  const vessels = useVesselOptions();
  const [cat, setCat] = useState<string>(sp.get('cat') ?? 'ALL');
  const [weekly, setWeekly] = useState(false);
  const [catModal, setCatModal] = useState<Category | 'new' | null>(null);
  // Sütun filtreleri (çoklu seçim)
  const [fCat, setFCat] = useState<string[]>([]);
  const [fVessel, setFVessel] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fApproval, setFApproval] = useState<string[]>([]);
  useEffect(() => ls.setPage(1), [cat, fCat.join(), fVessel.join(), fStatus.join(), fApproval.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // URL'den gelen eski tür parametresini başlığa çevir (ör. ?type=WEEKLY_SERVICE)
  useEffect(() => {
    const t = sp.get('type');
    if (t && !sp.get('new') && cats) { const c = cats.find((x) => x.baseType === t && x.builtIn); if (c) setCat(c.id); }
  }, [cats]); // eslint-disable-line react-hooks/exhaustive-deps

  const catIds = cat === 'ALL' ? (fCat.length ? fCat : (cats ?? []).map((c) => c.id)) : [cat];
  const { data, isLoading } = useApi<any>(cats ? '/reports' : null, {
    ...ls.query,
    categoryIds: catIds.join(',') || 'none',
    vesselIds: fVessel.join(',') || undefined,
    statuses: fStatus.join(',') || undefined,
    approvals: fApproval.join(',') || undefined,
  });
  const total = (cats ?? []).reduce((s, c) => s + c.count, 0);
  const active = cats?.find((c) => c.id === cat);

  const cols: Column<any>[] = [
    { key: 'n', label: contracts ? 'Sözleşme' : 'Rapor', render: (r) => <div><div className="cell-title">{r.title}</div><div className="cell-sub mono">{r.number} · v{r.currentVersion}</div></div> },
    ...(cat === 'ALL'
      ? [{
          key: 't',
          label: 'Başlık',
          header: <ColFilter label="Başlık" value={fCat} onChange={setFCat} options={(cats ?? []).map((c) => ({ value: c.id, label: c.name }))} />,
          render: (r: any) => <span className={`type-pill t-${r.category?.tone ?? 'navy'}`}>{r.category?.name ?? '—'}</span>,
        }]
      : []),
    { key: 'v', label: 'Tekne', header: <ColFilter label="Tekne" value={fVessel} onChange={setFVessel} options={vessels.map((v) => ({ value: v.id, label: v.name }))} />, render: (r) => r.vessel.name },
    { key: 'd', label: 'Güncelleme', render: (r) => fmtDate(r.updatedAt) },
    { key: 's', label: 'Durum', header: <ColFilter label="Durum" value={fStatus} onChange={setFStatus} options={Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => ({ value, label: String(label) }))} />, render: (r) => <StatusBadge map={REPORT_TONE} labels={REPORT_STATUS_LABELS} value={r.status} /> },
    ...(contracts
      ? [{
          key: 'a',
          label: 'Müşteri onayı',
          header: <ColFilter label="Müşteri onayı" value={fApproval} onChange={setFApproval} options={[...Object.entries(APPROVAL_STATUS_LABELS).map(([value, label]) => ({ value, label: String(label) })), { value: 'NONE', label: 'Gönderilmedi' }]} />,
          render: (r: any) => (r.approvalStatus ? <Badge tone={r.approvalStatus === 'APPROVED' ? 'ok' : r.approvalStatus === 'REJECTED' ? 'danger' : 'warn'}>{APPROVAL_STATUS_LABELS[r.approvalStatus as keyof typeof APPROVAL_STATUS_LABELS]}</Badge> : <span className="muted">—</span>),
        }]
      : []),
    { key: 'p', label: '', align: 'right', render: (r) => <a className="btn btn-sm" href={authedUrl(`/reports/${r.id}/pdf`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><FileText /> PDF</a> },
  ];
  const anyFilter = fCat.length + fVessel.length + fStatus.length + fApproval.length > 0;

  return (
    <div>
      <PageHeader
        title={contracts ? 'Sözleşmeler' : 'Raporlar'}
        sub={contracts ? 'Teslim protokolleri ve proje teklif dosyaları · şablondan düzenlenir, müşteri onayına gönderilir' : 'Haftalık bakım ve teknik inceleme raporları · başlıklar ve şablonlar düzenlenebilir'}
        actions={can('reports.manage') && (
          <>
            {!contracts && <button className="btn" onClick={() => setWeekly(true)}><CalendarRange /> Haftalık rapor oluştur</button>}
            <button className="btn btn-primary" onClick={() => setSp({ new: '1', ...(active && active.baseType !== 'WEEKLY_SERVICE' ? { cat: active.id } : {}) })}><Plus /> {contracts ? 'Yeni sözleşme' : 'Yeni rapor'}</button>
          </>
        )}
      />

      <div className="type-cards">
        <button className={`type-card all${cat === 'ALL' ? ' active' : ''}`} onClick={() => setCat('ALL')}>
          <span className="tc-ic"><FolderOpen /></span>
          <span className="tc-body"><b>Tümü</b><small>{contracts ? 'Bütün sözleşmeler' : 'Bütün raporlar'}</small></span>
          <em>{total}</em>
        </button>
        {(cats ?? []).map((c) => {
          const Icon = TYPE_ICON[c.baseType] ?? FileText;
          return (
            <div key={c.id} role="button" tabIndex={0} className={`type-card t-${c.tone}${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)} onKeyDown={(e) => e.key === 'Enter' && setCat(c.id)}>
              <span className="tc-ic"><Icon /></span>
              <span className="tc-body"><b>{c.name}</b><small>{c.description || ' '}</small></span>
              <em>{c.count}</em>
              {c.pending > 0 && <i className="tc-pending">{c.pending} onay bekliyor</i>}
              {can('reports.approve') && <button type="button" className="tc-edit" title="Başlığı düzenle" onClick={(e) => { e.stopPropagation(); setCatModal(c); }}><Pencil /></button>}
            </div>
          );
        })}
        {can('reports.approve') && (
          <button className="type-card add" onClick={() => setCatModal('new')}>
            <span className="tc-ic"><Plus /></span>
            <span className="tc-body"><b>Yeni başlık</b><small>Yeni rapor türü / şablon</small></span>
          </button>
        )}
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder={contracts ? 'Sözleşme, tekne…' : 'Rapor, tekne…'} />
          {anyFilter && <button className="btn btn-sm" onClick={() => { setFCat([]); setFVessel([]); setFStatus([]); setFApproval([]); }}><Filter size={14} /> Filtreleri temizle</button>}
          <span className="xs muted">Sütun başlıklarına tıklayarak filtreleyin</span>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading || !cats} onRowClick={(r) => nav(`/${group}/${r.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>

      {weekly && <WeeklyModal onClose={() => setWeekly(false)} onDone={(id) => (id ? nav(`/reports/${id}`) : setCat(cats?.find((c) => c.baseType === 'WEEKLY_SERVICE')?.id ?? 'ALL'))} />}
      {catModal && <CategoryModal group={group} cat={catModal === 'new' ? null : catModal} cats={cats ?? []} onClose={() => setCatModal(null)} onDeleted={() => setCat('ALL')} />}
      {sp.get('new') && cats && (
        <NewReport
          cats={cats.filter((c) => c.baseType !== 'WEEKLY_SERVICE' && c.baseType !== 'INSPECTION')}
          contracts={contracts}
          onClose={() => setSp({})}
          defaults={{
            vesselId: sp.get('vesselId') ?? '',
            projectId: sp.get('projectId') ?? '',
            title: sp.get('title') ?? '',
            categoryId: sp.get('cat') ?? cats.find((c) => c.builtIn && c.baseType === sp.get('type'))?.id ?? '',
          }}
        />
      )}
    </div>
  );
}

/** Sütun başlığı filtresi: başlığa tıklayınca arama kutulu, çoklu seçimli liste açılır */
export function ColFilter({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const scroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', scroll, true); };
  }, [open]);
  const shown = useMemo(() => options.filter((o) => o.label.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR'))), [options, q]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <span className="colf" onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" className={`colf-btn${value.length ? ' on' : ''}`} onClick={() => setOpen(!open)} title={`${label} filtresi`}>
        {label}
        <span className="colf-ic"><Filter />{value.length > 0 && <b>{value.length}</b>}</span>
      </button>
      {open && (
        <div ref={pop} className="colf-pop" style={{ top: pos.top, left: pos.left }}>
          <input className="input sm" autoFocus placeholder={`${label} ara…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="colf-list">
            {shown.map((o) => (
              <label key={o.value} className="colf-opt">
                <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {!shown.length && <div className="xs muted" style={{ padding: 8 }}>Sonuç yok</div>}
          </div>
          <div className="colf-foot">
            <button type="button" className="btn btn-xs" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])}>Tümünü seç</button>
            <button type="button" className="btn btn-xs" onClick={() => onChange([])}>Temizle</button>
            <button type="button" className="btn btn-xs btn-primary" onClick={() => setOpen(false)}>Tamam</button>
          </div>
        </div>
      )}
    </span>
  );
}

/** Rapor başlığı ekle / yeniden adlandır / kaldır */
function CategoryModal({ group, cat, cats, onClose, onDeleted }: { group: string; cat: Category | null; cats: Category[]; onClose: () => void; onDeleted: () => void }) {
  const [f, setF] = useState({ name: cat?.name ?? '', description: cat?.description ?? '', tone: cat?.tone ?? 'navy', fromCategoryId: '' });
  const save = useAction(() => (cat ? api(`/reports/categories/${cat.id}`, { method: 'PUT', body: { name: f.name, description: f.description, tone: f.tone } }) : api('/reports/categories', { body: { ...f, group, fromCategoryId: f.fromCategoryId || null } })), { success: cat ? 'Başlık güncellendi' : 'Yeni başlık eklendi', onSuccess: onClose });
  const del = useAction(() => api<any>(`/reports/categories/${cat!.id}`, { method: 'DELETE' }), { success: 'Başlık kaldırıldı', onSuccess: () => { onClose(); onDeleted(); } });
  const sources = cats.filter((c) => c.baseType !== 'WEEKLY_SERVICE');
  return (
    <Modal
      open
      onClose={onClose}
      title={cat ? 'Başlığı düzenle' : 'Yeni rapor başlığı'}
      footer={
        <>
          {cat && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => confirm(cat.count ? `"${cat.name}" başlığı kaldırılsın mı?\n${cat.count} belge silinmez; Tümü listesinde görünmeye devam eder.` : `"${cat.name}" başlığı silinsin mi?`) && del.mutate(undefined)}><Trash2 /> Kaldır</button>}
          <button className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn btn-primary" disabled={f.name.trim().length < 2 || save.isPending} onClick={() => save.mutate(undefined)}>{cat ? 'Kaydet' : 'Ekle'}</button>
        </>
      }
    >
      <div className="stack">
        <Field label="Başlık adı"><input className="input" autoFocus value={f.name} placeholder="Ör. Motor Bakım Raporu" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Kısa açıklama (kartta görünür)"><input className="input" value={f.description} placeholder="Ör. Yıllık motor servisi bulguları" onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {!cat && (
          <Field label="Belge düzeni" hint="Boş belge serbest başlıklarla başlar; istediğiniz başlığı ekleyip çıkarabilirsiniz. Belgeyi düzenleyip “Yeni şablon olarak kaydet” dediğinizde bu başlığın şablonu olur.">
            <select className="select" value={f.fromCategoryId} onChange={(e) => setF({ ...f, fromCategoryId: e.target.value })}>
              <option value="">Boş belge (serbest başlıklar)</option>
              {sources.map((c) => <option key={c.id} value={c.id}>“{c.name}” düzenini ve varsayılan şablonunu kopyala</option>)}
            </select>
          </Field>
        )}
        <Field label="Renk">
          <div className="row-wrap" style={{ gap: 6 }}>
            {TONES.map((t) => <button key={t} type="button" className={`tone-dot t-${t}${f.tone === t ? ' on' : ''}`} onClick={() => setF({ ...f, tone: t })} aria-label={t} />)}
          </div>
        </Field>
        {cat?.builtIn && <p className="xs muted">Hazır başlık: kaldırılırsa listeden gizlenir, belgeleri korunur.</p>}
      </div>
    </Modal>
  );
}

function NewReport({ onClose, defaults, cats, contracts }: { onClose: () => void; defaults: Record<string, string>; cats: Category[]; contracts: boolean }) {
  const nav = useNavigate();
  const vessels = useVesselOptions();
  const [f, setF] = useState({ vesselId: '', projectId: '', workOrderId: '', templateId: '', title: '', ...defaults, categoryId: defaults.categoryId || cats[0]?.id || '' });
  const tpls = useApi<any[]>(f.categoryId ? '/reports/templates' : null, { categoryId: f.categoryId }).data ?? [];
  const defTpl = tpls.find((t) => t.isDefault);
  const projects = useApi<any>(f.vesselId ? '/projects' : null, { vesselId: f.vesselId }).data?.items ?? [];
  const wos = useApi<any>(f.vesselId ? '/work-orders' : null, { vesselId: f.vesselId, group: 'done', pageSize: 50 }).data?.items ?? [];
  const create = useAction(() => api('/reports', { body: { ...f, title: f.title || null, templateId: f.templateId || (defTpl ? defTpl.id : 'SYSTEM'), projectId: f.projectId || null, workOrderId: f.workOrderId || null } }), { success: 'Belge taslağı şablondan oluşturuldu', onSuccess: (r) => nav(`/${contracts ? 'contracts' : 'reports'}/${r.id}`) });
  return (
    <Modal open onClose={onClose} title={contracts ? 'Yeni sözleşme' : 'Yeni rapor'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.vesselId || !f.categoryId || create.isPending} onClick={() => create.mutate(undefined)}>Taslak oluştur</button></>}>
      <div className="form-grid">
        <Field label="Başlık" full>
          <select className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, templateId: '' })}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Şablon" full hint="Yeni belge seçilen şablonun içeriğiyle başlar; tekne adı ve marina otomatik doldurulur.">
          <select className="select" value={f.templateId || (defTpl ? defTpl.id : 'SYSTEM')} onChange={(e) => setF({ ...f, templateId: e.target.value })}>
            <option value="SYSTEM">Sistem şablonu (örnek belge)</option>
            {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' · varsayılan' : ''}</option>)}
          </select>
        </Field>
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={(e) => setF({ ...f, vesselId: e.target.value, projectId: '', workOrderId: '' })}><option value="">— Seçin —</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="İlgili proje"><select className="select" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">—</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="İlgili iş emri" full><select className="select" value={f.workOrderId} onChange={(e) => setF({ ...f, workOrderId: e.target.value })}><option value="">—</option>{wos.map((w: any) => <option key={w.id} value={w.id}>{w.number} · {w.title}</option>)}</select></Field>
      </div>
      <div className="notice mt-2">Rapor sistem tarafından taslak olarak hazırlanır. Teknik uygunluk, ayıpsız teslim, garanti veya ibra beyanları yalnızca yetkili onayı sırasında açıkça seçilirse eklenir.</div>
    </Modal>
  );
}

/** Haftalık bakım ve servis raporu oluştur (tek tekne veya tüm tekneler) */
function WeeklyModal({ onClose, onDone }: { onClose: () => void; onDone: (id?: string) => void }) {
  const vessels = useVesselOptions();
  const monday = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [f, setF] = useState({ vesselId: '', week: iso(new Date(monday(new Date()).getTime() - 7 * 864e5)) });
  const start = monday(new Date(f.week));
  const end = new Date(start.getTime() + 6 * 864e5);
  const run = useAction(() => api<any>('/reports/weekly', { body: { vesselId: f.vesselId || undefined, weekStart: iso(start) } }), {
    success: f.vesselId ? 'Haftalık rapor hazırlandı' : 'Haftalık raporlar hazırlandı',
    onSuccess: (r: any) => { onClose(); onDone(r.reportId); },
  });
  return (
    <Modal open onClose={onClose} title="Haftalık bakım ve servis raporu" footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={run.isPending} onClick={() => run.mutate(undefined)}><CalendarRange /> Oluştur</button></>}>
      <div className="stack">
        <div className="notice"><CalendarRange /><div>Rapor; seçilen haftanın tamamlanan, devam eden ve planlı iş emirlerinden, periyodik bakımlardan, arızalardan, kullanılan malzemelerden ve haftalık denetimden <b>otomatik</b> oluşturulur. Ayrıca her <b>Pazartesi sabahı</b> bir önceki haftanın raporları kendiliğinden taslak olarak hazırlanır.</div></div>
        <Field label="Tekne"><select className="select" value={f.vesselId} onChange={(e) => setF({ ...f, vesselId: e.target.value })}><option value="">Tüm tekneler (yalnızca hareketi olanlar)</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Hafta" hint={`${start.toLocaleDateString('tr-TR')} Pazartesi – ${end.toLocaleDateString('tr-TR')} Pazar`}><input className="input" type="date" value={f.week} onChange={(e) => e.target.value && setF({ ...f, week: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
