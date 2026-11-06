import { useEffect, useState } from 'react';
import { Save, Play } from 'lucide-react';
import { CURRENCIES } from '@nexus/shared';
import { useApi, useAction } from '../lib/hooks';
import { api } from '../lib/api';
import { Card, Field, Loading, PageHeader } from '../components/ui';

export default function Settings() {
  const { data } = useApi<any>('/settings');
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (data) setS(structuredClone(data)); }, [data]);
  const save = useAction(() => api('/settings', { method: 'PUT', body: s }), { success: 'Ayarlar kaydedildi' });
  const run = useAction(() => api('/admin/run-jobs', { body: {} }), { success: 'Zamanlanmış kontroller çalıştırıldı' });
  if (!s) return <Loading />;
  const set = (g: string, k: string) => (e: any) => setS({ ...s, [g]: { ...s[g], [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value } });
  return (
    <div>
      <PageHeader title="Sistem Ayarları" actions={<><button className="btn" onClick={() => run.mutate(undefined)}><Play /> Hatırlatmaları şimdi çalıştır</button><button className="btn btn-primary" onClick={() => save.mutate(undefined)}><Save /> Kaydet</button></>} />
      <div className="grid g-2">
        <Card title="Firma bilgileri">
          <div className="form-grid">
            <Field label="Firma adı"><input className="input" value={s.company.name} onChange={set('company', 'name')} /></Field>
            <Field label="E-posta"><input className="input" value={s.company.email} onChange={set('company', 'email')} /></Field>
            <Field label="Telefon"><input className="input" value={s.company.phone} onChange={set('company', 'phone')} /></Field>
            <Field label="Vergi dairesi / no"><input className="input" value={s.company.taxNumber} onChange={set('company', 'taxNumber')} /></Field>
            <Field label="Adres" full><textarea className="textarea" value={s.company.address} onChange={set('company', 'address')} /></Field>
          </div>
        </Card>
        <Card title="Hatırlatma ve bildirim kuralları">
          <div className="form-grid">
            <Field label="Yaklaşan bakım uyarısı (gün önce)"><input className="input" type="number" value={s.reminders.upcomingMaintenanceDays} onChange={set('reminders', 'upcomingMaintenanceDays')} /></Field>
            <Field label="Motor saati uyarı eşiği (saat)"><input className="input" type="number" value={s.reminders.engineHoursThreshold} onChange={set('reminders', 'engineHoursThreshold')} /></Field>
          </div>
          <div className="notice mt-2">Sistem; gecikmiş bakımları otomatik işaretler, yaklaşan tarih ve motor saati bazlı bakımlar ile geciken iş emirleri için tekrar etmeyen bildirimler üretir.</div>
        </Card>
        <Card title="Finans varsayılanları">
          <div className="form-grid">
            <Field label="Varsayılan para birimi"><select className="select" value={s.finance.defaultCurrency} onChange={set('finance', 'defaultCurrency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Varsayılan KDV (%)"><input className="input" type="number" value={s.finance.defaultVatRate} onChange={set('finance', 'defaultVatRate')} /></Field>
          </div>
        </Card>
        <Card title="Rapor şablonu">
          <Field label="Rapor alt bilgi notu"><textarea className="textarea" value={s.reports.footerNote} onChange={set('reports', 'footerNote')} /></Field>
        </Card>
      </div>
    </div>
  );
}
