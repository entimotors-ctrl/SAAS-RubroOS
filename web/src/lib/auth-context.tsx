import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiGet, apiPost, setToken, getToken } from './api';
import type { BusinessTypeId } from './business-types';

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

interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (business_type: BusinessTypeId, email: string, password: string) => Promise<AuthUser>;
  registro: (data: { business_type: BusinessTypeId; empresa_nombre: string; nombre: string; email: string; password: string }) => Promise<AuthUser>;
  ownerLogin: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
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

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setTenant(null);
  }, []);

  const value = useMemo(
    () => ({ user, tenant, loading, login, registro, ownerLogin, logout }),
    [user, tenant, loading, login, registro, ownerLogin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
