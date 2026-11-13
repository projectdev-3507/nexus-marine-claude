import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Permission } from '@nexus/shared';
import { useMaintCats } from './lib/maintCats';
import { useAuth } from './lib/auth';
import { Empty, Loading } from './components/ui';
import AdminLayout, { isTechOnly } from './layouts/AdminLayout';
import PortalLayout from './layouts/PortalLayout';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const TechHome = lazy(() => import('./pages/TechHome'));
const Vessels = lazy(() => import('./pages/Vessels'));
const VesselDetail = lazy(() => import('./pages/VesselDetail'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Technicians = lazy(() => import('./pages/Technicians'));
const Inspections = lazy(() => import('./pages/Inspections'));
const InspectionDetail = lazy(() => import('./pages/InspectionDetail'));
const Faults = lazy(() => import('./pages/Faults'));
const MaintenanceDetail = lazy(() => import('./pages/MaintenanceDetail'));
const FaultDetail = lazy(() => import('./pages/Faults').then((m) => ({ default: m.FaultDetail })));
const Reports = lazy(() => import('./pages/Reports'));
const ReportDetail = lazy(() => import('./pages/ReportDetail'));
const ProjectsList = lazy(() => import('./pages/Projects').then((m) => ({ default: m.ProjectsList })));
const ProjectDetail = lazy(() => import('./pages/Projects').then((m) => ({ default: m.ProjectDetail })));
const Inventory = lazy(() => import('./pages/Inventory'));
const CustomersList = lazy(() => import('./pages/Customers').then((m) => ({ default: m.CustomersList })));
const CustomerDetail = lazy(() => import('./pages/Customers').then((m) => ({ default: m.CustomerDetail })));
const Finance = lazy(() => import('./pages/Finance'));
const Collections = lazy(() => import('./pages/Collections'));
const QuoteDetail = lazy(() => import('./pages/Finance').then((m) => ({ default: m.QuoteDetail })));
const QuotesList = lazy(() => import('./pages/Finance').then((m) => ({ default: () => <m.QuotesList portal /> })));
const Documents = lazy(() => import('./pages/Documents'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));
const SearchPage = lazy(() => import('./pages/Search'));
const PortalHome = lazy(() => import('./pages/Portal').then((m) => ({ default: m.PortalHome })));
const PortalMaintenance = lazy(() => import('./pages/Portal').then((m) => ({ default: m.PortalMaintenance })));
const PortalRequest = lazy(() => import('./pages/Portal').then((m) => ({ default: m.PortalRequest })));
const PortalCalendar = lazy(() => import('./pages/PortalCalendar'));
const PortalOffers = lazy(() => import('./pages/PortalOffers'));

function Guard({ perm, children }: { perm: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(...perm)) return <Empty title="Erişim yetkiniz yok" text="Bu sayfayı görüntülemek için gerekli role sahip değilsiniz." />;
  return <>{children}</>;
}

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

export default function App() {
  const { user, loading, staff } = useAuth();
  useMaintCats(!!user);
  if (loading) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Loading /></div>;
  return (
    <BrowserRouter>
      {!user ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : staff ? (
        <Routes>
          <Route element={<AdminLayout />}>
            <Route index element={<S><HomeSwitch /></S>} />
            <Route path="vessels" element={<S><Guard perm={['vessels.view']}><Vessels /></Guard></S>} />
            <Route path="vessels/:id" element={<S><Guard perm={['vessels.view']}><VesselDetail /></Guard></S>} />
            <Route path="maintenance" element={<S><Guard perm={['maintenance.view']}><Maintenance /></Guard></S>} />
            <Route path="maintenance/:id" element={<S><Guard perm={['maintenance.view']}><MaintenanceDetail /></Guard></S>} />
            <Route path="work-orders" element={<S><Guard perm={['workorders.view']}><WorkOrders /></Guard></S>} />
            <Route path="work-orders/:id" element={<S><Guard perm={['workorders.view']}><WorkOrderDetail /></Guard></S>} />
            <Route path="calendar" element={<S><Guard perm={['calendar.view']}><CalendarPage /></Guard></S>} />
            <Route path="technicians" element={<S><Guard perm={['technicians.view']}><Technicians /></Guard></S>} />
            <Route path="inspections" element={<S><Guard perm={['inspections.view']}><Inspections /></Guard></S>} />
            <Route path="inspections/:id" element={<S><Guard perm={['inspections.view']}><InspectionDetail /></Guard></S>} />
            <Route path="faults" element={<S><Faults /></S>} />
            <Route path="faults/:id" element={<S><FaultDetail /></S>} />
            <Route path="reports" element={<S><Guard perm={['reports.manage']}><Reports key="reports" group="reports" /></Guard></S>} />
            <Route path="collections" element={<S><Guard perm={['finance.view']}><Collections /></Guard></S>} />
            <Route path="contracts" element={<S><Guard perm={['reports.manage']}><Reports key="contracts" group="contracts" /></Guard></S>} />
            <Route path="reports/:id" element={<S><Guard perm={['reports.manage', 'reports.view']}><ReportDetail /></Guard></S>} />
            <Route path="contracts/:id" element={<S><Guard perm={['reports.manage', 'reports.view']}><ReportDetail /></Guard></S>} />
            <Route path="projects" element={<S><Guard perm={['projects.manage']}><ProjectsList /></Guard></S>} />
            <Route path="projects/:id" element={<S><Guard perm={['projects.view']}><ProjectDetail /></Guard></S>} />
            <Route path="inventory" element={<S><Guard perm={['inventory.view']}><Inventory /></Guard></S>} />
            <Route path="customers" element={<S><Guard perm={['customers.view']}><CustomersList /></Guard></S>} />
            <Route path="customers/:id" element={<S><Guard perm={['customers.view']}><CustomerDetail /></Guard></S>} />
            <Route path="finance" element={<S><Guard perm={['finance.view']}><Finance /></Guard></S>} />
            <Route path="finance/quotes/:id" element={<S><Guard perm={['finance.view']}><QuoteDetail /></Guard></S>} />
            <Route path="quotes" element={<Navigate to="/finance" replace />} />
            <Route path="quotes/:id" element={<S><Guard perm={['finance.view']}><QuoteDetail /></Guard></S>} />
            <Route path="documents" element={<Navigate to="/contracts" replace />} />
            <Route path="notifications" element={<S><Notifications /></S>} />
            <Route path="analytics" element={<S><Guard perm={['analytics.view']}><Analytics /></Guard></S>} />
            <Route path="users" element={<S><Guard perm={['users.manage']}><Users /></Guard></S>} />
            <Route path="settings" element={<S><Guard perm={['settings.manage']}><Settings /></Guard></S>} />
            <Route path="profile" element={<S><Profile /></S>} />
            <Route path="search" element={<S><SearchPage /></S>} />
            <Route path="*" element={<Empty title="Sayfa bulunamadı" />} />
          </Route>
        </Routes>
      ) : (
        <Routes>
          <Route element={<PortalLayout />}>
            <Route index element={<S><PortalHome /></S>} />
            <Route path="maintenance" element={<S><PortalMaintenance /></S>} />
            <Route path="maintenance/:id" element={<S><MaintenanceDetail /></S>} />
            <Route path="request" element={<S><PortalRequest /></S>} />
            <Route path="documents" element={<S><PortalOffers /></S>} />
            <Route path="calendar" element={<S><PortalCalendar /></S>} />
            <Route path="quotes" element={<S><Guard perm={['quotes.respond']}><PortalOffers /></Guard></S>} />
            <Route path="quotes/:id" element={<S><Guard perm={['quotes.respond']}><QuoteDetail /></Guard></S>} />
            <Route path="vessels/:id" element={<S><VesselDetail /></S>} />
            <Route path="work-orders" element={<S><WorkOrders /></S>} />
            <Route path="work-orders/:id" element={<S><WorkOrderDetail /></S>} />
            <Route path="faults" element={<Navigate to="/maintenance" replace />} />
            <Route path="faults/:id" element={<S><FaultDetail /></S>} />
            <Route path="reports" element={<Navigate to="/documents" replace />} />
            <Route path="reports/:id" element={<S><ReportDetail /></S>} />
            <Route path="projects/:id" element={<S><ProjectDetail /></S>} />
            <Route path="notifications" element={<S><Notifications /></S>} />
            <Route path="profile" element={<S><Profile /></S>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}

/** Teknisyen "Bugün" ekranını, diğer personel yönetim panelini görür */
function HomeSwitch() {
  const { user, manager } = useAuth();
  return isTechOnly(user?.roles, manager) ? <TechHome /> : <Dashboard />;
}
