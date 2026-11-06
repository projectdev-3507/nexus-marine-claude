import { useApi } from './hooks';
import { useAuth } from './auth';

export function useVesselOptions() {
  const r = useApi<any>('/vessels', { pageSize: 200, sort: 'name', order: 'asc' }, { staleTime: 60_000 });
  return (r.data?.items ?? []) as Array<{ id: string; name: string; marina?: string; owner?: { id: string; name: string }; engines?: Array<{ id: string; position: string; hours: number }> }>;
}

export function usePeople(role?: string) {
  const { can } = useAuth();
  const enabled = can('workorders.manage', 'projects.manage', 'vessels.manage', 'maintenance.manage');
  const r = useApi<any[]>(enabled ? '/users/lookup' : null, role ? { role } : undefined, { staleTime: 60_000 });
  return (r.data ?? []) as Array<{ id: string; name: string; roles: string[]; title?: string }>;
}

export function useCustomerOptions() {
  const { can } = useAuth();
  const r = useApi<any>(can('customers.view') ? '/customers' : null, { pageSize: 200 }, { staleTime: 60_000 });
  return (r.data?.items ?? []) as Array<{ id: string; name: string }>;
}

export function useMaterialOptions() {
  const { can } = useAuth();
  const r = useApi<any>(can('inventory.view') ? '/inventory' : null, { pageSize: 200 }, { staleTime: 60_000 });
  return (r.data?.items ?? []) as Array<{ id: string; name: string; unit: string; stock: number }>;
}
