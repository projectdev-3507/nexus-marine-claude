import { useState } from 'react';
import { ShieldCheck, Smartphone, Ship } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo, YachtArt } from '../components/brand';

const DEMO = [
  ['admin@nexusmarine.com', 'Süper Admin'],
  ['operasyon@nexusmarine.com', 'Operasyon Yöneticisi'],
  ['teknisyen@nexusmarine.com', 'Teknisyen'],
  ['kaptan@nexusmarine.com', 'Kaptan'],
  ['musteri@nexusmarine.com', 'Tekne Sahibi'],
] as const;

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const showDemo = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === 'true';

  const submit = async (e?: React.FormEvent, creds?: [string, string]) => {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(creds?.[0] ?? email, creds?.[1] ?? password);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <Logo sub="Yacht Operations Platform" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2>Teknik operasyonlarınız tek platformda.</h2>
          <p>Bakım, servis, denetim, restorasyon ve müşteri süreçlerini web, iOS ve Android üzerinden gerçek zamanlı yönetin.</p>
          <div className="row-wrap mt-3" style={{ gap: 18, color: '#b9cde4', fontSize: 13 }}>
            <span className="row" style={{ gap: 6 }}><Ship size={16} /> Filo yönetimi</span>
            <span className="row" style={{ gap: 6 }}><ShieldCheck size={16} /> Rol bazlı erişim</span>
            <span className="row" style={{ gap: 6 }}><Smartphone size={16} /> Mobil uyumlu</span>
          </div>
        </div>
        <YachtArt className="login-yacht" />
        <style>{`.login-yacht{position:absolute;left:0;right:0;bottom:0;width:100%;height:46%;opacity:.9}`}</style>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <div>
            <h1>Giriş yapın</h1>
            <p className="muted mt-1">Nexus Marine hesabınızla oturum açın.</p>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="field">
            <label>E-posta</label>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Şifre</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary" style={{ height: 44 }} disabled={busy}>
            {busy ? 'Giriş yapılıyor...' : 'Giriş yap'}
          </button>
          {showDemo && (
            <div>
              <div className="xs muted mb-2" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>Demo hesaplar (şifre: Nexus2026!)</div>
              <div className="demo-accounts">
                {DEMO.map(([e, r]) => (
                  <button type="button" key={e} onClick={() => submit(undefined, [e, 'Nexus2026!'])}>
                    <b>{r}</b>
                    <span className="muted">{e}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
