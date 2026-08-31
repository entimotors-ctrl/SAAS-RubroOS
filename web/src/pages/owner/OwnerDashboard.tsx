import { useEffect, useState } from 'react';
import { Building2, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiGet, apiPut } from '../../lib/api';
import { Badge, Button, Card, PageHeader, Select, StatCard, Table } from '../../components/ui';
import { formatDate, formatL } from '../../lib/currency';
import { getBusinessType } from '../../lib/business-types';
import { LogoBadge } from '../../components/Logo';

interface Overview {
  totalTenants: number;
  mrr: number;
  porRubro: { business_type: string; label: string; total: number }[];
  porEstado: { estado: string; total: number }[];
  recientes: TenantRow[];
}
interface TenantRow {
  id: number; business_type: string; nombre_empresa: string; slug: string; plan: string; status: string; created_at: string;
  usuarios?: number; admin_email?: string;
}

export default function OwnerDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<'resumen' | 'tenants'>('resumen');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);

  const cargarTodo = () => {
    apiGet<Overview>('/owner/overview').then(setOverview);
    apiGet<TenantRow[]>('/owner/tenants').then(setTenants);
  };
  useEffect(cargarTodo, []);

  const cambiarPlan = async (t: TenantRow, plan: string) => {
    await apiPut(`/owner/tenants/${t.id}`, { plan });
    cargarTodo();
  };
  const cambiarEstado = async (t: TenantRow, status: string) => {
    await apiPut(`/owner/tenants/${t.id}`, { status });
    cargarTodo();
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-slate-900/60 p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <LogoBadge size={32} />
          <div>
            <p className="text-sm font-bold">RubroOS</p>
            <p className="text-[11px] text-slate-400">Panel del dueño</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {[
            { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
            { id: 'tenants', label: 'Negocios (tenants)', icon: Building2 },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as 'resumen' | 'tenants')}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                tab === item.id ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <item.icon className="h-4 w-4" strokeWidth={2} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4">
          <p className="truncate text-sm font-semibold text-white">{user?.nombre}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <button onClick={logout} className="mt-3 text-xs font-medium text-slate-400 hover:text-red-400">Cerrar sesión</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'resumen' && overview && (
          <div>
            <PageHeader title="RubroOS · Panel del dueño" subtitle="Vista global de todos los negocios en la plataforma." />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Tenants totales" value={overview.totalTenants} accent="#34d399" />
              <StatCard label="MRR estimado" value={formatL(overview.mrr)} accent="#60a5fa" />
              <StatCard label="Tenants activos" value={overview.porEstado.find((e) => e.estado === 'activo')?.total ?? 0} />
              <StatCard label="En prueba (trial)" value={overview.porEstado.find((e) => e.estado === 'trial')?.total ?? 0} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-300">Distribución por rubro</h3>
                <div className="space-y-2">
                  {overview.porRubro.map((r) => {
                    const max = Math.max(...overview.porRubro.map((x) => x.total), 1);
                    const bt = getBusinessType(r.business_type);
                    return (
                      <div key={r.business_type} className="flex items-center gap-3 text-xs">
                        <span className="flex w-40 shrink-0 items-center gap-1.5 text-slate-400">
                          {bt && <bt.icon className="h-3.5 w-3.5" style={{ color: bt.accent }} />} {r.label}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full" style={{ width: `${(r.total / max) * 100}%`, backgroundColor: bt?.accent || '#22c55e' }} />
                        </div>
                        <span className="w-6 shrink-0 text-right text-slate-300">{r.total}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-300">Últimos registros</h3>
                <ul className="space-y-3">
                  {overview.recientes.map((t) => {
                    const bt = getBusinessType(t.business_type);
                    return (
                      <li key={t.id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          {bt && <bt.icon className="h-3.5 w-3.5" style={{ color: bt.accent }} />} {t.nombre_empresa}
                        </span>
                        <span className="text-slate-500">{formatDate(t.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>
        )}

        {tab === 'tenants' && (
          <div>
            <PageHeader title="Negocios en la plataforma" subtitle="Administra plan y estado de cada cliente." />
            <Table head={['Negocio', 'Rubro', 'Admin', 'Usuarios', 'Plan', 'Estado', 'Creado', '']}>
              {tenants.map((t) => {
                const bt = getBusinessType(t.business_type);
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-medium text-white">{t.nombre_empresa}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        {bt && <bt.icon className="h-3.5 w-3.5" style={{ color: bt.accent }} />} {bt?.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{t.admin_email}</td>
                    <td className="px-4 py-2.5">{t.usuarios}</td>
                    <td className="px-4 py-2.5">
                      <Select value={t.plan} onChange={(e) => cambiarPlan(t, e.target.value)} className="w-28">
                        <option value="trial">Trial</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="business">Business</option>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={t.status === 'activo' ? 'success' : t.status === 'suspendido' ? 'danger' : 'warning'}>{t.status}</Badge></td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {t.status === 'suspendido' ? (
                        <Button variant="ghost" onClick={() => cambiarEstado(t, 'activo')}>Reactivar</Button>
                      ) : (
                        <Button variant="danger" onClick={() => cambiarEstado(t, 'suspendido')}>Suspender</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
