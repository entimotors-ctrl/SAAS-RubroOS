import { useEffect, useState } from 'react';
import { Drone, LayoutDashboard, Package, ShoppingCart, Users, Zap } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiGet, apiPost } from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatDate, formatL } from '../../../lib/currency';
import { showToast } from '../../../lib/toast';

const business = getBusinessType('agro')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'productos', label: 'Insumos', icon: Package },
  { id: 'dron', label: 'Cotizador de Dron', icon: Drone },
  { id: 'cerca', label: 'Cotizador de Cercas', icon: Zap },
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingCart },
  { id: 'clientes', label: 'Clientes / Fincas', icon: Users },
];

interface Producto { id: number; nombre: string; categoria?: string; precio: number; stock: number; unidad?: string }
interface Cliente { id: number; nombre: string; finca?: string; telefono?: string }
interface PedidoItem { producto_id: number | null; cantidad: number; precio_unitario: number; subtotal: number }
interface Pedido { id: number; cliente_id: number | null; cliente_nombre?: string; estado: string; total: number; created_at: string; items: PedidoItem[] }
interface CotizacionDron { id: number; cliente_nombre?: string; hectareas: number; tipo_servicio: string; precio_estimado: number; created_at: string }
interface CotizacionCerca { id: number; cliente_nombre?: string; metros: number; hilos: number; precio_estimado: number; created_at: string }

export default function AgroApp() {
  const [tab, setTab] = useState('resumen');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [dron, setDron] = useState<CotizacionDron[]>([]);
  const [cerca, setCerca] = useState<CotizacionCerca[]>([]);

  const cargarTodo = () => {
    apiGet<Producto[]>('/agro/productos').then(setProductos);
    apiGet<Cliente[]>('/agro/clientes').then(setClientes);
    apiGet<Pedido[]>('/agro/pedidos').then(setPedidos);
    apiGet<CotizacionDron[]>('/agro/cotizaciones-dron').then(setDron);
    apiGet<CotizacionCerca[]>('/agro/cotizaciones-cerca').then(setCerca);
  };
  useEffect(cargarTodo, []);

  const stockBajo = productos.filter((p) => p.stock <= 10).length;

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      {tab === 'resumen' && (
        <div>
          <PageHeader title="Resumen agropecuario" subtitle="Insumos, pedidos y cotizaciones." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Productos en catálogo" value={productos.length} accent={business.accent} />
            <StatCard label="Stock bajo (≤10)" value={stockBajo} accent="#f87171" />
            <StatCard label="Pedidos pendientes" value={pedidos.filter((p) => p.estado === 'pendiente').length} />
            <StatCard label="Cotizaciones generadas" value={dron.length + cerca.length} />
          </div>
        </div>
      )}
      {tab === 'productos' && <Productos productos={productos} onCreated={cargarTodo} />}
      {tab === 'dron' && <CotizadorDron cotizaciones={dron} onCreated={cargarTodo} />}
      {tab === 'cerca' && <CotizadorCerca cotizaciones={cerca} onCreated={cargarTodo} />}
      {tab === 'pedidos' && <Pedidos pedidos={pedidos} productos={productos} clientes={clientes} onCreated={cargarTodo} />}
      {tab === 'clientes' && <Clientes clientes={clientes} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

function Productos({ productos, onCreated }: { productos: Producto[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [precio, setPrecio] = useState('');
  const [stock, setStock] = useState('');
  const [unidad, setUnidad] = useState('unidad');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del insumo.');
    await apiPost('/agro/productos', { nombre, categoria, precio: Number(precio || 0), stock: Number(stock || 0), unidad });
    setNombre(''); setCategoria(''); setPrecio(''); setStock(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Insumos agropecuarios" action={<Button onClick={() => setOpen(true)}>+ Nuevo insumo</Button>} />
      {productos.length === 0 ? <EmptyState message="Aún no hay productos." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Categoría', 'Precio', 'Stock']}>
          {productos.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2.5 font-medium text-white">{p.nombre}</td>
              <td className="px-4 py-2.5">{p.categoria || '—'}</td>
              <td className="px-4 py-2.5">{formatL(p.precio)} / {p.unidad}</td>
              <td className="px-4 py-2.5"><Badge tone={p.stock <= 10 ? 'danger' : 'success'}>{p.stock}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo insumo">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Categoría"><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} /></Field>
          <Field label="Precio (L.)"><Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Field>
          <Field label="Stock"><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
          <Field label="Unidad">
            <Select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              <option value="unidad">Unidad</option>
              <option value="quintal">Quintal</option>
              <option value="rollo">Rollo</option>
              <option value="litro">Litro</option>
            </Select>
          </Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function CotizadorDron({ cotizaciones, onCreated }: { cotizaciones: CotizacionDron[]; onCreated: () => void }) {
  const [clienteNombre, setClienteNombre] = useState('');
  const [hectareas, setHectareas] = useState('');
  const [tipoServicio, setTipoServicio] = useState('fumigacion');
  const [resultado, setResultado] = useState<CotizacionDron | null>(null);

  const cotizar = async () => {
    if (!hectareas) return showToast('Escribe las hectáreas a cotizar.');
    const r = await apiPost<CotizacionDron>('/agro/cotizaciones-dron', { cliente_nombre: clienteNombre, hectareas: Number(hectareas), tipo_servicio: tipoServicio });
    setResultado(r);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Cotizador de servicio con dron" subtitle="Fumigación, fertilización o mapeo por hectárea." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="space-y-3">
            <Field label="Cliente"><Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} /></Field>
            <Field label="Hectáreas"><Input type="number" value={hectareas} onChange={(e) => setHectareas(e.target.value)} /></Field>
            <Field label="Tipo de servicio">
              <Select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)}>
                <option value="fumigacion">Fumigación (L. 350/ha)</option>
                <option value="fertilizacion">Fertilización (L. 300/ha)</option>
                <option value="mapeo">Mapeo aéreo (L. 250/ha)</option>
              </Select>
            </Field>
            <Button className="w-full" onClick={cotizar}>Cotizar</Button>
            {resultado && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                <p className="text-xs text-slate-400">Precio estimado</p>
                <p className="text-xl font-bold text-white">{formatL(resultado.precio_estimado)}</p>
              </div>
            )}
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Historial de cotizaciones</h3>
          {cotizaciones.length === 0 ? <EmptyState message="Sin cotizaciones aún." /> : (
            <Table head={['Fecha', 'Cliente', 'Hectáreas', 'Servicio', 'Precio']}>
              {cotizaciones.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-2.5">{c.cliente_nombre || '—'}</td>
                  <td className="px-4 py-2.5">{c.hectareas} ha</td>
                  <td className="px-4 py-2.5">{c.tipo_servicio}</td>
                  <td className="px-4 py-2.5">{formatL(c.precio_estimado)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function CotizadorCerca({ cotizaciones, onCreated }: { cotizaciones: CotizacionCerca[]; onCreated: () => void }) {
  const [clienteNombre, setClienteNombre] = useState('');
  const [metros, setMetros] = useState('');
  const [hilos, setHilos] = useState('4');
  const [resultado, setResultado] = useState<CotizacionCerca | null>(null);

  const cotizar = async () => {
    if (!metros) return showToast('Escribe los metros lineales a cotizar.');
    const r = await apiPost<CotizacionCerca>('/agro/cotizaciones-cerca', { cliente_nombre: clienteNombre, metros: Number(metros), hilos: Number(hilos) });
    setResultado(r);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Cotizador de cercas eléctricas" subtitle="Material + mano de obra por metro lineal." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="space-y-3">
            <Field label="Cliente"><Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} /></Field>
            <Field label="Metros lineales"><Input type="number" value={metros} onChange={(e) => setMetros(e.target.value)} /></Field>
            <Field label="Número de hilos">
              <Select value={hilos} onChange={(e) => setHilos(e.target.value)}>
                <option value="2">2 hilos</option>
                <option value="4">4 hilos</option>
                <option value="6">6 hilos</option>
              </Select>
            </Field>
            <Button className="w-full" onClick={cotizar}>Cotizar</Button>
            {resultado && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                <p className="text-xs text-slate-400">Precio estimado</p>
                <p className="text-xl font-bold text-white">{formatL(resultado.precio_estimado)}</p>
              </div>
            )}
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Historial de cotizaciones</h3>
          {cotizaciones.length === 0 ? <EmptyState message="Sin cotizaciones aún." /> : (
            <Table head={['Fecha', 'Cliente', 'Metros', 'Hilos', 'Precio']}>
              {cotizaciones.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-2.5">{c.cliente_nombre || '—'}</td>
                  <td className="px-4 py-2.5">{c.metros} m</td>
                  <td className="px-4 py-2.5">{c.hilos}</td>
                  <td className="px-4 py-2.5">{formatL(c.precio_estimado)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function Pedidos({ pedidos, productos, clientes, onCreated }: { pedidos: Pedido[]; productos: Producto[]; clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [carrito, setCarrito] = useState<{ producto_id: number; cantidad: number; precio_unitario: number; nombre: string }[]>([]);

  const agregar = (p: Producto) => setCarrito((c) => [...c, { producto_id: p.id, cantidad: 1, precio_unitario: p.precio, nombre: p.nombre }]);
  const total = carrito.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);

  const crear = async () => {
    if (carrito.length === 0) return;
    await apiPost('/agro/pedidos', { cliente_id: clienteId ? Number(clienteId) : null, items: carrito });
    setCarrito([]); setClienteId(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Pedidos" action={<Button onClick={() => setOpen(true)}>+ Nuevo pedido</Button>} />
      {pedidos.length === 0 ? <EmptyState message="Aún no hay pedidos." actionLabel="+ Crear el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Fecha', 'Cliente', 'Total', 'Estado']}>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2.5">{formatDate(p.created_at)}</td>
              <td className="px-4 py-2.5">{p.cliente_nombre || '—'}</td>
              <td className="px-4 py-2.5">{formatL(p.total)}</td>
              <td className="px-4 py-2.5"><Badge>{p.estado}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo pedido">
        <div className="space-y-3">
          <Field label="Cliente">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin asignar</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            {productos.map((p) => (
              <button key={p.id} onClick={() => agregar(p)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:border-green-400 hover:text-white">
                {p.nombre}
              </button>
            ))}
          </div>
          {carrito.map((i, idx) => <p key={idx} className="text-xs text-slate-400">{i.nombre} × {i.cantidad} = {formatL(i.cantidad * i.precio_unitario)}</p>)}
          <div className="rounded-xl bg-white/5 p-3 text-right">
            <p className="text-xs text-slate-400">Total</p>
            <p className="text-xl font-bold text-white">{formatL(total)}</p>
          </div>
          <Button className="w-full" onClick={crear} disabled={carrito.length === 0}>Crear pedido</Button>
        </div>
      </Modal>
    </div>
  );
}

function Clientes({ clientes, onCreated }: { clientes: Cliente[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [finca, setFinca] = useState('');
  const [telefono, setTelefono] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del cliente.');
    await apiPost('/agro/clientes', { nombre, finca, telefono });
    setNombre(''); setFinca(''); setTelefono(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Clientes y fincas" action={<Button onClick={() => setOpen(true)}>+ Nuevo cliente</Button>} />
      {clientes.length === 0 ? <EmptyState message="Aún no hay clientes." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Finca', 'Teléfono']}>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-2.5 font-medium text-white">{c.nombre}</td>
              <td className="px-4 py-2.5">{c.finca || '—'}</td>
              <td className="px-4 py-2.5">{c.telefono || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cliente">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Finca"><Input value={finca} onChange={(e) => setFinca(e.target.value)} /></Field>
          <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
