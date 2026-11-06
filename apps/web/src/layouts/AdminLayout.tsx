import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Ship, Wrench, ClipboardList, CalendarDays, HardHat, ClipboardCheck, FileText, Hammer, Package, Users, Receipt,
  FolderOpen, Bell, BarChart3, ShieldCheck, Settings, Menu, Search, LogOut, ChevronDown, UserCircle2,
} from 'lucide-react';
import type { Permission } from '@nexus/shared';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { LogoMark } from '../components/brand';
import { Avatar } from '../components/ui';
import { ROLE_LABELS } from '../lib/labels';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Ship;
  perm: Permission[];
  section?: string;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Ana Sayfa', icon: LayoutDashboard, perm: ['dashboard.view'], section: 'Genel' },
  { to: '/vessels', label: 'Tekneler', icon: Ship, perm: ['vessels.view'] },
  { to: '/maintenance', label: 'Bakım Yönetimi', icon: Wrench, perm: ['maintenance.view'] },
  { to: '/work-orders', label: 'İş Emirleri', icon: ClipboardList, perm: ['workorders.view'] },
  { to: '/calendar', label: 'Takvim', icon: CalendarDays, perm: ['calendar.view'] },
  { to: '/technicians', label: 'Teknisyenler', icon: HardHat, perm: ['technicians.view'], section: 'Teknik' },
  { to: '/inspections', label: 'Dijital Denetimler', icon: ClipboardCheck, perm: ['inspections.view'] },
  { to: '/reports', label: 'Teknik Raporlar', icon: FileText, perm: ['reports.manage'] },
  { to: '/projects', label: 'Restorasyon Projeleri', icon: Hammer, perm: ['projects.manage'] },
  { to: '/inventory', label: 'Stok ve Malzemeler', icon: Package, perm: ['inventory.view'] },
  { to: '/customers', label: 'Müşteriler', icon: Users, perm: ['customers.view'], section: 'Ticari' },
  { to: '/finance', label: 'Teklifler ve Finans', icon: Receipt, perm: ['finance.view'] },
  { to: '/documents', label: 'Belgeler ve Sözleşmeler', icon: FolderOpen, perm: ['documents.manage'] },
  { to: '/notifications', label: 'Bildirimler', icon: Bell, perm: ['notifications.view'], section: 'Sistem' },
  { to: '/analytics', label: 'Yönetim Raporları', icon: BarChart3, perm: ['analytics.view'] },
  { to: '/users', label: 'Kullanıcı ve Rol Yönetimi', icon: ShieldCheck, perm: ['users.manage'] },
  { to: '/settings', label: 'Sistem Ayarları', icon: Settings, perm: ['settings.manage'] },
];

export function useUnread() {
  return useApi<{ unread: number }>('/notifications/unread-count', undefined, { refetchInterval: 30_000 }).data?.unread ?? 0;
}

export default function AdminLayout() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const loc = useLocation();
  const nav = useNavigate();
  const unread = useUnread();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const h = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const items = NAV.filter((n) => can(...n.perm));
  let lastSection = '';

  return (
    <div className="app">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" style={{ background: 'none' }}>
            <LogoMark />
          </div>
          <div className="brand-text">
            <b>NEXUS MARINE</b>
            <span>Yacht Operations</span>
          </div>
        </div>
        <nav className="nav">
          {items.map((n) => {
            const head = n.section && n.section !== lastSection ? n.section : null;
            if (n.section) lastSection = n.section;
            return (
              <div key={n.to}>
                {head && <div className="nav-section">{head}</div>}
                <NavLink to={n.to} end={n.to === '/'}>
                  <n.icon />
                  {n.label}
                  {n.to === '/notifications' && unread > 0 && <span className="count">{unread}</span>}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">© {new Date().getFullYear()} Nexus Marine · v1.0</div>
      </aside>
      <div className={`backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menü">
            <Menu size={19} />
          </button>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) nav(`/search?q=${encodeURIComponent(search.trim())}`);
            }}
          >
            <Search />
            <input placeholder="Tekne, iş emri, müşteri ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <div className="topbar-right">
            <button className="icon-btn" onClick={() => nav('/notifications')} aria-label="Bildirimler">
              <Bell size={18} />
              {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <div style={{ position: 'relative' }} ref={menuRef}>
              <div className="user-chip" onClick={() => setMenu((m) => !m)}>
                <Avatar name={user?.name} />
                <div className="meta">
                  <b>{user?.name}</b>
                  <span>{user?.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span>
                </div>
                <ChevronDown size={15} className="muted" />
              </div>
              {menu && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 50, width: 220, padding: 6, zIndex: 50 }}>
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setMenu(false); nav('/profile'); }}>
                    <UserCircle2 /> Profilim
                  </button>
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger)' }} onClick={logout}>
                    <LogOut /> Çıkış yap
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
