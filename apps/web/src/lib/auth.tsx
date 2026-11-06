import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isManager, isStaff, type Permission, type Role } from '@nexus/shared';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { useQueryClient } from '@tanstack/react-query';

export interface Me {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  title?: string | null;
  roles: Role[];
  customerId: string | null;
  customer?: { id: string; name: string } | null;
}

interface AuthState {
  user: Me | null;
  permissions: Set<Permission>;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...p: Permission[]) => boolean;
  staff: boolean;
  manager: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setPermissions(new Set());
    qc.clear();
  }, [qc]);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: Me; permissions: Permission[] }>('/auth/me');
      setUser(me.user);
      setPermissions(new Set(me.permissions));
    } catch {
      tokenStore.set(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    void refresh();
  }, [logout, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api<{ token: string }>('/auth/login', { body: { email, password } });
      tokenStore.set(r.token);
      qc.clear();
      await refresh();
    },
    [qc, refresh],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      permissions,
      loading,
      login,
      logout,
      refresh,
      can: (...p) => p.some((x) => permissions.has(x)),
      staff: user ? isStaff(user.roles) : false,
      manager: user ? isManager(user.roles) : false,
    }),
    [user, permissions, loading, login, logout, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
