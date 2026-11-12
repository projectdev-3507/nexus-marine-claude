/**
 * Rol ve yetki tanımları — backend, web ve mobil uygulama tarafından ortak kullanılır.
 * Yetki kontrolü backend'de zorunludur; frontend yalnızca görünürlüğü yönetir.
 */
export const ROLES = ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'TECHNICIAN', 'CAPTAIN', 'OWNER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Süper Admin / Yönetici',
  OPERATIONS_MANAGER: 'Operasyon Yöneticisi',
  TECHNICIAN: 'Teknisyen',
  CAPTAIN: 'Kaptan',
  OWNER: 'Tekne Sahibi / Müşteri',
};

export const PERMISSIONS = [
  'dashboard.view',
  'vessels.view',
  'vessels.manage',
  'maintenance.view',
  'maintenance.manage',
  'workorders.view',
  'workorders.manage',
  'workorders.assign',
  'workorders.review',
  'workorders.request',
  'workorders.execute',
  'calendar.view',
  'technicians.view',
  'technicians.manage',
  'inspections.view',
  'inspections.perform',
  'inspections.review',
  'reports.view',
  'reports.manage',
  'reports.approve',
  'projects.view',
  'projects.manage',
  'inventory.view',
  'inventory.manage',
  'customers.view',
  'customers.manage',
  'finance.view',
  'finance.manage',
  'quotes.respond',
  'documents.view',
  'documents.manage',
  'notifications.view',
  'analytics.view',
  'users.manage',
  'settings.manage',
  'faults.report',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  OPERATIONS_MANAGER: ALL.filter((p) => !['users.manage', 'settings.manage', 'quotes.respond'].includes(p)),
  TECHNICIAN: [
    'dashboard.view',
    'vessels.view',
    'maintenance.view',
    'workorders.view',
    'workorders.execute',
    'calendar.view',
    'inspections.view',
    'inspections.perform',
    'inventory.view',
    'notifications.view',
    'faults.report',
  ],
  CAPTAIN: [
    'dashboard.view',
    'vessels.view',
    'maintenance.view',
    'workorders.view',
    'workorders.request',
    'calendar.view',
    'inspections.view',
    'reports.view',
    'projects.view',
    'documents.view',
    'notifications.view',
    'faults.report',
  ],
  OWNER: [
    'dashboard.view',
    'vessels.view',
    'maintenance.view',
    'workorders.view',
    'workorders.request',
    'reports.view',
    'projects.view',
    'documents.view',
    'notifications.view',
    'quotes.respond',
    'faults.report',
  ],
};

/** Kullanıcı birden fazla role sahip olabilir; yetkiler birleşim kümesidir. */
export function permissionsFor(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function hasPermission(roles: Role[], perm: Permission): boolean {
  return permissionsFor(roles).has(perm);
}

/** Personel (dahili) rolleri — müşteri tarafı (kaptan/sahip) veri kapsamı kısıtlıdır. */
export const STAFF_ROLES: Role[] = ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'TECHNICIAN'];
export const isStaff = (roles: Role[]) => roles.some((r) => STAFF_ROLES.includes(r));
export const isManager = (roles: Role[]) =>
  roles.includes('SUPER_ADMIN') || roles.includes('OPERATIONS_MANAGER');
