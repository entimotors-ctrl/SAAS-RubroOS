import { createContext } from 'react';
import type { BusinessTypeId } from './business-types';
import type { AuthUser, Tenant } from './auth-context';

export interface AuthContextValue {
  user: AuthUser | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (business_type: BusinessTypeId, email: string, password: string) => Promise<AuthUser>;
  registro: (data: { business_type: BusinessTypeId; empresa_nombre: string; nombre: string; email: string; password: string }) => Promise<AuthUser>;
  ownerLogin: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  activateStaff: (token: string, password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
