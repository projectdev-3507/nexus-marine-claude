import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isManager, type Permission, type Role } from '@nexus/shared';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { registerForPush } from './push';

export type AppMode = 'manager' | 'technician' | 'owner' | 'captain';

export interface Me {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  title?: string | null;
  roles: Role[];
  customerId: string | null;
}

interface Ctx {
  user: Me | null;
  loading: boolean;
  mode: AppMode;
  can: (...p: Permission[]) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

/** Tek uygulama, rol bazlı navigasyon: yönetici > teknisyen > sahip > kaptan */
export function modeFor(roles: Role[]): AppMode {
  if (isManager(roles)) return 'manager';
  if (roles.includes('TECHNICIAN')) return 'technician';
  if (roles.includes('OWNER')) return 'owner';
  return 'captain';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [perms, setPerms] = useState<Set<Permission>>(new Set());
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const loadMe = useCallback(async () => {
    try {
      const me = await api<{ user: Me; permissions: Permission[] }>('/auth/me');
      setUser(me.user);
      setPerms(new Set(me.permissions));
      void registerForPush();
    } catch {
      await tokenStore.set(null);
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await tokenStore.set(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    tokenStore.load().then(async (t) => {
      if (t) await loadMe();
      setLoading(false);
    });
  }, [loadMe, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string }>('/auth/login', { body: { email: email.trim().toLowerCase(), password } });
    await tokenStore.set(r.token);
    await loadMe();
  }, [loadMe]);

  const value = useMemo<Ctx>(() => ({ user, loading, login, logout, mode: user ? modeFor(user.roles) : 'owner', can: (...p) => p.some((x) => perms.has(x)) }), [user, loading, login, logout, perms]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
};
