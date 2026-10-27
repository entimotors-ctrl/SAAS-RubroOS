import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setToken, getToken } from './api';
import type { BusinessTypeId } from './business-types';
import { AuthContext } from './auth-store';

export interface AuthUser {
  id: number;
  nombre: string;
  email: string;
  role: 'owner' | 'tenant_admin' | 'tenant_staff';
  business_type?: BusinessTypeId;
}

export interface Tenant {
  id: number;
  business_type: BusinessTypeId;
  nombre_empresa: string;
  slug: string;
  plan: string;
  status: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
  tenant?: Tenant;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiGet<{ user: AuthUser; tenant?: Tenant }>('/auth/me')
      .then((res) => {
        setUser(res.user);
        setTenant(res.tenant || null);
      })
      .catch(() => {
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (business_type: BusinessTypeId, email: string, password: string) => {
    const res = await apiPost<AuthResponse>('/auth/login', { business_type, email, password });
    setToken(res.token);
    setUser(res.user);
    setTenant(res.tenant || null);
    return res.user;
  }, []);

  const registro = useCallback(
    async (data: { business_type: BusinessTypeId; empresa_nombre: string; nombre: string; email: string; password: string }) => {
      const res = await apiPost<AuthResponse>('/auth/registro', data);
      setToken(res.token);
      setUser(res.user);
      setTenant(res.tenant || null);
      return res.user;
    },
    []
  );

  const ownerLogin = useCallback(async (email: string, password: string) => {
    const res = await apiPost<AuthResponse>('/auth/owner-login', { email, password });
    setToken(res.token);
    setUser(res.user);
    setTenant(null);
    return res.user;
  }, []);

  const activateStaff = useCallback(async (token: string, password: string) => {
    const res = await apiPost<AuthResponse>('/staff-public/activate', { token, password });
    setToken(res.token);
    setUser(res.user);
    setTenant(res.tenant || null);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setTenant(null);
  }, []);

  const value = useMemo(
    () => ({ user, tenant, loading, login, registro, ownerLogin, logout, activateStaff }),
    [user, tenant, loading, login, registro, ownerLogin, logout, activateStaff]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
