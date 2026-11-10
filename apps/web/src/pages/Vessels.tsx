import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Ship, Trash2 } from 'lucide-react';
import { useApi, useAction, useListState } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, type Column } from '../components/ui';
import { useCustomerOptions, usePeople } from '../lib/lookups';
import { fmtNum } from '../lib/format';

export default function Vessels() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [sp] = useSearchParams();
  const ls = useListState({ sort: 'name', order: 'asc' });
  const [marina, setMarina] = useState('');
  const [active, setActive] = useState(sp.get('active') ?? '');
  const [form, setForm] = useState<any | null>(sp.get('new') ? {} : null);
  const marinas = useApi<string[]>('/vessels/marinas').data ?? [];
  const { data, isLoading } = useApi<any>('/vessels', { ...ls.query, marina: marina || undefined, active: active || undefined });

  const cols: Column<any>[] = [
    { key: 'name', label: 'Tekne', sortable: true, render: (v) => (
      <div className="row">
        <div className="avatar" style={{ borderRadius: 10, background: 'var(--navy)', color: '#fff' }}><Ship size={16} /></div>
        <div><div className="cell-title">{v.name}</div><div className="cell-sub">{[v.make, v.model].filter(Boolean).join(' ')}</div></div>
      </div>
    ) },
    { key: 'type', label: 'Tip', render: (v) => v.type ?? '—' },
    { key: 'year', label: 'Yıl / Boy', sortable: true, render: (v) => `${v.year ?? '—'} · ${v.lengthM ? `${v.lengthM} m` : '—'}` },
    { key: 'marina', label: 'Marina', sortable: true, render: (v) => <div><div>{v.marina ?? '—'}</div><div className="cell-sub">{v.berth}</div></div> },
    { key: 'owner', label: 'Sahip / Kaptan', render: (v) => <div><div>{v.owner?.name ?? '—'}</div><div className="cell-sub">{v.members?.[0]?.user.name}</div></div> },
    { key: 'hours', label: 'Motor saati', align: 'right', render: (v) => <span className="mono">{v.engines?.length ? v.engines.filter((e: any) => !/jenerat/i.test(e.position)).map((e: any) => fmtNum(e.hours)).join(' / ') : '—'}</span> },
    { key: 'open', label: 'Durum', render: (v) => (
      <div className="row-wrap" style={{ gap: 4 }}>
        {!v.isActive && <Badge tone="neutral">Pasif</Badge>}
        {v._count.workOrders > 0 && <Badge tone="warn">{v._count.workOrders} açık iş</Badge>}
        {v._count.faults > 0 && <Badge tone="danger">{v._count.faults} arıza</Badge>}
        {v.isActive && !v._count.workOrders && !v._count.faults && <Badge tone="ok">Sorunsuz</Badge>}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Tekneler" sub={<>{data?.total ?? '…'} kayıtlı tekne{can('users.manage') && <> · Yeni tekneler, müşteri veya kaptan eklerken <a className="link" style={{ cursor: 'pointer' }} onClick={() => nav('/users?new=1')}>Kullanıcılar</a> bölümünden bağlanır.</>}</>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} placeholder="Tekne, marka, marina, sahip..." />
          <select className="select sm" style={{ width: 200 }} value={marina} onChange={(e) => setMarina(e.target.value)}>
            <option value="">Tüm marinalar</option>
            {marinas.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="select sm" style={{ width: 150 }} value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="">Tümü</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} sort={ls.sort} onSort={ls.onSort} onRowClick={(v) => nav(`/vessels/${v.id}`)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <VesselForm initial={form} onClose={() => setForm(null)} onSaved={(v) => nav(`/vessels/${v.id}`)} />}
    </div>
  );
}

export function VesselForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved?: (v: any) => void }) {
  const customers = useCustomerOptions();
  const captains = usePeople('CAPTAIN');
  const [v, setV] = useState<any>(() => ({
    name: '', type: 'Motoryat', make: '', model: '', year: '', lengthM: '', flag: 'Türkiye', marina: '', berth: '', ownerId: '', contactPhone: '', contactEmail: '', notes: '',
    ...initial,
    engines: initial.engines ?? [{ position: 'İskele Ana Makine', make: '', model: '', serialNumber: '', hours: 0 }, { position: 'Sancak Ana Makine', make: '', model: '', serialNumber: '', hours: 0 }, { position: 'Jeneratör', make: '', model: '', serialNumber: '', hours: 0 }],
    captainIds: initial.members?.filter((m: any) => m.relation === 'CAPTAIN').map((m: any) => m.user.id) ?? [],
    generatorInfo: initial.generatorInfo ?? {},
    batteryInfo: initial.batteryInfo ?? { service: {}, start: {} },
    equipment: initial.equipment ?? [],
  }));
  useEffect(() => { if (!initial.id && customers.length && !v.ownerId) setV((x: any) => ({ ...x, ownerId: '' })); }, [customers, initial.id, v.ownerId]);
  const set = (k: string) => (e: any) => setV({ ...v, [k]: e.target.value });
  const save = useAction(
    () => {
      const { id, owner, members, summary, createdAt, updatedAt, coverPhotoId, ...body } = v;
      const payload = { ...body, ownerId: body.ownerId || null, year: body.year || null, lengthM: body.lengthM || null, engines: body.engines.filter((e: any) => e.position).map((e: any) => ({ id: e.id, position: e.position, make: e.make, model: e.model, serialNumber: e.serialNumber, hours: Number(e.hours) || 0 })) };
      return id ? api(`/vessels/${id}`, { method: 'PUT', body: payload }) : api('/vessels', { body: payload });
    },
    { success: 'Tekne kaydedildi', onSuccess: (r) => { onClose(); onSaved?.(r); } },
  );
  const setEngine = (i: number, k: string, val: string) => setV({ ...v, engines: v.engines.map((e: any, j: number) => (j === i ? { ...e, [k]: val } : e)) });
  const setEquip = (i: number, k: string, val: string) => setV({ ...v, equipment: v.equipment.map((e: any, j: number) => (j === i ? { ...e, [k]: val } : e)) });
  return (
    <Modal open onClose={onClose} size="lg" title={initial.id ? `${initial.name} — Düzenle` : 'Yeni Tekne Kaydı'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!v.name || save.isPending} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <h3 className="mb-2">Genel bilgiler</h3>
      <div className="form-grid cols-3">
        <Field label="Tekne adı *"><input className="input" value={v.name} onChange={set('name')} placeholder="M/Y ..." /></Field>
        <Field label="Tekne tipi"><select className="select" value={v.type ?? ''} onChange={set('type')}>{['Motoryat', 'Süperyat', 'Yelkenli', 'Katamaran', 'Gulet', 'Sürat teknesi'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Bayrak"><input className="input" value={v.flag ?? ''} onChange={set('flag')} /></Field>
        <Field label="Marka"><input className="input" value={v.make ?? ''} onChange={set('make')} /></Field>
        <Field label="Model"><input className="input" value={v.model ?? ''} onChange={set('model')} /></Field>
        <Field label="Üretim yılı"><input className="input" type="number" value={v.year ?? ''} onChange={set('year')} /></Field>
        <Field label="Uzunluk (m)"><input className="input" type="number" step="0.1" value={v.lengthM ?? ''} onChange={set('lengthM')} /></Field>
        <Field label="Marina"><input className="input" value={v.marina ?? ''} onChange={set('marina')} /></Field>
        <Field label="Bağlama noktası"><input className="input" value={v.berth ?? ''} onChange={set('berth')} /></Field>
        <Field label="Tekne sahibi (müşteri)"><select className="select" value={v.ownerId ?? ''} onChange={set('ownerId')}><option value="">— Seçin —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="İletişim telefonu"><input className="input" value={v.contactPhone ?? ''} onChange={set('contactPhone')} /></Field>
        <Field label="İletişim e-posta"><input className="input" value={v.contactEmail ?? ''} onChange={set('contactEmail')} /></Field>
        <Field label="Kaptan(lar)" full>
          <div className="row-wrap">
            {captains.map((c) => (
              <label key={c.id} className="checkbox small" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
                <input type="checkbox" checked={v.captainIds.includes(c.id)} onChange={(e) => setV({ ...v, captainIds: e.target.checked ? [...v.captainIds, c.id] : v.captainIds.filter((x: string) => x !== c.id) })} />
                {c.name}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="divider" />
      <div className="row mb-2"><h3>Motorlar ve çalışma saatleri</h3><span className="spacer" /><button className="btn btn-sm" onClick={() => setV({ ...v, engines: [...v.engines, { position: '', make: '', model: '', serialNumber: '', hours: 0 }] })}><Plus /> Motor</button></div>
      {v.engines.map((e: any, i: number) => (
        <div key={i} className="form-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 0.8fr auto', marginBottom: 8 }}>
          <input className="input sm" placeholder="Konum" value={e.position} onChange={(x) => setEngine(i, 'position', x.target.value)} />
          <input className="input sm" placeholder="Marka" value={e.make ?? ''} onChange={(x) => setEngine(i, 'make', x.target.value)} />
          <input className="input sm" placeholder="Model" value={e.model ?? ''} onChange={(x) => setEngine(i, 'model', x.target.value)} />
          <input className="input sm" placeholder="Seri no" value={e.serialNumber ?? ''} onChange={(x) => setEngine(i, 'serialNumber', x.target.value)} />
          <input className="input sm" type="number" placeholder="Saat" value={e.hours} onChange={(x) => setEngine(i, 'hours', x.target.value)} />
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setV({ ...v, engines: v.engines.filter((_: any, j: number) => j !== i) })}><Trash2 /></button>
        </div>
      ))}
      <div className="divider" />
      <h3 className="mb-2">Jeneratör ve akü</h3>
      <div className="form-grid cols-3">
        <Field label="Jeneratör marka / model"><input className="input" value={[v.generatorInfo.make, v.generatorInfo.model].filter(Boolean).join(' ')} onChange={(e) => { const [make, ...rest] = e.target.value.split(' '); setV({ ...v, generatorInfo: { ...v.generatorInfo, make, model: rest.join(' ') } }); }} /></Field>
        <Field label="Jeneratör gücü (kW)"><input className="input" type="number" value={v.generatorInfo.powerKw ?? ''} onChange={(e) => setV({ ...v, generatorInfo: { ...v.generatorInfo, powerKw: Number(e.target.value) } })} /></Field>
        <Field label="Akü montaj tarihi"><input className="input" type="date" value={v.batteryInfo.installedAt ?? ''} onChange={(e) => setV({ ...v, batteryInfo: { ...v.batteryInfo, installedAt: e.target.value } })} /></Field>
        <Field label="Servis aküsü (adet × Ah)"><input className="input" value={`${v.batteryInfo.service?.count ?? ''}${v.batteryInfo.service?.capacityAh ? ' × ' + v.batteryInfo.service.capacityAh : ''}`} onChange={(e) => { const [c, a] = e.target.value.split('×').map((s) => Number(s.trim())); setV({ ...v, batteryInfo: { ...v.batteryInfo, service: { ...v.batteryInfo.service, count: c || undefined, capacityAh: a || undefined } } }); }} placeholder="8 × 200" /></Field>
        <Field label="Akü tipi"><input className="input" value={v.batteryInfo.service?.type ?? ''} onChange={(e) => setV({ ...v, batteryInfo: { ...v.batteryInfo, service: { ...v.batteryInfo.service, type: e.target.value } } })} placeholder="AGM / Lityum" /></Field>
        <Field label="Sistem voltajı"><input className="input" type="number" value={v.batteryInfo.service?.voltage ?? ''} onChange={(e) => setV({ ...v, batteryInfo: { ...v.batteryInfo, service: { ...v.batteryInfo.service, voltage: Number(e.target.value) } } })} /></Field>
      </div>
      <div className="divider" />
      <div className="row mb-2"><h3>Ekipman envanteri</h3><span className="spacer" /><button className="btn btn-sm" onClick={() => setV({ ...v, equipment: [...v.equipment, { name: '', make: '', model: '', serial: '' }] })}><Plus /> Ekipman</button></div>
      {v.equipment.map((e: any, i: number) => (
        <div key={i} className="form-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr auto', marginBottom: 8 }}>
          <input className="input sm" placeholder="Ekipman" value={e.name} onChange={(x) => setEquip(i, 'name', x.target.value)} />
          <input className="input sm" placeholder="Marka" value={e.make ?? ''} onChange={(x) => setEquip(i, 'make', x.target.value)} />
          <input className="input sm" placeholder="Model" value={e.model ?? ''} onChange={(x) => setEquip(i, 'model', x.target.value)} />
          <input className="input sm" placeholder="Seri no" value={e.serial ?? ''} onChange={(x) => setEquip(i, 'serial', x.target.value)} />
          <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setV({ ...v, equipment: v.equipment.filter((_: any, j: number) => j !== i) })}><Trash2 /></button>
        </div>
      ))}
      <div className="divider" />
      <Field label="Dahili notlar"><textarea className="textarea" value={v.notes ?? ''} onChange={set('notes')} /></Field>
    </Modal>
  );
}
