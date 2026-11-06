import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, Wrench, MessageSquarePlus, FolderOpen, UserCircle2, Bell, LogOut, Receipt } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/brand';
import { Avatar } from '../components/ui';
import { useUnread } from './AdminLayout';

/** Müşteri portalı — tekne sahibi ve kaptanlar için sade, mobil öncelikli arayüz */
export default function PortalLayout() {
  const { user, logout, can } = useAuth();
  const unread = useUnread();
  const nav = useNavigate();
  const tabs = [
    { to: '/', label: 'Teknem', icon: Home, end: true },
    { to: '/maintenance', label: 'Bakımlar', icon: Wrench },
    { to: '/request', label: 'Servis Talebi', icon: MessageSquarePlus },
    ...(can('quotes.respond') ? [{ to: '/quotes', label: 'Teklifler', icon: Receipt }] : []),
    { to: '/documents', label: 'Belgeler', icon: FolderOpen },
    { to: '/profile', label: 'Profil', icon: UserCircle2 },
  ];
  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="portal-top">
        <div className="inner">
          <Logo sub="Müşteri Portalı" />
          <nav className="portal-nav">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}>
                <t.icon />
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="icon-btn" style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.12)', color: '#fff' }} onClick={() => nav('/notifications')} aria-label="Bildirimler">
              <Bell size={18} />
              {unread > 0 && <span className="dot">{unread}</span>}
            </button>
            <Avatar name={user?.name} />
            <button className="icon-btn" style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.12)', color: '#fff' }} onClick={logout} aria-label="Çıkış">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="portal-content">
        <Outlet />
      </main>
      <nav className="bottom-tabs">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <t.icon />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
