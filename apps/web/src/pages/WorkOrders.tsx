import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_CATEGORY_KEYS, PRIORITIES, WORK_ORDER_STATUSES } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, StatusBadge, type Column } from '../components/ui';
import { usePeople, useVesselOptions } from '../lib/lookups';
import { fmtDate, fmtTime } from '../lib/format';
import { CATEGORY_LABELS, CATEGORY_SHORT, PRIORITY_LABELS, PRIORITY_TONE, WORK_ORDER_STATUS_LABELS, WO_TONE } from '../lib/labels';

const GROUPS: Array<[string, string]> = [['', 'Tümü'], ['open', 'Açık'], ['review', 'Kontrol bekleyen'], ['done', 'Tamamlanan'], ['week', 'Bu hafta']];

export default function WorkOrders() {
  const nav = useNavigate();
  const { can, staff } = useAuth();
  const [sp, setSp] = useSearchParams();
  const ls = useListState({ sort: 'createdAt' });
  const group = sp.get('group') ?? '';
  const status = sp.get('status') ?? '';
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const techs = usePeople('TECHNICIAN');
  const creating = sp.get('new') === '1';
  const { data, isLoading } = useApi<any>('/work-orders', { ...ls.query, group: group || undefined, status: status || undefined, priority: priority || undefined, category: category || undefined, technicianId: technicianId || undefined });
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k === 'group') n.delete('status');
    setSp(n, { replace: true });
    ls.setPage(1);
  };

  const cols: Column<any>[] = [
    { key: 'number', label: 'İş emri', sortable: true, render: (w) => <div><div className="mono strong" style={{ color: 'var(--navy)' }}>{w.number}</div><div className="cell-sub">{fmtDate(w.createdAt)}</div></div> },
    { key: 'title', label: 'Açıklama', render: (w) => <div style={{ maxWidth: 340 }}><div className="cell-title truncate">{w.title}</div><div className="cell-sub">{w.vessel.name} · {w.vessel.marina}</div></div> },
    { key: 'category', label: 'Kategori', render: (w) => (w.category ? CATEGORY_SHORT[w.category] : '—') },
    { key: 'tech', label: 'Teknisyen', render: (w) => w.technician?.name ?? <span className="muted">Atanmadı</span> },
    { key: 'plannedStart', label: 'Planlanan', sortable: true, render: (w) => (w.plannedStart ? <div>{fmtDate(w.plannedStart)}<div className="cell-sub">{fmtTime(w.plannedStart)}</div></div> : '—') },
    { key: 'priority', label: 'Öncelik', sortable: true, render: (w) => <StatusBadge map={PRIORITY_TONE} labels={PRIORITY_LABELS} value={w.priority} /> },
    { key: 'status', label: 'Durum', sortable: true, render: (w) => <StatusBadge map={WO_TONE} labels={WORK_ORDER_STATUS_LABELS} value={w.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={staff ? 'İş Emirleri' : 'Servis Taleplerim'}
        sub="Talep → değerlendirme → planlama → işlem → teknik kontrol → müşteriye yayın"
        actions={can('workorders.manage', 'workorders.request') && <button className="btn btn-primary" onClick={() => setParam('new', '1')}><Plus /> {can('workorders.manage') ? 'Yeni İş Emri' : 'Yeni Talep'}</button>}
      />
      <Card pad={false}>
        <div className="toolbar">
          <div className="pill-filter">
            {GROUPS.map(([k, l]) => <button key={k} className={group === k && !status ? 'active' : ''} onClick={() => setParam('group', k)}>{l}</button>)}
          </div>
        </div>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="No, başlık, tekne..." />
          <select className="select sm" style={{ width: 170 }} value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">Tüm durumlar</option>
            {WORK_ORDER_STATUSES.map((s) => <option key={s} value={s}>{WORK_ORDER_STATUS_LABELS[s]}</option>)}
          </select>
          <select className="select sm" style={{ width: 130 }} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Öncelik</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
          <select className="select sm" style={{ width: 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Kategori</option>
            {MAINTENANCE_CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}
          </select>
          {can('workorders.assign') && (
            <select className="select sm" style={{ width: 170 }} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Tüm teknisyenler</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} sort={ls.sort} onSort={ls.onSort} onRowClick={(w) => nav(`/work-orders/${w.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {creating && <WorkOrderForm vesselId={sp.get('vesselId') ?? undefined} onClose={() => setParam('new', '')} onCreated={(w) => nav(`/work-orders/${w.id}`)} />}
    </div>
  );
}

export function WorkOrderForm({ vesselId, onClose, onCreated, initial }: { vesselId?: string; onClose: () => void; onCreated?: (w: any) => void; initial?: any }) {
  const { can } = useAuth();
  const manager = can('workorders.manage');
  const vessels = useVesselOptions();
  const techs = usePeople('TECHNICIAN');
  const [f, setF] = useState<any>(() => ({
    vesselId: vesselId ?? '', title: '', description: '', category: '', priority: 'MEDIUM', technicianId: '', plannedStart: '', plannedEnd: '', plannedHours: '',
    checklist: [] as Array<{ label: string; done: boolean }>,
    ...initial,
  }));
  const [item, setItem] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = useAction(
    () => {
      const body = { ...f, category: f.category || null, technicianId: f.technicianId || null, plannedHours: f.plannedHours || null, plannedStart: f.plannedStart || null, plannedEnd: f.plannedEnd || null };
      return initial?.id ? api(`/work-orders/${initial.id}`, { method: 'PUT', body }) : api('/work-orders', { body });
    },
    { success: initial?.id ? 'İş emri güncellendi' : 'Kayıt oluşturuldu', onSuccess: (r) => { onClose(); onCreated?.(r); } },
  );
  const suggestions = f.category ? MAINTENANCE_CATEGORIES[f.category as keyof typeof MAINTENANCE_CATEGORIES].items : [];
  return (
    <Modal open onClose={onClose} size="lg" title={initial?.id ? 'İş emrini düzenle' : manager ? 'Yeni iş emri' : 'Yeni servis / bakım talebi'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.vesselId || f.title.length < 2 || save.isPending} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Tekne *">
          <select className="select" value={f.vesselId} onChange={set('vesselId')} disabled={!!initial?.id}>
            <option value="">— Tekne seçin —</option>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name} {v.marina ? `· ${v.marina}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Bakım kategorisi">
          <select className="select" value={f.category ?? ''} onChange={set('category')}>
            <option value="">— Seçin —</option>
            {MAINTENANCE_CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field label="İş başlığı *" full>
          <input className="input" list="wo-suggest" value={f.title} onChange={set('title')} placeholder="Örn. Yağ ve filtre değişimi" />
          <datalist id="wo-suggest">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="İş açıklaması" full><textarea className="textarea" value={f.description ?? ''} onChange={set('description')} placeholder="Arıza / talep detayı, konum, gözlemler..." /></Field>
        <Field label="Öncelik">
          <select className="select" value={f.priority} onChange={set('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}</select>
        </Field>
        {manager && (
          <>
            <Field label="Atanan teknisyen">
              <select className="select" value={f.technicianId ?? ''} onChange={set('technicianId')} disabled={!!initial?.id}>
                <option value="">— Daha sonra atanacak —</option>
                {techs.map((t) => <option key={t.id} value={t.id}>{t.name}{t.title ? ` · ${t.title}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Planlanan başlangıç"><input className="input" type="datetime-local" value={f.plannedStart ?? ''} onChange={set('plannedStart')} /></Field>
            <Field label="Planlanan bitiş"><input className="input" type="datetime-local" value={f.plannedEnd ?? ''} onChange={set('plannedEnd')} /></Field>
            <Field label="Planlanan süre (saat)"><input className="input" type="number" step="0.5" value={f.plannedHours ?? ''} onChange={set('plannedHours')} /></Field>
            <Field label="Kontrol listesi" full>
              <div className="stack" style={{ gap: 6 }}>
                {f.checklist.map((c: any, i: number) => (
                  <div key={i} className="row"><span style={{ flex: 1 }}>{i + 1}. {c.label}</span><button className="btn btn-sm btn-ghost btn-icon" onClick={() => setF({ ...f, checklist: f.checklist.filter((_: any, j: number) => j !== i) })}><Trash2 /></button></div>
                ))}
                <div className="row">
                  <input className="input sm" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Kontrol maddesi ekle" onKeyDown={(e) => { if (e.key === 'Enter' && item.trim()) { e.preventDefault(); setF({ ...f, checklist: [...f.checklist, { label: item.trim(), done: false }] }); setItem(''); } }} />
                  <button className="btn btn-sm" onClick={() => { if (item.trim()) { setF({ ...f, checklist: [...f.checklist, { label: item.trim(), done: false }] }); setItem(''); } }}><Plus /></button>
                </div>
              </div>
            </Field>
          </>
        )}
      </div>
      {!manager && <div className="notice mt-2">Talebiniz operasyon ekibimize iletilecek; değerlendirme ve planlama sonrası size bildirim gönderilecektir.</div>}
    </Modal>
  );
}
