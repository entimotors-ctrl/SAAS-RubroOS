import { useEffect, useState } from 'react';
import { Bike, Calendar, CreditCard, LayoutDashboard, Package, Receipt, Users } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiGet, apiPost } from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatDate, formatL } from '../../../lib/currency';
import { showToast } from '../../../lib/toast';

const business = getBusinessType('taller')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'pos', label: 'Punto de Venta', icon: Receipt },
  { id: 'creditos', label: 'Créditos', icon: CreditCard },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'vehiculos', label: 'Vehículos', icon: Bike },
  { id: 'citas', label: 'Citas', icon: Calendar },
  { id: 'inventario', label: 'Inventario', icon: Package },
];

interface Cliente { id: number; nombre: string; telefono?: string; direccion?: string }
interface Vehiculo { id: number; cliente_id: number | null; placa?: string; marca?: string; modelo?: string; anio?: string }
interface Cita { id: number; cliente_id: number | null; fecha: string; hora: string; servicio?: string; estado: string }
interface InventarioItem { id: number; nombre: string; sku?: string; precio: number; stock: number }
interface VentaItem { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }
interface Abono { id: number; monto: number; fecha: string }
interface Venta {
  id: number; cliente_id: number | null; cliente_nombre?: string; tipo: string; total: number; pagado: number; saldo: number;
  estado: string; created_at: string; items: VentaItem[]; abonos: Abono[];
}
interface Resumen { ventasHoy: number; ventasUltimaSemana: { dia: string; total: number }[]; creditoPendiente: number; citasHoy: number }

export default function TallerApp() {
  const [tab, setTab] = useState('resumen');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const cargarTodo = () => {
    apiGet<Cliente[]>('/taller/clientes').then(setClientes);
    apiGet<Vehiculo[]>('/taller/vehiculos').then(setVehiculos);
    apiGet<Cita[]>('/taller/citas').then(setCitas);
    apiGet<InventarioItem[]>('/taller/inventario').then(setInventario);
    apiGet<Venta[]>('/taller/ventas').then(setVentas);
    apiGet<Resumen>('/taller/finanzas/resumen').then(setResumen);
  };

  useEffect(cargarTodo, []);

  const nombreCliente = (id: number | null) => clientes.find((c) => c.id === id)?.nombre || '—';

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      {tab === 'resumen' && <Resumen resumen={resumen} citas={citas} nombreCliente={nombreCliente} />}
      {tab === 'pos' && <Pos clientes={clientes} inventario={inventario} onCreated={cargarTodo} />}
      {tab === 'creditos' && <Creditos ventas={ventas.filter((v) => v.estado === 'credito_abierto')} onAbonado={cargarTodo} />}
      {tab === 'clientes' && <Clientes clientes={clientes} onCreated={cargarTodo} />}
      {tab === 'vehiculos' && <Vehiculos vehiculos={vehiculos} clientes={clientes} onCreated={cargarTodo} />}
      {tab === 'citas' && <Citas citas={citas} clientes={clientes} onCreated={cargarTodo} />}
      {tab === 'inventario' && <Inventario inventario={inventario} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

function Resumen({ resumen, citas, nombreCliente }: { resumen: Resumen | null; citas: Cita[]; nombreCliente: (id: number | null) => string }) {
  const citasHoy = citas.filter((c) => c.estado !== 'cancelada');
  return (
    <div>
      <PageHeader title="Resumen del taller" subtitle="Lo que está pasando hoy en tu negocio." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas de hoy" value={formatL(resumen?.ventasHoy)} accent={business.accent} />
        <StatCard label="Crédito pendiente de cobro" value={formatL(resumen?.creditoPendiente)} accent="#f87171" />
        <StatCard label="Citas de hoy" value={resumen?.citasHoy ?? 0} />
        <StatCard label="Vehículos en taller" value={citasHoy.length} />
      </div>
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Próximas citas</h3>
        {citas.length === 0 ? (
          <EmptyState message="Sin citas registradas todavía." />
        ) : (
          <Table head={['Fecha', 'Hora', 'Cliente', 'Servicio', 'Estado']}>
            {citas.slice(0, 8).map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">{formatDate(c.fecha)}</td>
                <td className="px-4 py-2.5">{c.hora}</td>
                <td className="px-4 py-2.5">{nombreCliente(c.cliente_id)}</td>
                <td className="px-4 py-2.5">{c.servicio || '—'}</td>
                <td className="px-4 py-2.5"><Badge>{c.estado}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function Pos({ clientes, inventario, onCreated }: { clientes: Cliente[]; inventario: InventarioItem[]; onCreated: () => void }) {
  const [carrito, setCarrito] = useState<{ descripcion: string; cantidad: number; precio_unitario: number }[]>([]);
  const [descripcion, setDescripcion] = useState('');
  const [precio, setPrecio] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<'contado' | 'credito'>('contado');
  const [pagadoInicial, setPagadoInicial] = useState('');
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null);

  const total = carrito.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);

  const agregarItem = () => {
    if (!descripcion || !precio) return showToast('Escribe una descripción y un precio para agregar el ítem.');
    setCarrito((c) => [...c, { descripcion, cantidad: Number(cantidad) || 1, precio_unitario: Number(precio) }]);
    setDescripcion('');
    setPrecio('');
    setCantidad('1');
  };

  const agregarDesdeInventario = (item: InventarioItem) => {
    setCarrito((c) => [...c, { descripcion: item.nombre, cantidad: 1, precio_unitario: item.precio }]);
  };

  const cobrar = async () => {
    if (carrito.length === 0) return;
    const venta = await apiPost<Venta>('/taller/ventas', {
      cliente_id: clienteId ? Number(clienteId) : null,
      tipo,
      pagado_inicial: tipo === 'credito' ? Number(pagadoInicial || 0) : undefined,
      items: carrito,
    });
    setUltimaVenta(venta);
    setCarrito([]);
    setPagadoInicial('');
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Punto de venta" subtitle="Vende al contado o a crédito, como en el taller." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Agregar ítem</h3>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="flex-1 min-w-[160px]" />
            <Input placeholder="Cant." type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-20" />
            <Input placeholder="Precio L." type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} className="w-28" />
            <Button onClick={agregarItem}>Añadir</Button>
          </div>

          {inventario.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs text-slate-500">Inventario rápido:</p>
              <div className="flex flex-wrap gap-2">
                {inventario.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => agregarDesdeInventario(i)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:border-orange-400 hover:text-white"
                  >
                    {i.nombre} · {formatL(i.precio)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {carrito.length === 0 ? (
            <EmptyState message="El carrito está vacío." />
          ) : (
            <Table head={['Descripción', 'Cant.', 'P. Unit.', 'Subtotal']}>
              {carrito.map((i, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2.5">{i.descripcion}</td>
                  <td className="px-4 py-2.5">{i.cantidad}</td>
                  <td className="px-4 py-2.5">{formatL(i.precio_unitario)}</td>
                  <td className="px-4 py-2.5">{formatL(i.cantidad * i.precio_unitario)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Cobro</h3>
          <div className="space-y-3">
            <Field label="Cliente (opcional)">
              <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Cliente ocasional</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de venta">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as 'contado' | 'credito')}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </Select>
            </Field>
            {tipo === 'credito' && (
              <Field label="Abono inicial (L.)">
                <Input type="number" value={pagadoInicial} onChange={(e) => setPagadoInicial(e.target.value)} placeholder="0" />
              </Field>
            )}
            <div className="rounded-xl bg-white/5 p-3 text-right">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-2xl font-bold text-white">{formatL(total)}</p>
            </div>
            <Button className="w-full" onClick={cobrar} disabled={carrito.length === 0}>
              Cobrar venta
            </Button>
          </div>

          {ultimaVenta && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              Venta #{ultimaVenta.id} registrada · {ultimaVenta.estado === 'pagada' ? 'Pagada' : `Saldo pendiente ${formatL(ultimaVenta.saldo)}`}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Creditos({ ventas, onAbonado }: { ventas: Venta[]; onAbonado: () => void }) {
  const [seleccion, setSeleccion] = useState<Venta | null>(null);
  const [monto, setMonto] = useState('');

  const abonar = async () => {
    if (!seleccion || !monto) return showToast('Escribe el monto del abono.');
    await apiPost(`/taller/ventas/${seleccion.id}/abonos`, { monto: Number(monto) });
    setSeleccion(null);
    setMonto('');
    onAbonado();
  };

  return (
    <div>
      <PageHeader title="Créditos abiertos" subtitle="Clientes con saldo pendiente." />
      {ventas.length === 0 ? (
        <EmptyState message="No hay créditos abiertos." />
      ) : (
        <Table head={['Venta', 'Cliente', 'Total', 'Pagado', 'Saldo', '']}>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-2.5">#{v.id} · {formatDate(v.created_at)}</td>
              <td className="px-4 py-2.5">{v.cliente_nombre || '—'}</td>
              <td className="px-4 py-2.5">{formatL(v.total)}</td>
              <td className="px-4 py-2.5">{formatL(v.pagado)}</td>
              <td className="px-4 py-2.5 font-semibold text-red-400">{formatL(v.saldo)}</td>
              <td className="px-4 py-2.5">
                <Button variant="ghost" onClick={() => setSeleccion(v)}>Abonar</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!seleccion} onClose={() => setSeleccion(null)} title={`Abonar a venta #${seleccion?.id}`}>
        <p className="mb-3 text-sm text-slate-400">Saldo actual: <span className="font-semibold text-white">{formatL(seleccion?.saldo)}</span></p>
        <Field label="Monto del abono (L.)">
          <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Field>
        <Button className="mt-4 w-full" onClick={abonar}>Registrar abono</Button>
      </Modal>
    </div>
  );
}

function Clientes({ clientes, onCreated }: { clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del cliente.');
    await apiPost('/taller/clientes', { nombre, telefono, direccion });
    setNombre(''); setTelefono(''); setDireccion(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Clientes" action={<Button onClick={() => setOpen(true)}>+ Nuevo cliente</Button>} />
      {clientes.length === 0 ? (
        <EmptyState message="Aún no tienes clientes registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} />
      ) : (
        <Table head={['Nombre', 'Teléfono', 'Dirección']}>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5 font-medium text-white">{c.nombre}</td>
              <td className="px-4 py-2.5">{c.telefono || '—'}</td>
              <td className="px-4 py-2.5">{c.direccion || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cliente">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
          <Field label="Dirección"><Input value={direccion} onChange={(e) => setDireccion(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Vehiculos({ vehiculos, clientes, onCreated }: { vehiculos: Vehiculo[]; clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [placa, setPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');

  const crear = async () => {
    if (!placa) return showToast('Escribe la placa del vehículo.');
    await apiPost('/taller/vehiculos', { cliente_id: clienteId ? Number(clienteId) : null, placa, marca, modelo, anio });
    setPlaca(''); setMarca(''); setModelo(''); setAnio(''); setClienteId(''); setOpen(false);
    onCreated();
  };

  const nombreCliente = (id: number | null) => clientes.find((c) => c.id === id)?.nombre || '—';

  return (
    <div>
      <PageHeader title="Vehículos" action={<Button onClick={() => setOpen(true)}>+ Nuevo vehículo</Button>} />
      {vehiculos.length === 0 ? (
        <EmptyState message="Aún no hay vehículos registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} />
      ) : (
        <Table head={['Placa', 'Marca', 'Modelo', 'Año', 'Propietario']}>
          {vehiculos.map((v) => (
            <tr key={v.id}>
              <td className="px-4 py-2.5 font-medium text-white">{v.placa || '—'}</td>
              <td className="px-4 py-2.5">{v.marca || '—'}</td>
              <td className="px-4 py-2.5">{v.modelo || '—'}</td>
              <td className="px-4 py-2.5">{v.anio || '—'}</td>
              <td className="px-4 py-2.5">{nombreCliente(v.cliente_id)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo vehículo">
        <div className="space-y-3">
          <Field label="Propietario">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin asignar</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Placa"><Input value={placa} onChange={(e) => setPlaca(e.target.value)} /></Field>
          <Field label="Marca"><Input value={marca} onChange={(e) => setMarca(e.target.value)} /></Field>
          <Field label="Modelo"><Input value={modelo} onChange={(e) => setModelo(e.target.value)} /></Field>
          <Field label="Año"><Input value={anio} onChange={(e) => setAnio(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Citas({ citas, clientes, onCreated }: { citas: Cita[]; clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [servicio, setServicio] = useState('');

  const crear = async () => {
    if (!fecha || !hora) return showToast('Elige la fecha y la hora de la cita.');
    await apiPost('/taller/citas', { cliente_id: clienteId ? Number(clienteId) : null, fecha, hora, servicio, estado: 'pendiente' });
    setFecha(''); setHora(''); setServicio(''); setClienteId(''); setOpen(false);
    onCreated();
  };

  const nombreCliente = (id: number | null) => clientes.find((c) => c.id === id)?.nombre || '—';

  return (
    <div>
      <PageHeader title="Citas" action={<Button onClick={() => setOpen(true)}>+ Nueva cita</Button>} />
      {citas.length === 0 ? (
        <EmptyState message="No hay citas agendadas." actionLabel="+ Agendar la primera" onAction={() => setOpen(true)} />
      ) : (
        <Table head={['Fecha', 'Hora', 'Cliente', 'Servicio', 'Estado']}>
          {citas.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5">{formatDate(c.fecha)}</td>
              <td className="px-4 py-2.5">{c.hora}</td>
              <td className="px-4 py-2.5">{nombreCliente(c.cliente_id)}</td>
              <td className="px-4 py-2.5">{c.servicio || '—'}</td>
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
          <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Field>
          <Field label="Servicio"><Input value={servicio} onChange={(e) => setServicio(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Agendar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Inventario({ inventario, onCreated }: { inventario: InventarioItem[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [sku, setSku] = useState('');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del repuesto.');
    await apiPost('/taller/inventario', { nombre, sku, precio: Number(precio || 0), stock: Number(stock || 0) });
    setNombre(''); setSku(''); setPrecio(''); setStock(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Inventario" action={<Button onClick={() => setOpen(true)}>+ Nuevo repuesto</Button>} />
      {inventario.length === 0 ? (
        <EmptyState message="Aún no hay repuestos en inventario." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} />
      ) : (
        <Table head={['Nombre', 'SKU', 'Precio', 'Stock']}>
          {inventario.map((i) => (
            <tr key={i.id}>
              <td className="px-4 py-2.5 font-medium text-white">{i.nombre}</td>
              <td className="px-4 py-2.5">{i.sku || '—'}</td>
              <td className="px-4 py-2.5">{formatL(i.precio)}</td>
              <td className="px-4 py-2.5">
                <Badge tone={i.stock <= 5 ? 'danger' : 'success'}>{i.stock} und.</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo repuesto">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="SKU"><Input value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
          <Field label="Precio (L.)"><Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Field>
          <Field label="Stock"><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
