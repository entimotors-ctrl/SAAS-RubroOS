import { useContext } from 'react';
import { AuthContext } from './auth-store';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
