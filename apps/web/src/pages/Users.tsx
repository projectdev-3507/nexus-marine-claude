import { useState } from 'react';
import { Plus, KeyRound, ShieldCheck } from 'lucide-react';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS, type Role } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { api } from '../lib/api';
import { Avatar, Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, Tabs, type Column } from '../components/ui';
import { useCustomerOptions, useVesselOptions } from '../lib/lookups';
import { relTime } from '../lib/format';
import { ROLE_LABELS } from '../lib/labels';

const ROLE_TONE: Record<Role, any> = { SUPER_ADMIN: 'navy', OPERATIONS_MANAGER: 'violet', TECHNICIAN: 'info', CAPTAIN: 'warn', OWNER: 'ok' };

export default function Users() {
  const [tab, setTab] = useState<'users' | 'matrix' | 'audit'>('users');
  return (
    <div>
      <PageHeader title="Kullanıcı ve Rol Yönetimi" sub="Personel, kaptan ve müşteri hesapları · rol bazlı yetkilendirme" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Kullanıcılar' }, { key: 'matrix', label: 'Rol / Yetki Matrisi' }, { key: 'audit', label: 'İşlem Kayıtları' }]} />
      {tab === 'users' && <UserList />}
      {tab === 'matrix' && <Matrix />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

function UserList() {
  const ls = useListState();
  const [role, setRole] = useState('');
  const [form, setForm] = useState<any | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const { data, isLoading } = useApi<any>('/users', { ...ls.query, role: role || undefined });
  const reset = useAction((id: string) => api(`/users/${id}/reset-password`, { body: {} }), { onSuccess: (r) => setTemp(r.temporaryPassword) });
  const cols: Column<any>[] = [
    { key: 'n', label: 'Kullanıcı', render: (u) => <div className="row"><Avatar name={u.name} /><div><div className="cell-title">{u.name}</div><div className="cell-sub">{u.email}</div></div></div> },
    { key: 'r', label: 'Roller', render: (u) => <div className="row-wrap" style={{ gap: 4 }}>{u.roles.map((r: Role) => <Badge key={r} tone={ROLE_TONE[r]} plain>{ROLE_LABELS[r]}</Badge>)}</div> },
    { key: 'l', label: 'Tekne / müşteri ilişkisi', render: (u) => <div className="small">{u.customer && <div>Müşteri: {u.customer.name}</div>}{u.vesselLinks.map((l: any) => <div key={l.id} className="muted">{l.relation === 'CAPTAIN' ? 'Kaptan' : l.relation === 'OWNER' ? 'Sahip' : 'Mürettebat'}: {l.vessel.name}</div>)}{!u.customer && !u.vesselLinks.length && '—'}</div> },
    { key: 's', label: 'Durum', render: (u) => (u.isActive ? <Badge tone="ok">Aktif</Badge> : <Badge tone="neutral">Pasif</Badge>) },
    { key: 'll', label: 'Son giriş', render: (u) => (u.lastLoginAt ? relTime(u.lastLoginAt) : '—') },
    { key: 'a', label: '', align: 'right', render: (u) => <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); confirm(`${u.name} için geçici şifre oluşturulsun mu?`) && reset.mutate(u.id); }}><KeyRound /> Şifre sıfırla</button> },
  ];
  return (
    <>
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={ls.q} onChange={ls.setQ} />
          <select className="select sm" style={{ width: 200 }} value={role} onChange={(e) => setRole(e.target.value)}><option value="">Tüm roller</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={() => setForm({})}><Plus /> Yeni kullanıcı</button>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(u) => setForm(u)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <UserForm initial={form} onClose={() => setForm(null)} onTemp={setTemp} />}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Geçici şifre" footer={<button className="btn btn-primary" onClick={() => setTemp(null)}>Tamam</button>}>
        <p className="muted mb-2">Bu şifreyi kullanıcıya güvenli bir kanaldan iletin. Bu pencere kapandıktan sonra tekrar görüntülenemez.</p>
        <div className="input mono" style={{ display: 'flex', alignItems: 'center', fontSize: 18, fontWeight: 700, letterSpacing: '.05em' }}>{temp}</div>
      </Modal>
    </>
  );
}

function UserForm({ initial, onClose, onTemp }: { initial: any; onClose: () => void; onTemp: (p: string) => void }) {
  const customers = useCustomerOptions();
  const vessels = useVesselOptions();
  const [f, setF] = useState<any>({ email: '', name: '', phone: '', title: '', roles: ['TECHNICIAN'], customerId: '', isActive: true, password: '', ...initial, vesselLinks: initial.vesselLinks?.map((l: any) => ({ vesselId: l.vesselId ?? l.vessel?.id, relation: l.relation })) ?? [] });
  const [link, setLink] = useState({ vesselId: '', relation: 'CAPTAIN' });
  const save = useAction(() => {
    const body: any = { email: f.email, name: f.name, phone: f.phone || null, title: f.title || null, roles: f.roles, customerId: f.customerId || null, isActive: f.isActive, vesselLinks: f.vesselLinks };
    if (f.password) body.password = f.password;
    return f.id ? api(`/users/${f.id}`, { method: 'PUT', body }) : api('/users', { body });
  }, { success: 'Kullanıcı kaydedildi', onSuccess: (r) => { onClose(); if (r.temporaryPassword) onTemp(r.temporaryPassword); } });
  const toggleRole = (r: Role) => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x: Role) => x !== r) : [...f.roles, r] });
  return (
    <Modal open onClose={onClose} size="lg" title={f.id ? f.name : 'Yeni kullanıcı'} footer={<><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={!f.email || !f.name || !f.roles.length} onClick={() => save.mutate(undefined)}>Kaydet</button></>}>
      <div className="form-grid">
        <Field label="Ad soyad"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="E-posta"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Telefon"><input className="input" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Unvan"><input className="input" value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Roller (birden fazla seçilebilir)" full>
          <div className="row-wrap">{ROLES.map((r) => <label key={r} className="checkbox small" style={{ border: `1.5px solid ${f.roles.includes(r) ? 'var(--marine)' : 'var(--border)'}`, borderRadius: 9, padding: '6px 10px' }}><input type="checkbox" checked={f.roles.includes(r)} onChange={() => toggleRole(r)} />{ROLE_LABELS[r]}</label>)}</div>
        </Field>
        {f.roles.includes('OWNER') && <Field label="Bağlı müşteri kaydı *" hint="Tekne sahibi, bu müşteriye ait tüm tekneleri görür."><select className="select" value={f.customerId ?? ''} onChange={(e) => setF({ ...f, customerId: e.target.value })}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        <Field label={f.id ? 'Yeni şifre (boş bırakılabilir)' : 'Şifre (boşsa geçici şifre üretilir)'}><input className="input" type="password" value={f.password ?? ''} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Tekne ilişkileri" full hint="Kaptan ve mürettebat yalnızca ilişkilendirildiği tekneleri görür.">
          <div className="stack" style={{ gap: 6 }}>
            {f.vesselLinks.map((l: any, i: number) => <div key={i} className="row small"><Badge tone="info" plain>{l.relation === 'CAPTAIN' ? 'Kaptan' : l.relation === 'OWNER' ? 'Sahip' : 'Mürettebat'}</Badge>{vessels.find((v) => v.id === l.vesselId)?.name}<span className="spacer" /><button className="btn btn-sm btn-ghost" onClick={() => setF({ ...f, vesselLinks: f.vesselLinks.filter((_: any, j: number) => j !== i) })}>Kaldır</button></div>)}
            <div className="row">
              <select className="select sm" value={link.vesselId} onChange={(e) => setLink({ ...link, vesselId: e.target.value })}><option value="">Tekne seçin</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              <select className="select sm" style={{ width: 150 }} value={link.relation} onChange={(e) => setLink({ ...link, relation: e.target.value })}><option value="CAPTAIN">Kaptan</option><option value="OWNER">Ek sahip</option><option value="CREW">Mürettebat</option></select>
              <button className="btn btn-sm" disabled={!link.vesselId} onClick={() => { setF({ ...f, vesselLinks: [...f.vesselLinks, link] }); setLink({ vesselId: '', relation: 'CAPTAIN' }); }}><Plus /></button>
            </div>
          </div>
        </Field>
        <label className="checkbox"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Hesap aktif</label>
      </div>
    </Modal>
  );
}

const PERM_LABELS: Record<string, string> = {
  dashboard: 'Panel', vessels: 'Tekneler', maintenance: 'Bakım', workorders: 'İş emirleri', calendar: 'Takvim', technicians: 'Teknisyenler', inspections: 'Denetimler', reports: 'Raporlar', projects: 'Projeler', inventory: 'Stok', customers: 'Müşteriler', finance: 'Finans', quotes: 'Teklif yanıtı', documents: 'Belgeler', notifications: 'Bildirimler', analytics: 'Yönetim raporları', users: 'Kullanıcılar', settings: 'Ayarlar', faults: 'Arıza bildirimi',
};
const ACTION_LABELS: Record<string, string> = { view: 'görüntüle', manage: 'yönet', assign: 'ata', review: 'onayla', request: 'talep', execute: 'uygula', perform: 'doldur', approve: 'onayla', respond: 'yanıtla', report: 'bildir' };

function Matrix() {
  return (
    <Card pad={false}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Yetki</th>{ROLES.map((r) => <th key={r} style={{ textAlign: 'center' }}>{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>
            {PERMISSIONS.map((p) => {
              const [mod, act] = p.split('.');
              return (
                <tr key={p}>
                  <td><b>{PERM_LABELS[mod] ?? mod}</b> <span className="muted">· {ACTION_LABELS[act] ?? act}</span></td>
                  {ROLES.map((r) => <td key={r} style={{ textAlign: 'center' }}>{ROLE_PERMISSIONS[r].includes(p) ? <ShieldCheck size={16} color="var(--ok)" /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-body"><div className="notice">Yetkiler hem arayüzde hem API seviyesinde uygulanır. Kaptan ve tekne sahibi yalnızca ilişkilendirildikleri teknelere ait verilere erişebilir; dahili finans ve maliyet bilgileri müşteri tarafına hiçbir koşulda gönderilmez.</div></div>
    </Card>
  );
}

function Audit() {
  const { data } = useApi<any>('/users/audit', { pageSize: 100 });
  return (
    <Card pad={false}>
      <DataTable rows={data?.items ?? []} columns={[
        { key: 'd', label: 'Zaman', render: (a: any) => relTime(a.createdAt) },
        { key: 'u', label: 'Kullanıcı', render: (a: any) => a.user?.name ?? 'Sistem' },
        { key: 'a', label: 'İşlem', render: (a: any) => <span className="mono small">{a.action}</span> },
        { key: 'e', label: 'Kayıt', render: (a: any) => <span className="small muted">{a.entityType} {a.entityId?.slice(-6)}</span> },
      ]} />
    </Card>
  );
}
