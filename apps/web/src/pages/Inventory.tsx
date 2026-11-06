import { useState } from 'react';
import { Plus, AlertTriangle, PackagePlus } from 'lucide-react';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, type Column } from '../components/ui';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';

export default function Inventory() {
  const { can } = useAuth();
  const ls = useListState({ sort: 'name', order: 'asc' });
  const [category, setCategory] = useState('');
  const [low, setLow] = useState(false);
  const [form, setForm] = useState<any | null>(null);
  const [adjust, setAdjust] = useState<any | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const cats = useApi<string[]>('/inventory/categories').data ?? [];
  const { data, isLoading } = useApi<any>('/inventory', { ...ls.query, category: category || undefined, low: low ? 'true' : undefined });
  const showCost = can('finance.view');
  const cols: Column<any>[] = [
    { key: 'name', label: 'Malzeme', sortable: true, render: (m) => <div><div className="cell-title">{m.name}</div><div className="cell-sub mono">{m.sku}</div></div> },
    { key: 'category', label: 'Kategori', sortable: true, render: (m) => m.category },
    { key: 'stock', label: 'Mevcut stok', sortable: true, align: 'right', render: (m) => <div className="row" style={{ justifyContent: 'flex-end' }}>{m.stock <= m.minStock && <AlertTriangle size={14} color="var(--warn)" />}<b className="mono">{fmtNum(m.stock, 2)}</b> <span className="muted">{m.unit}</span></div> },
    { key: 'min', label: 'Min.', align: 'right', render: (m) => <span className="mono muted">{fmtNum(m.minStock)}</span> },
    ...(showCost ? [{ key: 'unitCost', label: 'Birim maliyet', sortable: true, align: 'right' as const, render: (m: any) => <span className="mono">{fmtMoney(m.unitCost, m.currency)}</span> }, { key: 'val', label: 'Stok değeri', align: 'right' as const, render: (m: any) => <span className="mono">{fmtMoney(m.stock * m.unitCost, m.currency)}</span> }] : []),
    { key: 'u', label: 'Kullanım', align: 'right', render: (m) => <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setUsage(m); }}>{m._count.usages} kayıt</button> },
    ...(can('inventory.manage') ? [{ key: 'a', label: '', align: 'right' as const, render: (m: any) => <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setAdjust(m); }}><PackagePlus /> Stok</button> }] : []),
  ];
  return (
    <div>
      <PageHeader title="Stok ve Malzemeler" sub="Malzeme stoğu, kullanım geçmişi ve iş emri bağlantıları" actions={can('inventory.manage') && <button className="btn btn-primary" onClick={() => setForm({})}><Plus /> Yeni Malzeme</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Malzeme veya SKU..." />
          <select className="select sm" style={{ width: 170 }} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Tüm kategoriler</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          <label className="checkbox small"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Yalnızca kritik stok</label>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} sort={ls.sort} onSort={ls.onSort} onRowClick={(m) => can('inventory.manage') && setForm(m)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <MaterialForm initial={form} onClose={() => setForm(null)} />}
      {adjust && <AdjustModal m={adjust} onClose={() => setAdjust(null)} />}
      {usage && <UsageModal m={usage} onClose={() => setUsage(null)} />}
    </div>
  );
}

function MaterialForm({ initial, onClose }: { initial: any; onClose: () => void }) {
  const { can } = useAuth();
  const [f, setF] = useState<any>({ name: '', sku: '', category: '', unit: 'adet', stock: 0, minStock: 0, unitCost: 0, currency: 'EUR', ...initial });
  const save = useAction(() => {
    const { id, _count, createdAt, updatedAt, ...body } = f;
    return id ? api(`/inventory/${id}`, { method: 'PUT', body }) : api('/inventory', { body });
  }, { success: 'Malzeme kaydedildi', onSuccess: onClose });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={initial.id ? 'Malzemeyi düzenle' : 'Yeni malzeme'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.name || !f.category} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Malzeme adı" full><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="SKU"><input className="input" value={f.sku ?? ''} onChange={set('sku')} /></Field>
        <Field label="Kategori"><input className="input" list="cats" value={f.category} onChange={set('category')} /><datalist id="cats">{['Yağlar', 'Filtreler', 'Yedek Parça', 'Boya', 'Kompozit', 'Polish', 'Teak', 'Elektrik', 'Sarf'].map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Birim"><select className="select" value={f.unit} onChange={set('unit')}>{['adet', 'L', 'kg', 'm²', 'm', 'set', 'kutu'].map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Mevcut stok"><input className="input" type="number" value={f.stock} onChange={set('stock')} disabled={!!initial.id} /></Field>
        <Field label="Minimum stok"><input className="input" type="number" value={f.minStock} onChange={set('minStock')} /></Field>
        {can('finance.manage') && <Field label="Birim maliyet"><input className="input" type="number" step="0.01" value={f.unitCost} onChange={set('unitCost')} /></Field>}
      </div>
    </Modal>
  );
}

function AdjustModal({ m, onClose }: { m: any; onClose: () => void }) {
  const [delta, setDelta] = useState('');
  const save = useAction(() => api(`/inventory/${m.id}/adjust`, { body: { delta: Number(delta) } }), { success: 'Stok güncellendi', onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`${m.name} — stok hareketi`} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!delta} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <p className="muted mb-2">Mevcut stok: <b>{fmtNum(m.stock, 2)} {m.unit}</b></p>
      <Field label="Miktar" hint="Giriş için pozitif, çıkış/sayım düzeltmesi için negatif değer girin."><input className="input" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} /></Field>
    </Modal>
  );
}

function UsageModal({ m, onClose }: { m: any; onClose: () => void }) {
  const { data = [] } = useApi<any[]>(`/inventory/${m.id}/usages`);
  return (
    <Modal open onClose={onClose} size="lg" title={`${m.name} — kullanım geçmişi`}>
      <DataTable rows={data} columns={[
        { key: 'd', label: 'Tarih', render: (u: any) => fmtDate(u.usedAt) },
        { key: 'w', label: 'İş emri / proje', render: (u: any) => u.workOrder ? <a href={`/work-orders/${u.workOrder.id}`}>{u.workOrder.number} · {u.workOrder.vessel.name}</a> : u.project ? <a href={`/projects/${u.project.id}`}>{u.project.name}</a> : '—' },
        { key: 'q', label: 'Miktar', align: 'right', render: (u: any) => <b className="mono">{fmtNum(u.quantity, 2)} {m.unit}</b> },
        ...(u0(data) ? [{ key: 'c', label: 'Tutar', align: 'right' as const, render: (u: any) => fmtMoney(u.quantity * u.unitCost) }] : []),
      ]} />
      {data.length === 0 && <Badge tone="neutral">Kayıt yok</Badge>}
    </Modal>
  );
}
const u0 = (d: any[]) => d.length > 0 && d[0].unitCost !== undefined;
