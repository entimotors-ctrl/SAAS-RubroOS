import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import { useAuth } from './lib/use-auth';
import Landing from './pages/marketing/Landing';
import ElegirSistema from './pages/marketing/ElegirSistema';
import AgendarCita from './pages/marketing/AgendarCita';
import StaffInvitation from './pages/staff/StaffInvitation';
import WorkerPortal from './pages/staff/WorkerPortal';
import BarberBoard from './pages/staff/BarberBoard';
import ResetPassword from './pages/auth/ResetPassword';
import Login from './pages/auth/Login';
import Registro from './pages/auth/Registro';
import OwnerLogin from './pages/owner/OwnerLogin';
import OwnerDashboard from './pages/owner/OwnerDashboard';
import AppShell from './pages/app/AppShell';
import { ToastHost } from './components/ToastHost';
import type { ReactNode } from 'react';

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
    </div>
  );
}

function RequireTenant({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user || user.role === 'owner') return <Navigate to="/elegir-sistema" replace />;
  return <>{children}</>;
}

function RequireOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user || user.role !== 'owner') return <Navigate to="/owner/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastHost />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/elegir-sistema" element={<ElegirSistema />} />
        <Route path="/invitacion" element={<StaffInvitation/>}/>
        <Route path="/agendar/:slug" element={<AgendarCita/>}/>
        <Route path="/colaborador" element={<RequireTenant><WorkerPortal/></RequireTenant>}/>
        <Route path="/agenda-trabajo" element={<RequireTenant><BarberBoard/></RequireTenant>}/>
        <Route path="/restablecer" element={<ResetPassword />} />
        <Route path="/login/:businessType" element={<Login />} />
        <Route path="/registro/:businessType" element={<Registro />} />
        <Route path="/owner/login" element={<OwnerLogin />} />
        <Route
          path="/owner"
          element={
            <RequireOwner>
              <OwnerDashboard />
            </RequireOwner>
          }
        />
        <Route
          path="/app/*"
          element={
            <RequireTenant>
              <AppShell />
            </RequireTenant>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
