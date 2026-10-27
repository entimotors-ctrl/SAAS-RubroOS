import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../../lib/api';
import { useAuth } from '../../../lib/use-auth';
import { formatL } from '../../../lib/currency';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select } from '../../../components/ui';

type Item = { producto_id?: number; descripcion: string; cantidad: number; precio_unitario: number };
type Order = { id: number; cliente_nombre: string; placa: string; kilometraje: number; motivo: string; responsable: string; diagnostico: string; estado: string; version: number; venta_id: number | null; presupuesto: Item[]; eventos: { id: number; evento: string; created_at: string; detalle: string }[] };
type Props = { clientes: {id: number; nombre: string}[]; vehiculos: {id: number; cliente_id: number | null; placa?: string}[]; inventario: {id: number; nombre: string; stock: number; precio: number}[]; onChanged: () => void };
const labels: Record<string, string> = { recibida: 'Recibida', presupuestada: 'Por aprobar', aprobada: 'Aprobada', en_trabajo: 'En reparación', lista: 'Lista para entregar', entregada: 'Entregada', cancelada: 'Cancelada' };
const amount = (items: Item[]) => items.reduce((total, item) => total + Math.round(item.cantidad * item.precio_unitario * 100), 0) / 100;

export function RepairOrders({ clientes, vehiculos, inventario, onChanged }: Props) {
  const { user } = useAuth();
  const admin = user?.role === 'tenant_admin';
  const [rows, setRows] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [filter, setFilter] = useState('abiertas');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [client, setClient] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [mileage, setMileage] = useState('0');
  const [reason, setReason] = useState('');
  const [person, setPerson] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [paymentType, setPaymentType] = useState('contado');
  const [initial, setInitial] = useState('0');
  const [actionError, setActionError] = useState('');
  async function load() {
    setLoading(true);
    try { setRows(await apiGet<Order[]>('/taller/ordenes')); setError(''); }
    catch { setError('No se pudieron cargar las órdenes. Intenta de nuevo.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    apiGet<Order[]>('/taller/ordenes').then(data => { if (active) { setRows(data); setError(''); } })
      .catch(() => { if (active) setError('No se pudieron cargar las órdenes. Intenta de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  function choose(order: Order) {
    setSelected(order); setItems(order.presupuesto); setDiagnosis(order.diagnostico);
    setNote(''); setActionError(''); setPaymentType('contado'); setInitial('0');
  }
  async function run(path: string, data: unknown) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setActionError('');
    try {
      const order = await apiPost<Order>(path, data);
      choose(order); setNewOpen(false); await load(); onChanged();
    } catch (e) { setActionError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const visible = rows.filter(o => (filter !== 'abiertas' || !['entregada', 'cancelada'].includes(o.estado)) && `${o.id} ${o.placa} ${o.cliente_nombre}`.toLowerCase().includes(search.toLowerCase()));
  const editable = selected && ['recibida', 'presupuestada'].includes(selected.estado);
  const dirty = selected && (JSON.stringify(items) !== JSON.stringify(selected.presupuesto) || diagnosis !== selected.diagnostico);
  const state = (estado: string) => selected && run(`/taller/ordenes/${selected.id}/estado`, { version: selected.version, estado, nota: note });
  return <div>
    <PageHeader title="Órdenes de reparación" subtitle="Sigue cada vehículo desde la recepción hasta la entrega." action={admin ? <Button onClick={() => { setClient(''); setVehicle(''); setReason(''); setMileage('0'); setPerson(''); setNewOpen(true); setActionError(''); }}>Recibir vehículo</Button> : undefined} />
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <Input aria-label="Buscar orden" placeholder="Buscar por orden, placa o cliente" value={search} onChange={e => setSearch(e.target.value)} />
      <Select aria-label="Filtrar órdenes" value={filter} onChange={e => setFilter(e.target.value)}><option value="abiertas">Órdenes abiertas</option><option value="todas">Todas las órdenes</option></Select>
      <Button variant="ghost" disabled={loading} onClick={() => { void load(); }}>Actualizar listado</Button>
    </div>
    {error && <p role="alert" className="mb-4 text-red-300">{error}</p>}
    <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        {loading && <p className="text-slate-400">Cargando órdenes…</p>}
        {!loading && !visible.length && <EmptyState message="No hay órdenes para este filtro." />}
        {visible.map(o => <button key={o.id} onClick={() => choose(o)} className={`w-full rounded-xl border p-4 text-left ${selected?.id === o.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 bg-slate-900'}`}>
          <div className="flex justify-between gap-2"><strong className="text-white">#{o.id} · {o.placa || 'Sin placa'}</strong><Badge>{labels[o.estado]}</Badge></div>
          <p className="mt-2 text-sm text-slate-300">{o.cliente_nombre}</p><p className="mt-1 truncate text-xs text-slate-400">{o.motivo}</p>
        </button>)}
      </div>
      {selected ? <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-white">Orden #{selected.id} · {selected.placa}</h2><Badge>{labels[selected.estado]}</Badge></div>
        <p className="text-sm text-slate-300">{selected.cliente_nombre} · {selected.kilometraje} km · Responsable: {selected.responsable || 'Sin asignar'}</p>
        <p className="my-3 text-sm text-slate-300">Motivo: {selected.motivo}</p>
        {actionError && !newOpen && <p role="alert" className="mb-3 text-red-300">{actionError} <Button variant="ghost" onClick={async () => { try { choose(await apiGet<Order>(`/taller/ordenes/${selected.id}`)); } catch { /* toast */ } }}>Recargar orden</Button></p>}
        <fieldset disabled={busy || !admin} className="space-y-4">
          <Field label="Diagnóstico"><Input readOnly={!editable} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} /></Field>
          <div className="space-y-2">
            {items.map((item, index) => <div key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-3">
              <span className="min-w-32 flex-1 text-sm text-white">{item.descripcion}<small className="block text-slate-400">{item.producto_id ? 'Repuesto de inventario' : 'Servicio / concepto libre'}</small></span>
              <Input aria-label={`Cantidad de ${item.descripcion}`} className="w-24" type="number" min="0.001" step="0.001" readOnly={!editable} value={item.cantidad} onChange={e => setItems(lines => lines.map((line, n) => n === index ? { ...line, cantidad: Number(e.target.value) } : line))} />
              <span className="text-sm text-slate-200">{formatL(item.precio_unitario)} c/u</span>
              {editable && <Button variant="ghost" onClick={() => setItems(lines => lines.filter((_, n) => n !== index))}>Quitar</Button>}
            </div>)}
          </div>
          {editable && <>
            <Field label="Añadir repuesto"><Select value="" onChange={e => { const p = inventario.find(x => x.id === Number(e.target.value)); if(p) setItems(lines => [...lines, { producto_id: p.id, descripcion: p.nombre, cantidad: 1, precio_unitario: p.precio }]); }}><option value="">Seleccionar del inventario</option>{inventario.map(p => <option key={p.id} value={p.id}>{p.nombre} · Stock {p.stock} · {formatL(p.precio)}</option>)}</Select></Field>
            <div className="flex flex-wrap gap-2"><Input aria-label="Concepto de servicio" placeholder="Mano de obra / servicio" className="min-w-40 flex-1" value={description} onChange={e => setDescription(e.target.value)} /><Input aria-label="Precio del servicio" type="number" min="0" step="0.01" className="w-32" placeholder="Precio L." value={price} onChange={e => setPrice(e.target.value)} /><Button variant="ghost" disabled={!description.trim() || price === '' || Number(price) < 0} onClick={() => { setItems(lines => [...lines, { descripcion: description, cantidad: 1, precio_unitario: Number(price) }]); setDescription(''); setPrice(''); }}>Añadir servicio</Button></div>
            <Button disabled={!items.length || !diagnosis.trim()} onClick={() => run(`/taller/ordenes/${selected.id}/presupuesto`, { version: selected.version, diagnostico: diagnosis, items })}>Guardar presupuesto</Button>
          </>}
          {dirty && <p className="text-sm text-amber-300">Guarda los cambios del presupuesto antes de registrar la aprobación.</p>}
          <p className="text-right text-xl font-bold text-white">Presupuesto: {formatL(amount(items))}</p>
          {['recibida','presupuestada','aprobada'].includes(selected.estado) && <Field label="Constancia de aprobación o motivo de cancelación"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Quién autorizó, por qué medio y cuándo" /></Field>}
          <div className="flex flex-wrap gap-2">
            {selected.estado === 'presupuestada' && <Button disabled={!note.trim() || Boolean(dirty)} onClick={() => state('aprobada')}>Registrar aprobación del cliente</Button>}
            {selected.estado === 'aprobada' && <Button onClick={() => state('en_trabajo')}>Iniciar reparación</Button>}
            {selected.estado === 'en_trabajo' && <Button onClick={() => state('lista')}>Marcar lista</Button>}
            {['recibida','presupuestada','aprobada'].includes(selected.estado) && <Button variant="danger" disabled={!note.trim()} onClick={() => state('cancelada')}>Cancelar orden</Button>}
          </div>
          {selected.estado === 'lista' && <div className="space-y-3 rounded-xl border border-emerald-500/30 p-4">
            <p className="text-sm text-slate-300">Al entregar se registrará la venta y se descontarán los repuestos del inventario.</p>
            <Field label="Forma de venta"><Select value={paymentType} onChange={e => setPaymentType(e.target.value)}><option value="contado">Contado: pago completo</option><option value="credito">Crédito</option></Select></Field>
            {paymentType === 'credito' && <Field label="Pago inicial (L.)"><Input type="number" min="0" step="0.01" value={initial} onChange={e => setInitial(e.target.value)} /></Field>}
            <Button onClick={() => run(`/taller/ordenes/${selected.id}/entregar`, { version: selected.version, tipo: paymentType, pagado_inicial: Number(initial) })}>Entregar y registrar venta</Button>
          </div>}
        </fieldset>
        {selected.venta_id && <p className="mt-4 text-emerald-300">Entrega registrada · Venta #{selected.venta_id}. Consulta el saldo en Créditos.</p>}
        <h3 className="mb-2 mt-6 font-semibold text-white">Historial de la orden</h3>
        <ol className="space-y-2 text-sm text-slate-400">{selected.eventos.map(e => { const detail = JSON.parse(e.detalle) as {nota?: string}; return <li key={e.id}><span className="text-slate-200">{labels[e.evento] || e.evento}</span> · {e.created_at} UTC{detail.nota && <p>{detail.nota}</p>}</li>; })}</ol>
      </Card> : <Card className="p-8"><EmptyState message="Selecciona una orden para consultar su presupuesto y avance." /></Card>}
    </div>
    <Modal open={newOpen} onClose={() => !busy && setNewOpen(false)} title="Recibir vehículo">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run('/taller/ordenes', { cliente_id: Number(client), vehiculo_id: Number(vehicle), kilometraje: Number(mileage), motivo: reason, responsable: person }); }}>
        {actionError && <p role="alert" className="text-red-300">{actionError}</p>}
        <Field label="Cliente"><Select required value={client} onChange={e => { setClient(e.target.value); setVehicle(''); }}><option value="">Seleccionar cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
        <Field label="Vehículo del cliente"><Select required value={vehicle} onChange={e => setVehicle(e.target.value)}><option value="">Seleccionar vehículo</option>{vehiculos.filter(v => v.cliente_id === Number(client)).map(v => <option key={v.id} value={v.id}>{v.placa || `Vehículo ${v.id}`}</option>)}</Select></Field>
        <p className="text-xs text-slate-400">Registra primero el cliente y su vehículo en los módulos correspondientes.</p>
        <Field label="Kilometraje"><Input type="number" min="0" required value={mileage} onChange={e => setMileage(e.target.value)} /></Field>
        <Field label="Motivo de ingreso"><Input required maxLength={4000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <Field label="Responsable"><Input value={person} maxLength={4000} onChange={e => setPerson(e.target.value)} /></Field>
        <Button type="submit" disabled={busy}>Guardar recepción</Button>
      </form>
    </Modal>
  </div>;
}
