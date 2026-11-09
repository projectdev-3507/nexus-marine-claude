import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Wrench, CalendarDays, FolderOpen, UserCircle2, Bell, LogOut, Receipt } from 'lucide-react';
import { useAuth } from '../lib/auth';
import '../styles/portal.css';
import { Logo } from '../components/brand';
import { Avatar } from '../components/ui';
import { useUnread } from './AdminLayout';

/** Müşteri portalı — tekne sahibi ve kaptanlar için sade, mobil öncelikli arayüz */
export default function PortalLayout() {
  const { user, logout, can } = useAuth();
  const unread = useUnread();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const quotes = can('quotes.respond');
  const tabs = [
    { to: '/', label: 'Teknem', icon: Home, match: (p: string) => p === '/' },
    { to: '/maintenance', label: 'Bakımlar', icon: Wrench, match: (p: string) => /^\/(maintenance|request|work-orders)/.test(p) },
    { to: '/calendar', label: 'Takvim', icon: CalendarDays, match: (p: string) => p.startsWith('/calendar') },
    quotes
      ? { to: '/quotes', label: 'Teklifler', icon: Receipt, match: (p: string) => /^\/(quotes|documents|reports)/.test(p) }
      : { to: '/documents', label: 'Belgeler', icon: FolderOpen, match: (p: string) => /^\/(documents|reports)/.test(p) },
    { to: '/profile', label: 'Profil', icon: UserCircle2, match: (p: string) => p.startsWith('/profile') },
  ];
  const link = (t: (typeof tabs)[number]) => (
    <NavLink key={t.to} to={t.to} className={() => (t.match(pathname) ? 'active' : '')}>
      <span className="ti"><t.icon /></span>
      <span className="tl">{t.label}</span>
    </NavLink>
  );
  return (
    <div className="portal-shell">
      <header className="portal-top">
        <div className="inner">
          <Logo sub="Müşteri Portalı" />
          <nav className="portal-nav">{tabs.map(link)}</nav>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <button className="icon-btn glass" onClick={() => nav('/notifications')} aria-label="Bildirimler">
              <Bell size={18} />
              {unread > 0 && <span className="dot">{unread}</span>}
            </button>
            <Avatar name={user?.name} />
            <button className="icon-btn glass" onClick={logout} aria-label="Çıkış">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="portal-content" key={pathname.split('/')[1]}>
        <Outlet />
      </main>
      <nav className="bottom-tabs">{tabs.map(link)}</nav>
    </div>
  );
}
