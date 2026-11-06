import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { api } from '../lib/api';
import { Avatar, Badge, Card, Field, PageHeader } from '../components/ui';
import { ROLE_LABELS } from '../lib/labels';

export default function Profile() {
  const { user, logout } = useAuth();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const change = useAction(() => api('/auth/change-password', { body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }), { success: 'Şifreniz güncellendi', onSuccess: () => setPw({ currentPassword: '', newPassword: '', confirm: '' }) });
  if (!user) return null;
  return (
    <div>
      <PageHeader title="Profilim" />
      <div className="grid g-2">
        <Card>
          <div className="row" style={{ gap: 16 }}>
            <Avatar name={user.name} size="lg" />
            <div>
              <h2>{user.name}</h2>
              <div className="muted">{user.email}</div>
              <div className="row-wrap mt-1" style={{ gap: 4 }}>{user.roles.map((r) => <Badge key={r} tone="info" plain>{ROLE_LABELS[r]}</Badge>)}</div>
            </div>
          </div>
          <div className="divider" />
          <div className="stack small" style={{ gap: 6 }}>
            {user.phone && <div><span className="muted">Telefon:</span> {user.phone}</div>}
            {user.title && <div><span className="muted">Unvan:</span> {user.title}</div>}
            {user.customer && <div><span className="muted">Müşteri kaydı:</span> {user.customer.name}</div>}
          </div>
          <button className="btn mt-3" style={{ color: 'var(--danger)' }} onClick={logout}>Çıkış yap</button>
        </Card>
        <Card title="Şifre değiştir">
          <div className="stack">
            <Field label="Mevcut şifre"><input className="input" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="Yeni şifre" hint="En az 8 karakter"><input className="input" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <Field label="Yeni şifre (tekrar)"><input className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <div><button className="btn btn-primary" disabled={pw.newPassword.length < 8 || pw.newPassword !== pw.confirm} onClick={() => change.mutate(undefined)}>Güncelle</button></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
