import { useEffect, useState } from 'react';
import { Droplets, IdCard, LayoutDashboard, ListChecks, Users } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiGet, apiPost, apiPut } from '../../../lib/api';
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatDate, formatL } from '../../../lib/currency';
import { showToast } from '../../../lib/toast';

const business = getBusinessType('carwash')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'turnos', label: 'Cola de turnos', icon: ListChecks },
  { id: 'membresias', label: 'Membresías', icon: IdCard },
  { id: 'servicios', label: 'Servicios', icon: Droplets },
  { id: 'clientes', label: 'Clientes y vehículos', icon: Users },
];

interface Servicio { id: number; nombre: string; precio: number; duracion_min: number }
interface Cliente { id: number; nombre: string; telefono?: string }
interface Vehiculo { id: number; cliente_id: number | null; placa?: string; tipo: string }
interface Membresia { id: number; cliente_id: number; cliente_nombre?: string; plan: string; precio_mensual: number; fecha_renovacion: string; estado: string }
interface Turno { id: number; cliente_nombre?: string; placa?: string; servicio_nombre?: string; estado: string; usa_membresia: number; precio: number; created_at: string }
interface Resumen { ingresosHoy: number; lavadosHoy: number; enCola: number; membresiasActivas: number }

const ESTADOS = ['en_cola', 'lavando', 'listo', 'entregado'] as const;
const ESTADO_LABEL: Record<string, string> = { en_cola: 'En cola', lavando: 'Lavando', listo: 'Listo', entregado: 'Entregado' };

export default function CarwashApp() {
  const [tab, setTab] = useState('resumen');
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [membresias, setMembresias] = useState<Membresia[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const cargarTodo = () => {
    apiGet<Servicio[]>('/carwash/servicios').then(setServicios);
    apiGet<Cliente[]>('/carwash/clientes').then(setClientes);
    apiGet<Vehiculo[]>('/carwash/vehiculos').then(setVehiculos);
    apiGet<Membresia[]>('/carwash/membresias').then(setMembresias);
    apiGet<Turno[]>('/carwash/turnos').then(setTurnos);
    apiGet<Resumen>('/carwash/resumen').then(setResumen);
  };
  useEffect(cargarTodo, []);

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      {tab === 'resumen' && (
        <div>
          <PageHeader title="Resumen del carwash" subtitle="La cola y los ingresos de hoy." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Ingresos de hoy" value={formatL(resumen?.ingresosHoy)} accent={business.accent} />
            <StatCard label="Lavados hoy" value={resumen?.lavadosHoy ?? 0} />
            <StatCard label="En cola / lavando" value={resumen?.enCola ?? 0} />
            <StatCard label="Membresías activas" value={resumen?.membresiasActivas ?? 0} accent="#22d3ee" />
          </div>
        </div>
      )}
      {tab === 'turnos' && <Turnos turnos={turnos} clientes={clientes} vehiculos={vehiculos} servicios={servicios} membresias={membresias} onCreated={cargarTodo} />}
      {tab === 'membresias' && <Membresias membresias={membresias} clientes={clientes} onCreated={cargarTodo} />}
      {tab === 'servicios' && <Servicios servicios={servicios} onCreated={cargarTodo} />}
      {tab === 'clientes' && <Clientes clientes={clientes} vehiculos={vehiculos} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

function Turnos({ turnos, clientes, vehiculos, servicios, membresias, onCreated }: {
  turnos: Turno[]; clientes: Cliente[]; vehiculos: Vehiculo[]; servicios: Servicio[]; membresias: Membresia[]; onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [usaMembresia, setUsaMembresia] = useState(false);

  const tieneMembresiaActiva = (id: string) => membresias.some((m) => String(m.cliente_id) === id && m.estado === 'activa');

  const crear = async () => {
    if (!servicioId) return showToast('Selecciona el servicio para el turno.');
    await apiPost('/carwash/turnos', { cliente_id: clienteId ? Number(clienteId) : null, vehiculo_id: vehiculoId ? Number(vehiculoId) : null, servicio_id: Number(servicioId), usa_membresia: usaMembresia });
    setClienteId(''); setVehiculoId(''); setServicioId(''); setUsaMembresia(false); setOpen(false);
    onCreated();
  };

  const avanzar = async (t: Turno) => {
    const idx = ESTADOS.indexOf(t.estado as typeof ESTADOS[number]);
    const siguiente = ESTADOS[Math.min(idx + 1, ESTADOS.length - 1)];
    await apiPut(`/carwash/turnos/${t.id}/estado`, { estado: siguiente });
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Cola de turnos" action={<Button onClick={() => setOpen(true)}>+ Nuevo turno</Button>} />
      {turnos.length === 0 ? <EmptyState message="No hay vehículos en cola." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Hora', 'Cliente', 'Placa', 'Servicio', 'Precio', 'Estado', '']}>
          {turnos.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5">{formatDate(t.created_at)}</td>
              <td className="px-4 py-2.5">{t.cliente_nombre || '—'}</td>
              <td className="px-4 py-2.5">{t.placa || '—'}</td>
              <td className="px-4 py-2.5">{t.servicio_nombre || '—'}</td>
              <td className="px-4 py-2.5">{t.usa_membresia ? <Badge tone="success">Membresía</Badge> : formatL(t.precio)}</td>
              <td className="px-4 py-2.5"><Badge tone={t.estado === 'entregado' ? 'success' : 'default'}>{ESTADO_LABEL[t.estado]}</Badge></td>
              <td className="px-4 py-2.5">
                {t.estado !== 'entregado' && <Button variant="ghost" onClick={() => avanzar(t)}>Avanzar →</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo turno">
        <div className="space-y-3">
          <Field label="Cliente">
            <Select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setUsaMembresia(false); }}>
              <option value="">Cliente ocasional</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Vehículo">
            <Select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
              <option value="">Sin definir</option>
              {vehiculos.filter((v) => !clienteId || String(v.cliente_id) === clienteId).map((v) => <option key={v.id} value={v.id}>{v.placa} ({v.tipo})</option>)}
            </Select>
          </Field>
          <Field label="Servicio">
            <Select value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
              <option value="">Selecciona un servicio</option>
              {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {formatL(s.precio)}</option>)}
            </Select>
          </Field>
          {clienteId && tieneMembresiaActiva(clienteId) && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={usaMembresia} onChange={(e) => setUsaMembresia(e.target.checked)} />
              Usar membresía activa (lavado sin costo)
            </label>
          )}
          <Button className="w-full" onClick={crear}>Agregar a la cola</Button>
        </div>
      </Modal>
    </div>
  );
}

function Membresias({ membresias, clientes, onCreated }: { membresias: Membresia[]; clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [plan, setPlan] = useState('Ilimitado Mensual');
  const [precio, setPrecio] = useState('690');

  const crear = async () => {
    if (!clienteId) return showToast('Selecciona el cliente para la membresía.');
    await apiPost('/carwash/membresias', { cliente_id: Number(clienteId), plan, precio_mensual: Number(precio || 0) });
    setClienteId(''); setOpen(false);
    onCreated();
  };

  const renovar = async (m: Membresia) => {
    await apiPut(`/carwash/membresias/${m.id}/renovar`, {});
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Membresías" subtitle="Ingreso recurrente: planes ilimitados mensuales." action={<Button onClick={() => setOpen(true)}>+ Nueva membresía</Button>} />
      {membresias.length === 0 ? <EmptyState message="Aún no hay membresías activas." actionLabel="+ Activar la primera" onAction={() => setOpen(true)} /> : (
        <Table head={['Cliente', 'Plan', 'Precio mensual', 'Renovación', 'Estado', '']}>
          {membresias.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2.5 font-medium text-white">{m.cliente_nombre}</td>
              <td className="px-4 py-2.5">{m.plan}</td>
              <td className="px-4 py-2.5">{formatL(m.precio_mensual)}</td>
              <td className="px-4 py-2.5">{formatDate(m.fecha_renovacion)}</td>
              <td className="px-4 py-2.5"><Badge tone={m.estado === 'activa' ? 'success' : 'default'}>{m.estado}</Badge></td>
              <td className="px-4 py-2.5"><Button variant="ghost" onClick={() => renovar(m)}>Renovar</Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva membresía">
        <div className="space-y-3">
          <Field label="Cliente">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Selecciona un cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Plan"><Input value={plan} onChange={(e) => setPlan(e.target.value)} /></Field>
          <Field label="Precio mensual (L.)"><Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Activar membresía</Button>
        </div>
      </Modal>
    </div>
  );
}

function Servicios({ servicios, onCreated }: { servicios: Servicio[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [duracion, setDuracion] = useState('20');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del servicio.');
    await apiPost('/carwash/servicios', { nombre, precio: Number(precio || 0), duracion_min: Number(duracion || 20) });
    setNombre(''); setPrecio(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Servicios de lavado" action={<Button onClick={() => setOpen(true)}>+ Nuevo servicio</Button>} />
      {servicios.length === 0 ? <EmptyState message="Aún no hay servicios." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Precio', 'Duración']}>
          {servicios.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2.5 font-medium text-white">{s.nombre}</td>
              <td className="px-4 py-2.5">{formatL(s.precio)}</td>
              <td className="px-4 py-2.5">{s.duracion_min} min</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo servicio">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Precio (L.)"><Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Field>
          <Field label="Duración (min)"><Input type="number" value={duracion} onChange={(e) => setDuracion(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Clientes({ clientes, vehiculos, onCreated }: { clientes: Cliente[]; vehiculos: Vehiculo[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('sedan');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del cliente.');
    const cliente = await apiPost<Cliente>('/carwash/clientes', { nombre, telefono });
    if (placa) await apiPost('/carwash/vehiculos', { cliente_id: cliente.id, placa, tipo });
    setNombre(''); setTelefono(''); setPlaca(''); setOpen(false);
    onCreated();
  };

  const vehiculoDe = (clienteId: number) => vehiculos.filter((v) => v.cliente_id === clienteId).map((v) => v.placa).join(', ') || '—';

  return (
    <div>
      <PageHeader title="Clientes y vehículos" action={<Button onClick={() => setOpen(true)}>+ Nuevo cliente</Button>} />
      {clientes.length === 0 ? <EmptyState message="Aún no hay clientes." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Teléfono', 'Vehículos']}>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5 font-medium text-white">{c.nombre}</td>
              <td className="px-4 py-2.5">{c.telefono || '—'}</td>
              <td className="px-4 py-2.5">{vehiculoDe(c.id)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cliente">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
          <Field label="Placa del vehículo (opcional)"><Input value={placa} onChange={(e) => setPlaca(e.target.value)} /></Field>
          <Field label="Tipo de vehículo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="sedan">Sedán</option>
              <option value="suv">SUV / Pickup</option>
              <option value="moto">Motocicleta</option>
              <option value="camion">Camión</option>
            </Select>
          </Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
