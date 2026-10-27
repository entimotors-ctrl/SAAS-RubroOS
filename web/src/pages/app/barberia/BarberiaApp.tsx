import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Calendar, CalendarClock, LayoutDashboard, Receipt, Scissors, Tag, Users } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiDelete, apiGet, apiPost, apiPut } from '../../../lib/api';
import { showToast } from '../../../lib/toast';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatDate, formatL } from '../../../lib/currency';

const business = getBusinessType('barberia')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'cuentas', label: 'Cuentas / POS', icon: Receipt },
  { id: 'citas', label: 'Agenda', icon: Calendar },
  { id: 'disponibilidad', label: 'Horarios', icon: CalendarClock },
  { id: 'comisiones', label: 'Comisiones', icon: Receipt },
  { id: 'barberos', label: 'Barberos', icon: Scissors },
  { id: 'servicios', label: 'Servicios', icon: Tag },
  { id: 'clientes', label: 'Clientes', icon: Users },
];

interface Barbero { id: number; nombre: string; especialidad?: string; activo: number; comision_porcentaje: number }
interface Servicio { id: number; nombre: string; precio: number; duracion_min: number }
interface Cliente { id: number; nombre: string; telefono?: string }
interface Cita { id: number; cliente_id: number | null; barbero_id: number | null; servicio_id: number | null; fecha: string; hora: string; estado: string }
interface CuentaItem { tipo: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }
interface Cuenta { id: number; cita_id?: number | null; cliente_nombre?: string; barbero_nombre?: string; estado: string; total: number; metodo_pago?: string; created_at: string; items: CuentaItem[] }
interface Resumen { ingresosHoy: number; cortesHoy: number; citasHoy: number }
interface Horario { id?: number; barbero_id: number; dia_semana: number; hora_inicio: string | null; hora_fin: string | null; activo: number }
interface Bloqueo { id: number; barbero_id: number; barbero_nombre: string; fecha: string; hora_inicio: string | null; hora_fin: string | null; motivo: string }
interface Disponibilidad { horarios: Horario[]; bloqueos: Bloqueo[] }

export default function BarberiaApp() {
  const [tab, setTab] = useState('resumen');
  const [barberos, setBarberos] = useState<Barbero[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);

  const cargarTodo = () => {
    apiGet<Barbero[]>('/barberia/barberos').then(setBarberos);
    apiGet<Servicio[]>('/barberia/servicios').then(setServicios);
    apiGet<Cliente[]>('/barberia/clientes').then(setClientes);
    apiGet<Cita[]>('/barberia/citas').then(setCitas);
    apiGet<Cuenta[]>('/barberia/cuentas').then(setCuentas);
    apiGet<Resumen>('/barberia/resumen').then(setResumen);
    apiGet<Disponibilidad>('/barberia/disponibilidad').then((value) => { setHorarios(value.horarios); setBloqueos(value.bloqueos); });
  };
  useEffect(cargarTodo, []);

  const nombreCliente = (id: number | null) => clientes.find((c) => c.id === id)?.nombre || '—';
  const nombreBarbero = (id: number | null) => barberos.find((b) => b.id === id)?.nombre || '—';

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      <div className="mb-5 flex justify-end"><Link to="/agenda-trabajo" className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-slate-950">Abrir pantalla de citas ↗</Link></div>
      {tab === 'resumen' && (
        <div>
          <PageHeader title="Resumen de la barbería" subtitle="Cómo va el día en el local." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Ingresos de hoy" value={formatL(resumen?.ingresosHoy)} accent={business.accent} />
            <StatCard label="Cortes hoy" value={resumen?.cortesHoy ?? 0} />
            <StatCard label="Citas hoy" value={resumen?.citasHoy ?? 0} />
          </div>
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Citas registradas</h3>
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

      {tab === 'cuentas' && <Cuentas cuentas={cuentas} citas={citas} clientes={clientes} barberos={barberos} servicios={servicios} nombreCliente={nombreCliente} nombreBarbero={nombreBarbero} onCreated={cargarTodo} />}
      {tab === 'citas' && <Citas citas={citas} clientes={clientes} barberos={barberos} servicios={servicios} onCreated={cargarTodo} nombreCliente={nombreCliente} nombreBarbero={nombreBarbero} />}
      {tab === 'disponibilidad' && <DisponibilidadBarberos barberos={barberos} horarios={horarios} bloqueos={bloqueos} onUpdated={cargarTodo} />}
      {tab === 'comisiones' && <Comisiones/>}
      {tab === 'barberos' && <Barberos barberos={barberos} onCreated={cargarTodo} />}
      {tab === 'servicios' && <Servicios servicios={servicios} onCreated={cargarTodo} />}
      {tab === 'clientes' && <Clientes clientes={clientes} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

function Cuentas({ cuentas, citas, clientes, barberos, servicios, nombreCliente, nombreBarbero, onCreated }: { cuentas: Cuenta[]; citas: Cita[]; clientes: Cliente[]; barberos: Barbero[]; servicios: Servicio[]; nombreCliente: (id:number|null)=>string; nombreBarbero: (id:number|null)=>string; onCreated: () => void }) {
  const [carrito, setCarrito] = useState<{ tipo: string; descripcion: string; cantidad: number; precio_unitario: number }[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [barberoId, setBarberoId] = useState('');
  const [citaId, setCitaId] = useState('');

  const requestKey=useRef(crypto.randomUUID());
  const [busy,setBusy]=useState(false);
  const [metodo,setMetodo]=useState('efectivo');
  const total = carrito.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);

  const agregarServicio = (s: Servicio) => setCarrito((c) => [...c, { tipo: 'servicio', descripcion: s.nombre, cantidad: 1, precio_unitario: s.precio }]);

  const cobrar = async () => {
    if (!carrito.length || busy) return;
    setBusy(true);
    try {
      await apiPost('/barberia/cobrar', { request_key:requestKey.current, cita_id:citaId?Number(citaId):null,cliente_id:clienteId?Number(clienteId):null,barbero_id:barberoId?Number(barberoId):null,items:carrito,metodo_pago:metodo });
      setCarrito([]);setCitaId('');requestKey.current=crypto.randomUUID();onCreated();
    } catch { /* API displays error; retry preserves request key */ } finally {setBusy(false);}
  };

  return (
    <div>
      <PageHeader title="Cuentas / POS" subtitle="Cobra por silla: servicios y productos." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Servicios</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            {servicios.map((s) => (
              <button key={s.id} disabled={busy || !!citaId} onClick={() => agregarServicio(s)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-white">
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
            <Field label="Cita terminada (opcional)">
              <Select value={citaId} onChange={e=>{const value=e.target.value;setCitaId(value);if(!value){setCarrito([]);return;}const cita=citas.find(c=>c.id===Number(value));const servicio=servicios.find(s=>s.id===cita?.servicio_id);if(!cita||!servicio)return;setClienteId(cita.cliente_id?String(cita.cliente_id):'');setBarberoId(cita.barbero_id?String(cita.barbero_id):'');setCarrito([{tipo:'servicio',descripcion:servicio.nombre,cantidad:1,precio_unitario:servicio.precio}]);}}>
                <option value="">Cobro sin cita</option>
                {citas.filter(c=>c.estado==='completada'&&!cuentas.some(cuenta=>cuenta.cita_id===c.id)).map(c=><option key={c.id} value={c.id}>{c.fecha} · {c.hora} · {nombreCliente(c.cliente_id)} · {nombreBarbero(c.barbero_id)}</option>)}
              </Select>
            </Field>
            {citaId&&<p className="text-xs text-amber-300">El servicio de la cita se agregó automáticamente y solo podrá cobrarse una vez.</p>}
            <Field label="Cliente">
              <Select disabled={!!citaId} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Cliente ocasional</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Barbero">
              <Select disabled={!!citaId} value={barberoId} onChange={(e) => setBarberoId(e.target.value)}>
                <option value="">Sin asignar</option>
                {barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </Select>
            </Field>
            <div className="rounded-xl bg-white/5 p-3 text-right">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-2xl font-bold text-white">{formatL(total)}</p>
            </div>
            <Field label="Método de pago"><Select disabled={busy} value={metodo} onChange={e=>setMetodo(e.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></Select></Field><Button className="w-full" onClick={cobrar} disabled={!carrito.length||busy}>{busy?'Cobrando…':'Cobrar'}</Button><Button variant="ghost" className="w-full" disabled={busy} onClick={()=>{setCarrito([]);requestKey.current=crypto.randomUUID();}}>Vaciar cuenta</Button>
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
    if (!fecha || !hora || !barberoId || !servicioId) return showToast('Elige fecha, hora, barbero y servicio.');
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
              <td className="px-4 py-2.5"><Select aria-label={`Estado cita ${c.id}`} value={c.estado} onChange={async e=>{try{await apiPut(`/barberia/citas/${c.id}`,{estado:e.target.value});onCreated();}catch{/* API displays error */}}}>{['pendiente','confirmada','completada','cancelada','no_asistio'].map(v=><option key={v} value={v}>{v.replace('_',' ')}</option>)}</Select></td>
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

const WEEK_DAYS = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' }, { value: 0, label: 'Domingo' },
];

function DisponibilidadBarberos({ barberos, horarios, bloqueos, onUpdated }: { barberos: Barbero[]; horarios: Horario[]; bloqueos: Bloqueo[]; onUpdated: () => void }) {
  const [barberoId, setBarberoId] = useState('');
  const [ediciones, setEdiciones] = useState<Record<number, Partial<Horario>>>({});
  const [blockOpen, setBlockOpen] = useState(false);
  const [fecha, setFecha] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [todoElDia, setTodoElDia] = useState(true);

  const barberosActivos = barberos.filter((barbero) => barbero.activo);
  const selectedBarberoId = barberoId || (barberosActivos[0] ? String(barberosActivos[0].id) : '');
  const semana = WEEK_DAYS.map((day) => ({
    ...(horarios.find((row) => row.barbero_id === Number(selectedBarberoId) && row.dia_semana === day.value) || {
      barbero_id: Number(selectedBarberoId), dia_semana: day.value, activo: day.value === 0 ? 0 : 1,
      hora_inicio: day.value === 0 ? null : '09:00', hora_fin: day.value === 0 ? null : '18:00',
    }),
    ...ediciones[day.value],
  }));
  const updateDay = (day: number, changes: Partial<Horario>) => setEdiciones((current) => ({ ...current, [day]: { ...current[day], ...changes } }));
  const guardarHorario = async () => {
    if (!selectedBarberoId) return;
    await apiPut(`/barberia/barberos/${selectedBarberoId}/horarios`, { horarios: semana });
    showToast('Horario semanal guardado.', 'success');
    onUpdated();
  };
  const crearBloqueo = async () => {
    if (!selectedBarberoId || !fecha) return showToast('Elige la fecha que quieres bloquear.');
    await apiPost('/barberia/bloqueos', {
      barbero_id: Number(selectedBarberoId), fecha, motivo,
      hora_inicio: todoElDia ? null : inicio, hora_fin: todoElDia ? null : fin,
    });
    setFecha(''); setInicio(''); setFin(''); setMotivo(''); setTodoElDia(true); setBlockOpen(false);
    showToast('Bloqueo creado.', 'success');
    onUpdated();
  };
  const eliminarBloqueo = async (id: number) => {
    await apiDelete(`/barberia/bloqueos/${id}`);
    showToast('Bloqueo eliminado.', 'success');
    onUpdated();
  };
  const bloquesDelBarbero = bloqueos.filter((block) => block.barbero_id === Number(selectedBarberoId));

  return (
    <div>
      <PageHeader title="Horarios y disponibilidad" subtitle="Define cuándo atiende cada barbero y bloquea vacaciones, descansos o capacitaciones." action={<Button onClick={() => setBlockOpen(true)} disabled={!selectedBarberoId}>+ Bloquear fecha</Button>} />
      {barberosActivos.length === 0 ? <EmptyState message="Crea o activa un barbero antes de configurar su disponibilidad." /> : <>
        <Card className="p-5">
          <div className="mb-5 max-w-sm"><Field label="Barbero"><Select value={selectedBarberoId} onChange={(event) => { setBarberoId(event.target.value); setEdiciones({}); }}>{barberosActivos.map((barbero) => <option key={barbero.id} value={barbero.id}>{barbero.nombre}</option>)}</Select></Field></div>
          <Table head={['Día', 'Atiende', 'Inicio', 'Cierre']}>
            {WEEK_DAYS.map((day) => {
              const row = semana.find((item) => item.dia_semana === day.value);
              if (!row) return null;
              const active = row.activo === 1;
              return <tr key={day.value}>
                <td className="px-4 py-3 font-medium text-white">{day.label}</td>
                <td className="px-4 py-3"><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={active} onChange={(event) => updateDay(day.value, { activo: event.target.checked ? 1 : 0, hora_inicio: event.target.checked ? (row.hora_inicio || '09:00') : null, hora_fin: event.target.checked ? (row.hora_fin || '18:00') : null })} /> Sí</label></td>
                <td className="px-4 py-3"><Input aria-label={`Inicio ${day.label}`} type="time" disabled={!active} value={row.hora_inicio || '09:00'} onChange={(event) => updateDay(day.value, { hora_inicio: event.target.value })} /></td>
                <td className="px-4 py-3"><Input aria-label={`Cierre ${day.label}`} type="time" disabled={!active} value={row.hora_fin || '18:00'} onChange={(event) => updateDay(day.value, { hora_fin: event.target.value })} /></td>
              </tr>;
            })}
          </Table>
          <div className="mt-4 flex justify-end"><Button onClick={guardarHorario}>Guardar horario</Button></div>
        </Card>

        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Fechas bloqueadas</h2>
          {bloquesDelBarbero.length === 0 ? <EmptyState message="No hay vacaciones, descansos ni otros bloqueos próximos." /> : <Table head={['Fecha', 'Horario', 'Motivo', '']}>
            {bloquesDelBarbero.map((block) => <tr key={block.id}><td className="px-4 py-3">{formatDate(block.fecha)}</td><td className="px-4 py-3">{block.hora_inicio ? `${block.hora_inicio} – ${block.hora_fin}` : 'Todo el día'}</td><td className="px-4 py-3">{block.motivo}</td><td className="px-4 py-3 text-right"><Button variant="ghost" onClick={() => eliminarBloqueo(block.id)}>Quitar</Button></td></tr>)}
          </Table>}
        </div>
      </>}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title="Bloquear disponibilidad">
        <div className="space-y-3">
          <Field label="Fecha"><Input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} /></Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={todoElDia} onChange={(event) => setTodoElDia(event.target.checked)} /> Todo el día</label>
          {!todoElDia && <div className="grid grid-cols-2 gap-3"><Field label="Inicio"><Input type="time" value={inicio} onChange={(event) => setInicio(event.target.value)} /></Field><Field label="Fin"><Input type="time" value={fin} onChange={(event) => setFin(event.target.value)} /></Field></div>}
          <Field label="Motivo (opcional)"><Input placeholder="Ej. Vacaciones" value={motivo} onChange={(event) => setMotivo(event.target.value)} /></Field>
          <Button className="w-full" onClick={crearBloqueo}>Guardar bloqueo</Button>
        </div>
      </Modal>
    </div>
  );
}

function Barberos({ barberos, onCreated }: { barberos: Barbero[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [comision,setComision]=useState('40');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del barbero.');
    await apiPost('/barberia/barberos', { nombre, especialidad, activo: 1, comision_porcentaje:Number(comision) });
    setNombre(''); setEspecialidad(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Barberos" action={<Button onClick={() => setOpen(true)}>+ Nuevo barbero</Button>} />
      {barberos.length === 0 ? <EmptyState message="Aún no tienes barberos registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Especialidad', 'Comisión', 'Estado']}>
          {barberos.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2.5 font-medium text-white">{b.nombre}</td>
              <td className="px-4 py-2.5">{b.especialidad || '—'}</td><td className="px-4 py-2.5">{b.comision_porcentaje}%</td>
              <td className="px-4 py-2.5"><Badge tone={b.activo ? 'success' : 'default'}>{b.activo ? 'Activo' : 'Inactivo'}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo barbero">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Especialidad"><Input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} /></Field><Field label="Comisión sobre servicios (%)"><Input type="number" min="0" max="100" value={comision} onChange={e=>setComision(e.target.value)}/></Field>
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

function Comisiones(){
 const [rows,setRows]=useState<{id:number;nombre:string;comision_porcentaje:number;cuentas:number;ventas:number;comision:number}[]>([]);
 useEffect(()=>{void apiGet<typeof rows>('/barberia/comisiones').then(setRows).catch(()=>{});},[]);
 return <><PageHeader title="Comisiones del día" subtitle="Calculadas al cobrar los servicios. No representa una transferencia al barbero."/><Table head={['Barbero','Porcentaje actual','Cuentas','Ventas cobradas','Comisión generada']}>{rows.map(r=><tr key={r.id}><td className="px-4 py-3">{r.nombre}</td><td className="px-4 py-3">{r.comision_porcentaje}%</td><td className="px-4 py-3">{r.cuentas}</td><td className="px-4 py-3">{formatL(r.ventas)}</td><td className="px-4 py-3">{formatL(r.comision)}</td></tr>)}</Table></>;
}
