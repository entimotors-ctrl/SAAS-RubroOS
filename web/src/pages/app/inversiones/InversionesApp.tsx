import { useEffect, useState } from 'react';
import { Handshake, LayoutDashboard, Tag, TrendingUp } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiGet, apiPost, apiPut } from '../../../lib/api';
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatL } from '../../../lib/currency';
import { showToast } from '../../../lib/toast';

const business = getBusinessType('inversiones')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'oportunidades', label: 'Oportunidades', icon: TrendingUp },
  { id: 'categorias', label: 'Categorías', icon: Tag },
  { id: 'interesados', label: 'Interesados', icon: Handshake },
];

interface Categoria { id: number; nombre: string }
interface Oportunidad {
  id: number; categoria_id: number | null; categoria_nombre?: string; nombre: string; descripcion?: string;
  monto_minimo: number; retorno_pct: number; plazo_meses: number; riesgo: string; cupos_totales: number; cupos_disponibles: number; estado: string;
}
interface Interesado { id: number; oportunidad_id: number | null; oportunidad_nombre?: string; nombre: string; telefono?: string; email?: string; monto_interes: number; estado: string }

export default function InversionesApp() {
  const [tab, setTab] = useState('resumen');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [interesados, setInteresados] = useState<Interesado[]>([]);

  const cargarTodo = () => {
    apiGet<Categoria[]>('/inversiones/categorias').then(setCategorias);
    apiGet<Oportunidad[]>('/inversiones/oportunidades').then(setOportunidades);
    apiGet<Interesado[]>('/inversiones/interesados').then(setInteresados);
  };
  useEffect(cargarTodo, []);

  const capitalCaptado = interesados.filter((i) => i.estado === 'confirmado').reduce((s, i) => s + i.monto_interes, 0);

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      {tab === 'resumen' && (
        <div>
          <PageHeader title="Resumen del catálogo" subtitle="Oportunidades activas y captación." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Oportunidades abiertas" value={oportunidades.filter((o) => o.estado === 'abierta').length} accent={business.accent} />
            <StatCard label="Interesados nuevos" value={interesados.filter((i) => i.estado === 'nuevo').length} />
            <StatCard label="Capital confirmado" value={formatL(capitalCaptado)} accent="#4ade80" />
            <StatCard label="Categorías" value={categorias.length} />
          </div>
        </div>
      )}
      {tab === 'oportunidades' && <Oportunidades oportunidades={oportunidades} categorias={categorias} onCreated={cargarTodo} />}
      {tab === 'categorias' && <Categorias categorias={categorias} onCreated={cargarTodo} />}
      {tab === 'interesados' && <Interesados interesados={interesados} oportunidades={oportunidades} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

const riesgoTone = (r: string) => (r === 'bajo' ? 'success' : r === 'alto' ? 'danger' : 'warning') as 'success' | 'danger' | 'warning';

function Oportunidades({ oportunidades, categorias, onCreated }: { oportunidades: Oportunidad[]; categorias: Categoria[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [montoMinimo, setMontoMinimo] = useState('');
  const [retorno, setRetorno] = useState('');
  const [plazo, setPlazo] = useState('12');
  const [riesgo, setRiesgo] = useState('medio');
  const [cupos, setCupos] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre de la oportunidad.');
    await apiPost('/inversiones/oportunidades', {
      categoria_id: categoriaId ? Number(categoriaId) : null, nombre, descripcion,
      monto_minimo: Number(montoMinimo || 0), retorno_pct: Number(retorno || 0), plazo_meses: Number(plazo || 12),
      riesgo, cupos_totales: Number(cupos || 0),
    });
    setNombre(''); setDescripcion(''); setMontoMinimo(''); setRetorno(''); setCupos(''); setOpen(false);
    onCreated();
  };

  const cerrar = async (o: Oportunidad) => {
    await apiPut(`/inversiones/oportunidades/${o.id}`, { estado: o.estado === 'abierta' ? 'cerrada' : 'abierta' });
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Oportunidades de inversión" action={<Button onClick={() => setOpen(true)}>+ Nueva oportunidad</Button>} />
      {oportunidades.length === 0 ? <EmptyState message="Aún no hay oportunidades publicadas." actionLabel="+ Publicar la primera" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Categoría', 'Monto mín.', 'Retorno', 'Plazo', 'Riesgo', 'Cupos', 'Estado', '']}>
          {oportunidades.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-2.5 font-medium text-white">{o.nombre}</td>
              <td className="px-4 py-2.5">{o.categoria_nombre || '—'}</td>
              <td className="px-4 py-2.5">{formatL(o.monto_minimo)}</td>
              <td className="px-4 py-2.5 text-emerald-400">{o.retorno_pct}%</td>
              <td className="px-4 py-2.5">{o.plazo_meses} meses</td>
              <td className="px-4 py-2.5"><Badge tone={riesgoTone(o.riesgo)}>{o.riesgo}</Badge></td>
              <td className="px-4 py-2.5">{o.cupos_disponibles}/{o.cupos_totales}</td>
              <td className="px-4 py-2.5"><Badge tone={o.estado === 'abierta' ? 'success' : 'default'}>{o.estado}</Badge></td>
              <td className="px-4 py-2.5"><Button variant="ghost" onClick={() => cerrar(o)}>{o.estado === 'abierta' ? 'Cerrar' : 'Reabrir'}</Button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva oportunidad">
        <div className="space-y-3">
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Descripción"><Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Field>
          <Field label="Categoría">
            <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto mínimo (L.)"><Input type="number" value={montoMinimo} onChange={(e) => setMontoMinimo(e.target.value)} /></Field>
            <Field label="Retorno (%)"><Input type="number" value={retorno} onChange={(e) => setRetorno(e.target.value)} /></Field>
            <Field label="Plazo (meses)"><Input type="number" value={plazo} onChange={(e) => setPlazo(e.target.value)} /></Field>
            <Field label="Cupos totales"><Input type="number" value={cupos} onChange={(e) => setCupos(e.target.value)} /></Field>
          </div>
          <Field label="Riesgo">
            <Select value={riesgo} onChange={(e) => setRiesgo(e.target.value)}>
              <option value="bajo">Bajo</option>
              <option value="medio">Medio</option>
              <option value="alto">Alto</option>
            </Select>
          </Field>
          <Button className="w-full" onClick={crear}>Publicar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Categorias({ categorias, onCreated }: { categorias: Categoria[]; onCreated: () => void }) {
  const [nombre, setNombre] = useState('');
  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre de la categoría.');
    await apiPost('/inversiones/categorias', { nombre });
    setNombre('');
    onCreated();
  };
  return (
    <div>
      <PageHeader title="Categorías" />
      <div className="mb-4 flex gap-2">
        <Input placeholder="Nueva categoría" value={nombre} onChange={(e) => setNombre(e.target.value)} className="max-w-xs" />
        <Button onClick={crear}>Agregar</Button>
      </div>
      {categorias.length === 0 ? <EmptyState message="Sin categorías todavía." /> : (
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => <Badge key={c.id}>{c.nombre}</Badge>)}
        </div>
      )}
    </div>
  );
}

function Interesados({ interesados, oportunidades, onCreated }: { interesados: Interesado[]; oportunidades: Oportunidad[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [oportunidadId, setOportunidadId] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [monto, setMonto] = useState('');

  const crear = async () => {
    if (!nombre) return showToast('Escribe el nombre del interesado.');
    await apiPost('/inversiones/interesados', { oportunidad_id: oportunidadId ? Number(oportunidadId) : null, nombre, telefono, email, monto_interes: Number(monto || 0) });
    setNombre(''); setTelefono(''); setEmail(''); setMonto(''); setOportunidadId(''); setOpen(false);
    onCreated();
  };

  const cambiarEstado = async (i: Interesado, estado: string) => {
    await apiPut(`/inversiones/interesados/${i.id}/estado`, { estado });
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Interesados" action={<Button onClick={() => setOpen(true)}>+ Nuevo interesado</Button>} />
      {interesados.length === 0 ? <EmptyState message="Aún no hay interesados registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Nombre', 'Oportunidad', 'Monto', 'Contacto', 'Estado', '']}>
          {interesados.map((i) => (
            <tr key={i.id}>
              <td className="px-4 py-2.5 font-medium text-white">{i.nombre}</td>
              <td className="px-4 py-2.5">{i.oportunidad_nombre || '—'}</td>
              <td className="px-4 py-2.5">{formatL(i.monto_interes)}</td>
              <td className="px-4 py-2.5 text-xs text-slate-400">{i.telefono || i.email || '—'}</td>
              <td className="px-4 py-2.5"><Badge tone={i.estado === 'confirmado' ? 'success' : 'default'}>{i.estado}</Badge></td>
              <td className="px-4 py-2.5">
                {i.estado !== 'confirmado' && <Button variant="ghost" onClick={() => cambiarEstado(i, 'confirmado')}>Confirmar</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo interesado">
        <div className="space-y-3">
          <Field label="Oportunidad">
            <Select value={oportunidadId} onChange={(e) => setOportunidadId(e.target.value)}>
              <option value="">Sin definir</option>
              {oportunidades.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Teléfono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Field>
          <Field label="Correo"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Monto de interés (L.)"><Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
