import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { Card, Field, Input, Select, Button, EmptyState } from '../../components/ui';
import { formatL } from '../../lib/currency';

interface TenantInfo { nombre_empresa: string; business_type: string }
interface Servicio { id: number; nombre: string; precio: number; duracion_min: number }
interface Barbero { id: number; nombre: string; especialidad: string | null }
interface CitaCreada { id: number; fecha: string; hora: string }

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AgendarCita() {
  const { slug = '' } = useParams();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [barberos, setBarberos] = useState<Barbero[]>([]);

  const [servicioId, setServicioId] = useState('');
  const [barberoId, setBarberoId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [hora, setHora] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creada, setCreada] = useState<CitaCreada | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<TenantInfo>(`/public/${slug}`)
      .then((t) => {
        if (!alive) return;
        setTenant(t);
      })
      .catch(() => {
        if (alive) setNotFound(true);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!tenant || tenant.business_type !== 'barberia') return;
    let alive = true;
    Promise.all([apiGet<Servicio[]>(`/public/${slug}/barberia/servicios`), apiGet<Barbero[]>(`/public/${slug}/barberia/barberos`)]).then(([s, b]) => {
      if (!alive) return;
      setServicios(s);
      setBarberos(b);
    });
    return () => {
      alive = false;
    };
  }, [tenant, slug]);

  useEffect(() => {
    setHora('');
    setSlots([]);
    if (!servicioId || !barberoId || !fecha) return;
    let alive = true;
    setLoadingSlots(true);
    apiGet<{ slots: string[] }>(`/public/${slug}/barberia/disponibilidad?barbero_id=${barberoId}&servicio_id=${servicioId}&fecha=${fecha}`)
      .then((r) => {
        if (alive) setSlots(r.slots);
      })
      .finally(() => {
        if (alive) setLoadingSlots(false);
      });
    return () => {
      alive = false;
    };
  }, [servicioId, barberoId, fecha, slug]);

  async function reservar() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const cita = await apiPost<CitaCreada>(`/public/${slug}/barberia/citas`, {
        nombre_cliente: nombre,
        telefono: telefono || undefined,
        barbero_id: Number(barberoId),
        servicio_id: Number(servicioId),
        fecha,
        hora,
      });
      setCreada(cita);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo agendar la cita');
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-5 text-white">
        <Card className="w-full max-w-md p-7">
          <EmptyState message="No encontramos este negocio. Revisa el enlace e inténtalo de nuevo." />
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-5 text-white">
        <p>Cargando…</p>
      </div>
    );
  }

  if (tenant.business_type !== 'barberia') {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-5 text-white">
        <Card className="w-full max-w-md p-7">
          <EmptyState message="Este negocio todavía no tiene agenda pública disponible." />
        </Card>
      </div>
    );
  }

  if (creada) {
    return (
      <div className="app-frame flex min-h-screen items-center justify-center p-5 text-white">
        <Card className="w-full max-w-md space-y-3 p-7 text-center">
          <p className="text-xs uppercase tracking-[.2em] text-emerald-300">{tenant.nombre_empresa}</p>
          <h1 className="text-2xl font-bold">¡Listo, {nombre.split(' ')[0]}!</h1>
          <p className="text-slate-300">
            Tu cita quedó agendada para el <strong>{creada.fecha}</strong> a las <strong>{creada.hora}</strong>. El negocio la confirmará pronto.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="app-frame flex min-h-screen items-center justify-center p-5 text-white">
      <Card className="w-full max-w-lg space-y-5 p-7">
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-emerald-300">Agendar una cita</p>
          <h1 className="text-3xl font-bold">{tenant.nombre_empresa}</h1>
        </div>

        <Field label="Servicio">
          <Select value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
            <option value="">Elige un servicio</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} — {formatL(s.precio)} ({s.duracion_min} min)
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Barbero">
          <Select value={barberoId} onChange={(e) => setBarberoId(e.target.value)}>
            <option value="">Elige un barbero</option>
            {barberos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
                {b.especialidad ? ` — ${b.especialidad}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha">
          <Input type="date" min={todayISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>

        {servicioId && barberoId && fecha && (
          <Field label="Hora disponible">
            {loadingSlots ? (
              <p className="text-sm text-slate-400">Buscando horarios…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-slate-400">No hay horarios libres ese día. Prueba otra fecha.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setHora(s)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${hora === s ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200' : 'border-white/15 text-slate-200 hover:bg-white/5'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}

        {hora && (
          <form
            className="space-y-4 border-t border-white/10 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void reservar();
            }}
          >
            <Field label="Tu nombre">
              <Input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
            <Field label="Tu teléfono (opcional)">
              <Input maxLength={30} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full py-3">
              {busy ? 'Agendando…' : `Confirmar cita — ${fecha} ${hora}`}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
