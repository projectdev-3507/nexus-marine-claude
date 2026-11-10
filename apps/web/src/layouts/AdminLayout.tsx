import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Ship, Wrench, ClipboardList, CalendarDays, HardHat, ClipboardCheck, FileText, Hammer, Package, Users, Receipt,
  FolderOpen, Bell, BarChart3, ShieldCheck, Settings, Menu, Search, LogOut, ChevronDown, UserCircle2, Plus, Sun,
} from 'lucide-react';
import type { Permission } from '@nexus/shared';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { LogoMark } from '../components/brand';
import { Avatar } from '../components/ui';
import { ROLE_LABELS } from '../lib/labels';
import '../styles/simple.css';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Ship;
  perm: Permission[];
  section?: string;
}

/** Sade menü: en çok kullanılanlar üstte, kısa adlar. "Yönetim" grubu varsayılan olarak kapalı. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Ana Sayfa', icon: LayoutDashboard, perm: ['dashboard.view'], section: 'Günlük' },
  { to: '/work-orders', label: 'İş Emirleri', icon: ClipboardList, perm: ['workorders.view'] },
  { to: '/calendar', label: 'Takvim', icon: CalendarDays, perm: ['calendar.view'] },
  { to: '/vessels', label: 'Tekneler', icon: Ship, perm: ['vessels.view'] },
  { to: '/customers', label: 'Müşteriler', icon: Users, perm: ['customers.view'] },
  { to: '/maintenance', label: 'Bakım Planları', icon: Wrench, perm: ['maintenance.view'], section: 'Operasyon' },
  { to: '/technicians', label: 'Teknisyenler', icon: HardHat, perm: ['technicians.view'] },
  { to: '/inspections', label: 'Denetimler', icon: ClipboardCheck, perm: ['inspections.view'] },
  { to: '/reports', label: 'Raporlar ve Sözleşmeler', icon: FileText, perm: ['reports.manage'] },
  { to: '/projects', label: 'Projeler', icon: Hammer, perm: ['projects.manage'] },
  { to: '/inventory', label: 'Stok', icon: Package, perm: ['inventory.view'] },
  { to: '/finance', label: 'Teklifler ve Finans', icon: Receipt, perm: ['finance.view'], section: 'Ticari' },
  { to: '/documents', label: 'Belgeler', icon: FolderOpen, perm: ['documents.manage'] },
  { to: '/analytics', label: 'Yönetim Raporları', icon: BarChart3, perm: ['analytics.view'], section: 'Yönetim' },
  { to: '/users', label: 'Kullanıcılar', icon: ShieldCheck, perm: ['users.manage'] },
  { to: '/settings', label: 'Ayarlar', icon: Settings, perm: ['settings.manage'] },
];

/** Teknisyen menüsü: yalnızca sahada gereken ekranlar */
const TECH_NAV: NavItem[] = [
  { to: '/', label: 'Bugün', icon: Sun, perm: ['dashboard.view'] },
  { to: '/work-orders', label: 'İşlerim', icon: ClipboardList, perm: ['workorders.view'] },
  { to: '/calendar', label: 'Takvim', icon: CalendarDays, perm: ['calendar.view'] },
  { to: '/inspections', label: 'Denetimler', icon: ClipboardCheck, perm: ['inspections.view'] },
  { to: '/inventory', label: 'Stok', icon: Package, perm: ['inventory.view'] },
  { to: '/vessels', label: 'Tekneler', icon: Ship, perm: ['vessels.view'] },
];

/** "+ Yeni" menüsü — yetkiye göre */
const QUICK: Array<{ label: string; to: string; icon: typeof Ship; perm: Permission[] }> = [
  { label: 'İş emri', to: '/work-orders?new=1', icon: ClipboardList, perm: ['workorders.manage'] },
  { label: 'Bakım planı', to: '/maintenance?new=1', icon: Wrench, perm: ['maintenance.manage'] },
  { label: 'Denetim', to: '/inspections?new=1', icon: ClipboardCheck, perm: ['inspections.perform'] },
  { label: 'Müşteri / kullanıcı', to: '/users?new=1', icon: Users, perm: ['users.manage'] },
  { label: 'Rapor / sözleşme', to: '/reports?new=1', icon: FileText, perm: ['reports.manage'] },
];

export function useUnread() {
  return useApi<{ unread: number }>('/notifications/unread-count', undefined, { refetchInterval: 30_000 }).data?.unread ?? 0;
}

export const isTechOnly = (roles: string[] = [], manager = false) => !manager && roles.includes('TECHNICIAN');

const readCollapsed = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem('nav.collapsed') ?? '') ?? { Yönetim: true }; } catch { return { Yönetim: true }; }
};

export default function AdminLayout() {
  const { user, can, logout, manager } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const loc = useLocation();
  const nav = useNavigate();
  const unread = useUnread();
  const menuRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); setQuick(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuick(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const tech = isTechOnly(user?.roles, manager);
  const items = (tech ? TECH_NAV : NAV).filter((n) => can(...n.perm));
  const quickItems = QUICK.filter((q) => can(...q.perm));
  const toggle = (s: string) => setCollapsed((c) => { const n = { ...c, [s]: !c[s] }; try { localStorage.setItem('nav.collapsed', JSON.stringify(n)); } catch { /* yok say */ } return n; });

  // Bölümlere ayır
  const groups: Array<{ section: string; items: NavItem[] }> = [];
  for (const n of items) {
    if (n.section || !groups.length) groups.push({ section: n.section ?? '', items: [] });
    groups[groups.length - 1].items.push(n);
  }
  const activeIn = (g: { items: NavItem[] }) => g.items.some((n) => (n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)));

  // Telefon alt menüsü
  const bottom = [
    { to: '/', label: tech ? 'Bugün' : 'Ana Sayfa', icon: tech ? Sun : LayoutDashboard, end: true },
    { to: '/work-orders', label: tech ? 'İşlerim' : 'İşler', icon: ClipboardList },
    { to: '/calendar', label: 'Takvim', icon: CalendarDays },
    { to: '/notifications', label: 'Bildirim', icon: Bell, badge: unread },
  ];

  return (
    <div className={`app${tech ? ' tech' : ''}`}>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" style={{ background: 'none' }}>
            <LogoMark />
          </div>
          <div className="brand-text">
            <b>NEXUS MARINE</b>
            <span>{tech ? 'Teknisyen' : 'Yacht Operations'}</span>
          </div>
        </div>
        <nav className="nav">
          {groups.map((g) => {
            const isCollapsed = !!g.section && collapsed[g.section] && !activeIn(g);
            return (
              <div key={g.section || 'root'} className="nav-group">
                {g.section && (
                  <button className="nav-section nav-toggle" onClick={() => toggle(g.section)} aria-expanded={!isCollapsed}>
                    {g.section}
                    <ChevronDown size={14} style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined, transition: 'transform .15s' }} />
                  </button>
                )}
                {!isCollapsed && g.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                    <n.icon />
                    {n.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">© {new Date().getFullYear()} Nexus Marine · v1.1</div>
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
            <input placeholder="Ara: tekne, iş emri, müşteri…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <div className="topbar-right">
            {quickItems.length > 0 && (
              <div style={{ position: 'relative' }} ref={quickRef}>
                <button className="btn btn-primary quick-btn" onClick={() => setQuick((q) => !q)} aria-haspopup="menu" aria-expanded={quick}>
                  <Plus /> <span>Yeni</span>
                </button>
                {quick && (
                  <div className="card quick-menu" role="menu">
                    {quickItems.map((q) => (
                      <button key={q.to} className="quick-item" role="menuitem" onClick={() => nav(q.to)}>
                        <span className="qi-ic"><q.icon /></span> {q.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button className="icon-btn hide-sm" onClick={() => nav('/notifications')} aria-label="Bildirimler">
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
      <nav className="admin-tabs">
        {bottom.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <span className="ti"><t.icon />{!!t.badge && <i>{t.badge > 99 ? '99+' : t.badge}</i>}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)}>
          <span className="ti"><Menu /></span>
          <span>Menü</span>
        </button>
      </nav>
    </div>
  );
}
