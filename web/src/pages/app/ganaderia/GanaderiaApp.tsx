import { useEffect, useState } from 'react';
import { Beef, Dna, LayoutDashboard, Mars, Milk, Syringe, Venus } from 'lucide-react';
import { DashboardShell, type NavItem } from '../../../components/DashboardShell';
import { getBusinessType } from '../../../lib/business-types';
import { apiGet, apiPost } from '../../../lib/api';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table } from '../../../components/ui';
import { formatDate } from '../../../lib/currency';
import { showToast } from '../../../lib/toast';

const business = getBusinessType('ganaderia')!;

const NAV: NavItem[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'hato', label: 'Hato', icon: Beef },
  { id: 'produccion', label: 'Producción de leche', icon: Milk },
  { id: 'sanidad', label: 'Sanidad', icon: Syringe },
  { id: 'reproduccion', label: 'Reproducción', icon: Dna },
];

interface Animal { id: number; arete: string; nombre?: string; raza?: string; sexo: string; fecha_nacimiento?: string; peso_kg?: number; estado: string; madre_arete?: string; padre_arete?: string }
interface Produccion { id: number; animal_id: number; arete: string; animal_nombre?: string; fecha: string; turno: string; litros: number }
interface ResumenProduccion { litrosHoy: number; ultimaSemana: { fecha: string; litros: number }[]; porAnimal: { arete: string; nombre?: string; litros: number }[]; totalAnimales: number }
interface Sanidad { id: number; animal_id: number; tipo: string; nombre: string; fecha: string; proxima_fecha?: string; notas?: string }
interface Alerta { id: number; arete: string; animal_nombre?: string; nombre: string; proxima_fecha: string }
interface Reproduccion { id: number; animal_id: number; tipo: string; fecha: string; fecha_probable_parto?: string; notas?: string }

export default function GanaderiaApp() {
  const [tab, setTab] = useState('resumen');
  const [animales, setAnimales] = useState<Animal[]>([]);
  const [produccion, setProduccion] = useState<Produccion[]>([]);
  const [resumenProd, setResumenProd] = useState<ResumenProduccion | null>(null);
  const [sanidad, setSanidad] = useState<Sanidad[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [reproduccion, setReproduccion] = useState<Reproduccion[]>([]);

  const cargarTodo = () => {
    apiGet<Animal[]>('/ganaderia/animales').then(setAnimales);
    apiGet<Produccion[]>('/ganaderia/produccion').then(setProduccion);
    apiGet<ResumenProduccion>('/ganaderia/produccion/resumen').then(setResumenProd);
    apiGet<Sanidad[]>('/ganaderia/sanidad').then(setSanidad);
    apiGet<Alerta[]>('/ganaderia/sanidad/alertas').then(setAlertas);
    apiGet<Reproduccion[]>('/ganaderia/reproduccion').then(setReproduccion);
  };
  useEffect(cargarTodo, []);

  const nombreAnimal = (id: number) => {
    const a = animales.find((x) => x.id === id);
    return a ? `${a.arete}${a.nombre ? ' · ' + a.nombre : ''}` : '—';
  };

  return (
    <DashboardShell business={business} navItems={NAV} activeTab={tab} onTabChange={setTab}>
      {tab === 'resumen' && (
        <div>
          <PageHeader title="Resumen del hato" subtitle="Producción, sanidad y estado general." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Animales activos" value={resumenProd?.totalAnimales ?? animales.length} accent={business.accent} />
            <StatCard label="Litros hoy" value={`${resumenProd?.litrosHoy ?? 0} L`} accent="#34d399" />
            <StatCard label="Alertas de sanidad" value={alertas.length} accent={alertas.length > 0 ? '#f87171' : undefined} />
            <StatCard label="Eventos reproductivos" value={reproduccion.length} />
          </div>

          {alertas.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-300">Próximas vacunas / tratamientos (30 días)</h3>
              <Table head={['Animal', 'Tipo', 'Nombre', 'Próxima fecha']}>
                {alertas.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5">{a.arete} {a.animal_nombre}</td>
                    <td className="px-4 py-2.5"><Badge tone="warning">Recordatorio</Badge></td>
                    <td className="px-4 py-2.5">{a.nombre}</td>
                    <td className="px-4 py-2.5">{formatDate(a.proxima_fecha)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          {resumenProd && resumenProd.porAnimal.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-300">Producción semanal por animal</h3>
              <Card className="p-4">
                <div className="space-y-2">
                  {resumenProd.porAnimal.map((a) => {
                    const max = Math.max(...resumenProd.porAnimal.map((x) => x.litros), 1);
                    return (
                      <div key={a.arete} className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-slate-400">{a.arete}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full" style={{ width: `${(a.litros / max) * 100}%`, backgroundColor: business.accent }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-slate-300">{a.litros} L</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
      {tab === 'hato' && <Hato animales={animales} onCreated={cargarTodo} />}
      {tab === 'produccion' && <Produccion produccion={produccion} animales={animales} onCreated={cargarTodo} />}
      {tab === 'sanidad' && <Sanidad sanidad={sanidad} animales={animales} nombreAnimal={nombreAnimal} onCreated={cargarTodo} />}
      {tab === 'reproduccion' && <Reproduccion reproduccion={reproduccion} animales={animales} nombreAnimal={nombreAnimal} onCreated={cargarTodo} />}
    </DashboardShell>
  );
}

function Hato({ animales, onCreated }: { animales: Animal[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [arete, setArete] = useState('');
  const [nombre, setNombre] = useState('');
  const [raza, setRaza] = useState('');
  const [sexo, setSexo] = useState('hembra');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [peso, setPeso] = useState('');
  const [madre, setMadre] = useState('');
  const [padre, setPadre] = useState('');

  const crear = async () => {
    if (!arete) return showToast('Escribe el arete o ID del animal.');
    await apiPost('/ganaderia/animales', {
      arete, nombre, raza, sexo, fecha_nacimiento: fechaNacimiento || null, peso_kg: peso ? Number(peso) : null,
      estado: 'activo', madre_arete: madre, padre_arete: padre,
    });
    setArete(''); setNombre(''); setRaza(''); setFechaNacimiento(''); setPeso(''); setMadre(''); setPadre(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Hato" subtitle="Registro de todos los animales de la finca." action={<Button onClick={() => setOpen(true)}>+ Nuevo animal</Button>} />
      {animales.length === 0 ? <EmptyState message="Aún no hay animales registrados." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Arete', 'Nombre', 'Raza', 'Sexo', 'Nacimiento', 'Peso', 'Estado']}>
          {animales.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2.5 font-medium text-white">{a.arete}</td>
              <td className="px-4 py-2.5">{a.nombre || '—'}</td>
              <td className="px-4 py-2.5">{a.raza || '—'}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1">
                  {a.sexo === 'hembra' ? <Venus className="h-3.5 w-3.5 text-pink-400" /> : <Mars className="h-3.5 w-3.5 text-blue-400" />}
                  {a.sexo === 'hembra' ? 'Hembra' : 'Macho'}
                </span>
              </td>
              <td className="px-4 py-2.5">{formatDate(a.fecha_nacimiento)}</td>
              <td className="px-4 py-2.5">{a.peso_kg ? `${a.peso_kg} kg` : '—'}</td>
              <td className="px-4 py-2.5"><Badge tone={a.estado === 'activo' ? 'success' : 'default'}>{a.estado}</Badge></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo animal">
        <div className="space-y-3">
          <Field label="Arete / ID"><Input value={arete} onChange={(e) => setArete(e.target.value)} /></Field>
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
          <Field label="Raza"><Input value={raza} onChange={(e) => setRaza(e.target.value)} /></Field>
          <Field label="Sexo">
            <Select value={sexo} onChange={(e) => setSexo(e.target.value)}>
              <option value="hembra">Hembra</option>
              <option value="macho">Macho</option>
            </Select>
          </Field>
          <Field label="Fecha de nacimiento"><Input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} /></Field>
          <Field label="Peso (kg)"><Input type="number" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>
          <Field label="Arete de la madre"><Input value={madre} onChange={(e) => setMadre(e.target.value)} /></Field>
          <Field label="Arete del padre"><Input value={padre} onChange={(e) => setPadre(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Produccion({ produccion, animales, onCreated }: { produccion: Produccion[]; animales: Animal[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [animalId, setAnimalId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [turno, setTurno] = useState('AM');
  const [litros, setLitros] = useState('');

  const crear = async () => {
    if (!animalId || !litros) return showToast('Selecciona el animal y escribe los litros.');
    await apiPost('/ganaderia/produccion', { animal_id: Number(animalId), fecha, turno, litros: Number(litros) });
    setLitros(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Producción de leche" subtitle="Registro por ordeño, AM y PM." action={<Button onClick={() => setOpen(true)}>+ Registrar ordeño</Button>} />
      {produccion.length === 0 ? <EmptyState message="Aún no hay registros de producción." actionLabel="+ Registrar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Fecha', 'Turno', 'Animal', 'Litros']}>
          {produccion.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2.5">{formatDate(p.fecha)}</td>
              <td className="px-4 py-2.5"><Badge>{p.turno}</Badge></td>
              <td className="px-4 py-2.5">{p.arete} {p.animal_nombre}</td>
              <td className="px-4 py-2.5 font-semibold text-white">{p.litros} L</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Registrar ordeño">
        <div className="space-y-3">
          <Field label="Animal">
            <Select value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
              <option value="">Selecciona un animal</option>
              {animales.filter((a) => a.sexo === 'hembra').map((a) => <option key={a.id} value={a.id}>{a.arete} {a.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Turno">
            <Select value={turno} onChange={(e) => setTurno(e.target.value)}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </Select>
          </Field>
          <Field label="Litros"><Input type="number" value={litros} onChange={(e) => setLitros(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Sanidad({ sanidad, animales, nombreAnimal, onCreated }: { sanidad: Sanidad[]; animales: Animal[]; nombreAnimal: (id: number) => string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [animalId, setAnimalId] = useState('');
  const [tipo, setTipo] = useState('vacuna');
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState('');
  const [proximaFecha, setProximaFecha] = useState('');

  const crear = async () => {
    if (!animalId || !nombre || !fecha) return showToast('Selecciona el animal, el nombre de la vacuna/tratamiento y la fecha.');
    await apiPost('/ganaderia/sanidad', { animal_id: Number(animalId), tipo, nombre, fecha, proxima_fecha: proximaFecha || null });
    setNombre(''); setFecha(''); setProximaFecha(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Sanidad" subtitle="Vacunas y tratamientos aplicados." action={<Button onClick={() => setOpen(true)}>+ Nuevo registro</Button>} />
      {sanidad.length === 0 ? <EmptyState message="Aún no hay registros de sanidad." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Animal', 'Tipo', 'Nombre', 'Fecha', 'Próxima fecha']}>
          {sanidad.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2.5">{nombreAnimal(s.animal_id)}</td>
              <td className="px-4 py-2.5"><Badge tone={s.tipo === 'vacuna' ? 'success' : 'warning'}>{s.tipo}</Badge></td>
              <td className="px-4 py-2.5">{s.nombre}</td>
              <td className="px-4 py-2.5">{formatDate(s.fecha)}</td>
              <td className="px-4 py-2.5">{formatDate(s.proxima_fecha)}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo registro de sanidad">
        <div className="space-y-3">
          <Field label="Animal">
            <Select value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
              <option value="">Selecciona un animal</option>
              {animales.map((a) => <option key={a.id} value={a.id}>{a.arete} {a.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="vacuna">Vacuna</option>
              <option value="tratamiento">Tratamiento</option>
            </Select>
          </Field>
          <Field label="Nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Fiebre aftosa" /></Field>
          <Field label="Fecha aplicada"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Próxima fecha (refuerzo)"><Input type="date" value={proximaFecha} onChange={(e) => setProximaFecha(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}

function Reproduccion({ reproduccion, animales, nombreAnimal, onCreated }: { reproduccion: Reproduccion[]; animales: Animal[]; nombreAnimal: (id: number) => string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [animalId, setAnimalId] = useState('');
  const [tipo, setTipo] = useState('monta');
  const [fecha, setFecha] = useState('');
  const [fechaProbableParto, setFechaProbableParto] = useState('');
  const [notas, setNotas] = useState('');

  const crear = async () => {
    if (!animalId || !fecha) return showToast('Selecciona el animal y la fecha del evento.');
    await apiPost('/ganaderia/reproduccion', { animal_id: Number(animalId), tipo, fecha, fecha_probable_parto: fechaProbableParto || null, notas });
    setFecha(''); setFechaProbableParto(''); setNotas(''); setOpen(false);
    onCreated();
  };

  return (
    <div>
      <PageHeader title="Reproducción" subtitle="Montas, inseminaciones y partos." action={<Button onClick={() => setOpen(true)}>+ Nuevo evento</Button>} />
      {reproduccion.length === 0 ? <EmptyState message="Aún no hay eventos reproductivos." actionLabel="+ Agregar el primero" onAction={() => setOpen(true)} /> : (
        <Table head={['Animal', 'Tipo', 'Fecha', 'Parto probable', 'Notas']}>
          {reproduccion.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5">{nombreAnimal(r.animal_id)}</td>
              <td className="px-4 py-2.5"><Badge>{r.tipo}</Badge></td>
              <td className="px-4 py-2.5">{formatDate(r.fecha)}</td>
              <td className="px-4 py-2.5">{formatDate(r.fecha_probable_parto)}</td>
              <td className="px-4 py-2.5 text-xs text-slate-400">{r.notas || '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo evento reproductivo">
        <div className="space-y-3">
          <Field label="Animal (hembra)">
            <Select value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
              <option value="">Selecciona un animal</option>
              {animales.filter((a) => a.sexo === 'hembra').map((a) => <option key={a.id} value={a.id}>{a.arete} {a.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="monta">Monta</option>
              <option value="inseminacion">Inseminación</option>
              <option value="parto">Parto</option>
            </Select>
          </Field>
          <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Fecha probable de parto"><Input type="date" value={fechaProbableParto} onChange={(e) => setFechaProbableParto(e.target.value)} /></Field>
          <Field label="Notas"><Input value={notas} onChange={(e) => setNotas(e.target.value)} /></Field>
          <Button className="w-full" onClick={crear}>Guardar</Button>
        </div>
      </Modal>
    </div>
  );
}
