import { useEffect, useState } from 'react';
import { Calendar, LayoutDashboard, Receipt, Scissors, Tag, Users } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiGet, apiPost } from '../../../lib/api';
import { showToast } from '../../../lib/toast';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatDate, formatL } from '../../../lib/currency';

const business = getBusinessType('barberia')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'cuentas', label: 'Cuentas / POS', icon: Receipt },
  { id: 'citas', label: 'Agenda', icon: Calendar },
  { id: 'barberos', label: 'Barberos', icon: Scissors },
  { id: 'servicios', label: 'Servicios', icon: Tag },
  { id: 'clientes', label: 'Clientes', icon: Users },
];

interface Barbero { id: number; nombre: string; especialidad?: string; activo: number }
interface Servicio { id: number; nombre: string; precio: number; duracion_min: number }
interface Cliente { id: number; nombre: string; telefono?: string }
interface Cita { id: number; cliente_id: number | null; barbero_id: number | null; servicio_id: number | null; fecha: string; hora: string; estado: string }
interface CuentaItem { tipo: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }
interface Cuenta { id: number; cliente_nombre?: string; barbero_nombre?: string; estado: string; total: number; metodo_pago?: string; created_at: string; items: CuentaItem[] }
interface Resumen { ingresosHoy: number; cortesHoy: number; citasHoy: number }

export default function BarberiaApp() {
  const [tab, setTab] = useState('resumen');
  const [barberos, setBarberos] = useState<Barbero[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const cargarTodo = () => {
    apiGet<Barbero[]>('/barberia/barberos').then(setBarberos);
    apiGet<Servicio[]>('/barberia/servicios').then(setServicios);
    apiGet<Cliente[]>('/barberia/clientes').then(setClientes);
    apiGet<Cita[]>('/barberia/citas').then(setCitas);
    apiGet<Cuenta[]>('/barberia/cuentas').then(setCuentas);
    apiGet<Resumen>('/barberia/resumen').then(setResumen);
  };
  useEffect(cargarTodo, []);

  const nombreCliente = (id: number | null) => clientes.find((c) => c.id === id)?.nombre || '—';
  const nombreBarbero = (id: number | null) => barberos.find((b) => b.id === id)?.nombre || '—';

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      {tab === 'resumen' && (
        <div>
          <PageHeader title="Resumen de la barbería" subtitle="Cómo va el día en el local." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Ingresos de hoy" value={formatL(resumen?.ingresosHoy)} accent={business.accent} />
            <StatCard label="Cortes hoy" value={resumen?.cortesHoy ?? 0} />
            <StatCard label="Citas hoy" value={resumen?.citasHoy ?? 0} />
          </div>
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Próximas citas</h3>
            {citas.length === 0 ? <EmptyState message="Sin citas registradas." /> : (
              <Table head={['Fecha', 'Hora', 'Cliente', 'Barbero', 'Estado']}>
                {citas.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5">{formatDate(c.fecha)}</td>
                    <td className="px-4 py-2.5">{c.hora}</td>
                    <td className="px-4 py-2.5">{nombreCliente(c.cliente_id)}</td>
                    <td className="px-4 py-2.5">{nombreBarbero(c.barbero_id)}</td>
                    <td className="px-4 py-2.5"><Badge>{c.estado}</Badge></td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}

      {tab === 'cuentas' && <Cuentas cuentas={cuentas} clientes={clientes} barberos={barberos} servicios={servicios} onCreated={cargarTodo} />}
      {tab === 'citas' && <Citas citas={citas} clientes={clientes} barberos={barberos} servicios={servicios} onCreated={cargarTodo} nombreCliente={nombreCliente} nombreBarbero={nombreBarbero} />}
      {tab === 'barberos' && <Barberos barberos={barberos} onCreated={cargarTodo} />}
      {tab === 'servicios' && <Servicios servicios={servicios} onCreated={cargarTodo} />}
      {tab === 'clientes' && <Clientes clientes={clientes} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

function Cuentas({ cuentas, clientes, barberos, servicios, onCreated }: { cuentas: Cuenta[]; clientes: Cliente[]; barberos: Barbero[]; servicios: Servicio[]; onCreated: () => void }) {
  const [carrito, setCarrito] = useState<{ tipo: string; descripcion: string; cantidad: number; precio_unitario: number }[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [barberoId, setBarberoId] = useState('');

  const total = carrito.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);

  const agregarServicio = (s: Servicio) => setCarrito((c) => [...c, { tipo: 'servicio', descripcion: s.nombre, cantidad: 1, precio_unitario: s.precio }]);

  const cobrar = async () => {
    if (carrito.length === 0) return;
    const cuenta = await apiPost<Cuenta>('/barberia/cuentas', { cliente_id: clienteId ? Number(clienteId) : null, barbero_id: barberoId ? Number(barberoId) : null, items: carrito });
    await apiPost(`/barberia/cuentas/${cuenta.id}/cobrar`, { metodo_pago: 'efectivo' });
    setCarrito([]);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Cuentas / POS" subtitle="Cobra por silla: servicios y productos." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Servicios</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {servicios.map((s) => (
              <button key={s.id} onClick={() => agregarServicio(s)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-white">
                {s.nombre} · {formatL(s.precio)}
              </button>
            ))}
          </div>
          {carrito.length === 0 ? <EmptyState message="Agrega servicios a la cuenta." /> : (
            <Table head={['Descripción', 'Cant.', 'Subtotal']}>
              {carrito.map((i, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2.5">{i.descripcion}</td>
                  <td className="px-4 py-2.5">{i.cantidad}</td>
                  <td className="px-4 py-2.5">{formatL(i.cantidad * i.precio_unitario)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Cerrar cuenta</h3>
          <div className="space-y-3">
            <Field label="Cliente">
              <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Cliente ocasional</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Barbero">
              <Select value={barberoId} onChange={(e) => setBarberoId(e.target.value)}>
                <option value="">Sin asignar</option>
                {barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </Select>
            </Field>
            <div className="rounded-xl bg-white/5 p-3 text-right">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-2xl font-bold text-white">{formatL(total)}</p>
            </div>
            <Button className="w-full" onClick={cobrar} disabled={carrito.length === 0}>Cobrar</Button>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Historial</h3>
        {cuentas.length === 0 ? <EmptyState message="Sin cuentas registradas." /> : (
          <Table head={['Fecha', 'Cliente', 'Barbero', 'Total', 'Estado']}>
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">{formatDate(c.created_at)}</td>
                <td className="px-4 py-2.5">{c.cliente_nombre || '—'}</td>
                <td className="px-4 py-2.5">{c.barbero_nombre || '—'}</td>
                <td className="px-4 py-2.5">{formatL(c.total)}</td>
                <td className="px-4 py-2.5"><Badge tone={c.estado === 'pagada' ? 'success' : 'default'}>{c.estado}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function Citas({ citas, clientes, barberos, servicios, onCreated, nombreCliente, nombreBarbero }: {
  citas: Cita[]; clientes: Cliente[]; barberos: Barbero[]; servicios: Servicio[]; onCreated: () => void;
  nombreCliente: (id: number | null) => string; nombreBarbero: (id: number | null) => string;
}) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [barberoId, setBarberoId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');

  const crear = async () => {
    if (!fecha || !hora) return showToast('Elige la fecha y la hora de la cita.');
    await apiPost('/barberia/citas', { cliente_id: clienteId ? Number(clienteId) : null, barbero_id: barberoId ? Number(barberoId) : null, servicio_id: servicioId ? Number(servicioId) : null, fecha, hora, estado: 'pendiente' });
    setFecha(''); setHora(''); setClienteId(''); setBarberoId(''); setServicioId(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Agenda" action={<Button onClick={() => setOpen(true)}>+ Nueva cita</Button>} />
      {citas.length === 0 ? <EmptyState message="No hay citas agendadas." actionLabel="+ Agendar la primera" onAction={() => setOpen(true)} /> : (
        <Table head={['Fecha', 'Hora', 'Cliente', 'Barbero', 'Estado']}>
          {citas.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5">{formatDate(c.fecha)}</td>
              <td className="px-4 py-2.5">{c.hora}</td>
              <td className="px-4 py-2.5">{nombreCliente(c.cliente_id)}</td>
              <td className="px-4 py-2.5">{nombreBarbero(c.barbero_id)}</td>
              <td className="px-4 py-2.5"><Badge>{c.estado}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva cita">
        <div className="space-y-3">
          <Field label="Cliente">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin asignar</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Barbero">
            <Select value={barberoId} onChange={(e) => setBarberoId(e.target.value)}>
              <option value="">Sin asignar</option>
              {barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Servicio">
            <Select value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
              <option value="">Sin definir</option>
              {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Agendar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Barberos({ barberos, onCreated }: { barberos: Barbero[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [especialidad, setEspecialidad] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del barbero.');
    await apiPost('/barberia/barberos', { nombre, especialidad, activo: 1 });
    setNombre(''); setEspecialidad(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Barberos" action={<Button onClick={() => setOpen(true)}>+ Nuevo barbero</Button>} />
      {barberos.length === 0 ? <EmptyState message="Aún no tienes barberos registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Especialidad', 'Estado']}>
          {barberos.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2.5 font-medium text-white">{b.nombre}</td>
              <td className="px-4 py-2.5">{b.especialidad || '—'}</td>
              <td className="px-4 py-2.5"><Badge tone={b.activo ? 'success' : 'default'}>{b.activo ? 'Activo' : 'Inactivo'}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo barbero">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Especialidad"><Input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Servicios({ servicios, onCreated }: { servicios: Servicio[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [duracion, setDuracion] = useState('30');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del servicio.');
    await apiPost('/barberia/servicios', { nombre, precio: Number(precio || 0), duracion_min: Number(duracion || 30) });
    setNombre(''); setPrecio(''); setDuracion('30'); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Servicios" action={<Button onClick={() => setOpen(true)}>+ Nuevo servicio</Button>} />
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

function Clientes({ clientes, onCreated }: { clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del cliente.');
    await apiPost('/barberia/clientes', { nombre, telefono });
    setNombre(''); setTelefono(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Clientes" action={<Button onClick={() => setOpen(true)}>+ Nuevo cliente</Button>} />
      {clientes.length === 0 ? <EmptyState message="Aún no tienes clientes registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Teléfono']}>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5 font-medium text-white">{c.nombre}</td>
              <td className="px-4 py-2.5">{c.telefono || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cliente">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
