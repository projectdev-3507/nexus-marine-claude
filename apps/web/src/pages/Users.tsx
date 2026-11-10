import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, KeyRound, ShieldCheck, Ship, Anchor, HardHat, Briefcase, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS, type Role } from '@nexus/shared';
import { useApi, useAction, useListState } from '../lib/hooks';
import { api } from '../lib/api';
import { Avatar, Badge, Card, DataTable, Field, Modal, PageHeader, Pager, SearchInput, Tabs, type Column } from '../components/ui';
import { useVesselOptions } from '../lib/lookups';
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
  const [sp, setSp] = useSearchParams();
  const [form, setFormState] = useState<any | null>(sp.get('new') ? {} : null);
  const setForm = (v: any) => { setFormState(v); if (!v && sp.get('new')) setSp({}, { replace: true }); };
  useEffect(() => { if (sp.get('new')) setFormState((f: any) => f ?? {}); }, [sp]);
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
          <button className="btn btn-primary btn-sm" onClick={() => setForm({})}><Plus /> Yeni kullanıcı / müşteri</button>
        </div>
        <DataTable columns={cols} rows={data?.items ?? []} loading={isLoading} onRowClick={(u) => setForm(u)} />
        {data && <Pager page={ls.page} pageSize={25} total={data.total} onPage={ls.setPage} />}
      </Card>
      {form && <UserWizard initial={form} onClose={() => setForm(null)} onTemp={setTemp} />}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="Geçici şifre" footer={<button className="btn btn-primary" onClick={() => setTemp(null)}>Tamam</button>}>
        <p className="muted mb-2">Bu şifreyi kullanıcıya güvenli bir kanaldan iletin. Bu pencere kapandıktan sonra tekrar görüntülenemez.</p>
        <div className="input mono" style={{ display: 'flex', alignItems: 'center', fontSize: 18, fontWeight: 700, letterSpacing: '.05em' }}>{temp}</div>
      </Modal>
    </>
  );
}

/** Kullanıcı türleri — sihirbazın ilk adımı */
const KINDS: Array<{ role: Role; title: string; text: string; icon: typeof Ship }> = [
  { role: 'OWNER', title: 'Tekne sahibi (müşteri)', text: 'Müşteri portalına girer, kendi teknelerini, bakımları ve teklifleri görür.', icon: Anchor },
  { role: 'CAPTAIN', title: 'Kaptan', text: 'Sorumlu olduğu teknelerin bakım ve servislerini takip eder, talep açar.', icon: Ship },
  { role: 'TECHNICIAN', title: 'Teknisyen', text: 'Kendisine atanan işleri görür, başlatır, fotoğraf ekler, bitirir.', icon: HardHat },
  { role: 'OPERATIONS_MANAGER', title: 'Operasyon yöneticisi', text: 'İş emirlerini planlar, teknisyen atar, işleri onaylar.', icon: Briefcase },
  { role: 'SUPER_ADMIN', title: 'Süper admin', text: 'Tüm yetkiler: kullanıcılar, ayarlar ve finans dahil.', icon: ShieldCheck },
];
const primaryRole = (roles: Role[] = []): Role => (['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'TECHNICIAN', 'OWNER', 'CAPTAIN'] as Role[]).find((r) => roles.includes(r)) ?? 'TECHNICIAN';
const BLANK_VESSEL = { name: '', type: 'Motoryat', make: '', model: '', year: '', lengthM: '', marina: '', berth: '' };

function UserWizard({ initial, onClose, onTemp }: { initial: any; onClose: () => void; onTemp: (p: string) => void }) {
  const editing = !!initial.id;
  const detail = useApi<any>(editing ? `/users/${initial.id}/setup` : null).data;
  const vessels = useVesselOptions();
  const [step, setStep] = useState(editing ? 1 : 0);
  const [f, setF] = useState<any>(null);
  const [q, setQ] = useState('');
  const [nv, setNv] = useState<any | null>(null);

  // Düzenlemede mevcut bilgileri yükle
  if (!f && (!editing || detail)) {
    const d = detail ?? {};
    const role = editing ? primaryRole(d.roles) : 'OWNER';
    setF({
      role, name: d.name ?? '', email: d.email ?? '', phone: d.phone ?? '', title: d.title ?? '', password: '', isActive: d.isActive ?? true,
      company: d.company ?? '', taxNumber: d.taxNumber ?? '', address: d.address ?? '',
      vesselIds: role === 'OWNER' ? d.ownedVesselIds ?? [] : d.captainVesselIds ?? [], newVessels: [],
    });
  }
  const save = useAction(() => {
    const client = f.role === 'OWNER' || f.role === 'CAPTAIN';
    const body: any = {
      id: initial.id, role: f.role, name: f.name, email: f.email, phone: f.phone || null, title: f.title || null, isActive: f.isActive,
      company: f.role === 'OWNER' ? f.company || null : null, taxNumber: f.role === 'OWNER' ? f.taxNumber || null : null, address: f.role === 'OWNER' ? f.address || null : null,
      vesselIds: client ? f.vesselIds : [], newVessels: client ? f.newVessels.map((v: any) => ({ ...v, year: v.year || null, lengthM: v.lengthM || null })) : [],
    };
    if (f.password) body.password = f.password;
    return api('/users/setup', { body });
  }, { success: editing ? 'Kullanıcı güncellendi' : 'Kullanıcı oluşturuldu', onSuccess: (r) => { onClose(); if (r.temporaryPassword) onTemp(r.temporaryPassword); } });

  if (!f) return <Modal open onClose={onClose} title="Yükleniyor…"><div className="muted">Bilgiler alınıyor…</div></Modal>;
  const kind = KINDS.find((k) => k.role === f.role)!;
  const client = f.role === 'OWNER' || f.role === 'CAPTAIN';
  const steps = ['Kullanıcı türü', 'Kişi bilgileri', ...(client ? ['Tekneler'] : [])];
  const last = step === steps.length - 1;
  const infoOk = f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && (!f.password || f.password.length >= 8);
  const canNext = step === 0 || (step === 1 ? infoOk : true);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const toggleVessel = (id: string) => setF({ ...f, vesselIds: f.vesselIds.includes(id) ? f.vesselIds.filter((x: string) => x !== id) : [...f.vesselIds, id] });
  const filtered = vessels.filter((v: any) => !q || `${v.name} ${v.marina ?? ''} ${v.owner?.name ?? ''}`.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  const selected = vessels.filter((v) => f.vesselIds.includes(v.id));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `${f.name || 'Kullanıcı'} · düzenle` : 'Yeni kullanıcı'}
      footer={
        <>
          {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}><ChevronLeft /> Geri</button> : <button className="btn" onClick={onClose}>Vazgeç</button>}
          <span className="spacer" />
          {last
            ? <button className="btn btn-primary" disabled={!infoOk || save.isPending} onClick={() => save.mutate(undefined)}><Check /> {editing ? 'Kaydet' : 'Kullanıcıyı oluştur'}</button>
            : <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>İleri <ChevronRight /></button>}
        </>
      }
    >
      <div className="wiz-steps">
        {steps.map((s, i) => (
          <button key={s} className={`${i === step ? 'active' : ''}${i < step ? ' done' : ''}`} disabled={i > step && !(i === 2 && infoOk)} onClick={() => (i <= step || infoOk) && setStep(i)}>
            <i>{i < step ? <Check size={12} /> : i + 1}</i> {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="kind-grid">
          {KINDS.map((k) => (
            <button key={k.role} className={`kind${f.role === k.role ? ' active' : ''}`} onClick={() => { setF({ ...f, role: k.role, vesselIds: k.role === f.role ? f.vesselIds : [] }); }} onDoubleClick={() => setStep(1)}>
              <span className="kind-ic"><k.icon /></span>
              <b>{k.title}</b>
              <span>{k.text}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <div className="kind-chip"><kind.icon size={16} /> {kind.title}{editing && <button className="link" onClick={() => setStep(0)}>Değiştir</button>}</div>
          <div className="form-grid">
            <Field label="Ad soyad *"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
            <Field label="E-posta *" hint="Giriş için kullanılır."><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Telefon"><input className="input" value={f.phone} onChange={set('phone')} placeholder="+90 5xx xxx xx xx" /></Field>
            {f.role === 'OWNER'
              ? <Field label="Firma (varsa)" hint="Boşsa müşteri kaydı kişi adıyla açılır."><input className="input" value={f.company} onChange={set('company')} /></Field>
              : <Field label="Unvan"><input className="input" value={f.title} onChange={set('title')} placeholder={f.role === 'TECHNICIAN' ? 'Ör. Elektrik Teknisyeni' : f.role === 'CAPTAIN' ? 'Ör. Kaptan' : ''} /></Field>}
            {f.role === 'OWNER' && (
              <>
                <Field label="Vergi no"><input className="input" value={f.taxNumber} onChange={set('taxNumber')} /></Field>
                <Field label="Adres"><input className="input" value={f.address} onChange={set('address')} /></Field>
              </>
            )}
            <Field label={editing ? 'Yeni şifre (boş bırakılabilir)' : 'Şifre (boş bırakırsanız geçici şifre üretilir)'} hint="En az 8 karakter."><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
            {editing && <label className="checkbox" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Hesap aktif</label>}
          </div>
        </div>
      )}

      {step === 2 && client && (
        <div className="stack">
          <div className="notice">
            <Ship />
            <div>{f.role === 'OWNER' ? 'Bu müşterinin sahibi olduğu tekneleri seçin veya yeni tekne ekleyin. Birden fazla tekne seçebilirsiniz.' : 'Bu kaptanın sorumlu olduğu tekneleri seçin veya yeni tekne ekleyin. Birden fazla tekne seçebilirsiniz.'}</div>
          </div>

          {(selected.length > 0 || f.newVessels.length > 0) && (
            <div className="sel-vessels">
              {selected.map((v) => <span key={v.id} className="sv"><Ship size={13} /> {v.name}<button onClick={() => toggleVessel(v.id)} aria-label="Kaldır"><X size={12} /></button></span>)}
              {f.newVessels.map((v: any, i: number) => <span key={`n${i}`} className="sv new"><Plus size={13} /> {v.name} <em>yeni</em><button onClick={() => setF({ ...f, newVessels: f.newVessels.filter((_: any, j: number) => j !== i) })} aria-label="Kaldır"><X size={12} /></button></span>)}
            </div>
          )}

          {nv ? (
            <div className="card card-pad new-vessel">
              <b className="mb-1" style={{ display: 'block' }}>Yeni tekne</b>
              <div className="form-grid">
                <Field label="Tekne adı *"><input className="input" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} placeholder="Ör. M/Y DENİZ" autoFocus /></Field>
                <Field label="Tip"><select className="select" value={nv.type} onChange={(e) => setNv({ ...nv, type: e.target.value })}>{['Motoryat', 'Yelkenli', 'Katamaran', 'Gulet', 'Süperyat'].map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Marka"><input className="input" value={nv.make} onChange={(e) => setNv({ ...nv, make: e.target.value })} placeholder="Ör. Princess" /></Field>
                <Field label="Model"><input className="input" value={nv.model} onChange={(e) => setNv({ ...nv, model: e.target.value })} placeholder="Ör. Y85" /></Field>
                <Field label="Yıl"><input className="input" type="number" value={nv.year} onChange={(e) => setNv({ ...nv, year: e.target.value })} /></Field>
                <Field label="Boy (m)"><input className="input" type="number" step="0.1" value={nv.lengthM} onChange={(e) => setNv({ ...nv, lengthM: e.target.value })} /></Field>
                <Field label="Marina"><input className="input" value={nv.marina} onChange={(e) => setNv({ ...nv, marina: e.target.value })} /></Field>
                <Field label="Bağlama yeri"><input className="input" value={nv.berth} onChange={(e) => setNv({ ...nv, berth: e.target.value })} /></Field>
              </div>
              <div className="row mt-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => setNv(null)}>Vazgeç</button>
                <button className="btn btn-sm btn-primary" disabled={!nv.name.trim()} onClick={() => { setF({ ...f, newVessels: [...f.newVessels, nv] }); setNv(null); }}><Plus /> Listeye ekle</button>
              </div>
            </div>
          ) : (
            <button className="btn add-vessel" onClick={() => setNv({ ...BLANK_VESSEL })}><Plus /> Yeni tekne ekle</button>
          )}

          <div className="vessel-pick">
            <div className="vp-head"><b>Kayıtlı tekneler</b><SearchInput value={q} onChange={setQ} placeholder="Tekne, marina veya sahip ara…" /></div>
            <div className="vp-list">
              {filtered.map((v: any) => {
                const on = f.vesselIds.includes(v.id);
                const otherOwner = f.role === 'OWNER' && v.owner && !(detail?.ownedVesselIds ?? []).includes(v.id);
                return (
                  <label key={v.id} className={`vp-item${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleVessel(v.id)} />
                    <div className="grow">
                      <b>{v.name}</b>
                      <span>{[v.marina, v.owner?.name && `Sahibi: ${v.owner.name}`].filter(Boolean).join(' · ') || '—'}</span>
                      {on && otherOwner && <small className="warn-text">Sahibi bu müşteriye geçecek</small>}
                    </div>
                  </label>
                );
              })}
              {!filtered.length && <div className="muted small" style={{ padding: 12 }}>Eşleşen tekne yok.</div>}
            </div>
          </div>
        </div>
      )}
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
