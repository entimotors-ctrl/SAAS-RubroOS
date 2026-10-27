import WorkerPortal from '../staff/WorkerPortal';
import { useAuth } from '../../lib/use-auth';
import TallerApp from './taller/TallerApp';
import BarberiaApp from './barberia/BarberiaApp';
import AgroApp from './agro/AgroApp';
import GanaderiaApp from './ganaderia/GanaderiaApp';
import CarwashApp from './carwash/CarwashApp';

export default function AppShell() {
  const { user } = useAuth();

  if(user?.role==='tenant_staff')return <WorkerPortal/>;
  switch (user?.business_type) {
    case 'taller':
      return <TallerApp />;
    case 'barberia':
      return <BarberiaApp />;
    case 'agro':
      return <AgroApp />;
    case 'ganaderia':
      return <GanaderiaApp />;
    case 'carwash':
      return <CarwashApp />;
    default:
      return null;
  }
}
