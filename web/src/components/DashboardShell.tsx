import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';
import { TeamManagement } from './TeamManagement';
import { BusinessOperations } from './BusinessOperations';
import { Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/use-auth';
import type { BusinessTypeConfig } from '../lib/business-types';
import { LogoMark } from './Logo';
import { ChatWidget } from './ChatWidget';
import { WhatsAppSettings } from './WhatsAppSettings';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function DashboardShell({
  business,
  navItems,
  activeTab,
  onTabChange,
  children,
}: {
  business: BusinessTypeConfig;
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}) {
  const [operations,setOperations]=useState(false);
  const [team,setTeam]=useState(false);
  const menus=[...navItems,{id:'team',label:'Equipo y tareas',icon:Settings},{id:'operations',label:'Administración',icon:Settings}];
  const select=(id:string)=>{setTeam(id==='team');setOperations(id==='operations');if(!['operations','team'].includes(id))onTabChange(id);};
  const selected=team?'team':operations?'operations':activeTab;
  const { user, tenant, logout } = useAuth();
  const BusinessIcon = business.icon;
  const [showWhatsAppSettings, setShowWhatsAppSettings] = useState(false);
  const canConfigureWhatsApp = user?.role === 'tenant_admin';

  return (
    <div className="app-frame flex min-h-screen" style={{'--rubro-accent':business.accent} as CSSProperties}>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-slate-900/60 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">RubroOS</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
              <BusinessIcon className="h-3 w-3 shrink-0" style={{ color: business.accent }} />
              {business.label}
            </p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {menus.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => select(item.id)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  selected === item.id ? 'text-slate-950' : 'text-slate-300 hover:bg-white/5'
                }`}
                style={selected === item.id ? { backgroundColor: business.accent } : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 pt-4">
          <p className="truncate text-sm font-semibold text-white">{tenant?.nombre_empresa}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={logout} className="text-xs font-medium text-slate-400 hover:text-red-400">
              Cerrar sesión
            </button>
            {canConfigureWhatsApp && (
              <button
                onClick={() => setShowWhatsAppSettings(true)}
                title="Configuración"
                className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white"
              >
                <Settings className="h-3.5 w-3.5" /> Configuración
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/40 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5" />
            <span className="text-sm font-bold text-white">RubroOS</span>
          </div>
          <div className="flex items-center gap-3">
            {canConfigureWhatsApp && (
              <button onClick={() => setShowWhatsAppSettings(true)} title="Configuración" className="text-slate-400">
                <Settings className="h-4 w-4" />
              </button>
            )}
            <button onClick={logout} className="text-xs text-slate-400">
              Salir
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 bg-slate-900/30 px-3 py-2 lg:hidden">
          {menus.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => select(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  selected === item.id ? 'text-slate-950' : 'text-slate-300'
                }`}
                style={selected === item.id ? { backgroundColor: business.accent } : undefined}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-8"><div><p className="text-[10px] font-bold uppercase tracking-[.2em]" style={{color:business.accent}}>{business.label}</p><p className="mt-1 text-sm font-semibold text-white">{tenant?.nombre_empresa}</p></div><Link to="/elegir-sistema" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Cambiar rubro ↗</Link></div>
        {import.meta.env.VITE_LOCAL_DEMO==='1'&&<div className="border-b border-amber-300/10 bg-amber-300/5 px-4 py-2 text-xs text-amber-200 sm:px-8">Pruebas locales · Datos de demostración · IA simulada y WhatsApp sin envío real</div>}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8">{team?<TeamManagement/>:operations?<BusinessOperations/>:children}</main>
      </div>
      <ChatWidget business={business} />
      {canConfigureWhatsApp && <WhatsAppSettings open={showWhatsAppSettings} onClose={() => setShowWhatsAppSettings(false)} />}
    </div>
  );
}
