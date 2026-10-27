import { Link } from 'react-router-dom';
import { BUSINESS_TYPES } from '../../lib/business-types';

export default function ElegirSistema() {
  return (
    <div className="app-frame min-h-screen px-6 py-14 text-white">
      <div className="mx-auto max-w-5xl text-center">
        <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">← Volver al inicio</Link>
        <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">Un espacio para cada negocio</h1>
        <p className="mt-3 text-sm text-slate-400">Elige un rubro y organiza tu operación, tus clientes y tu equipo.</p>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BUSINESS_TYPES.map((b) => (
          <div key={b.id} className="surface-card rounded-2xl border border-white/10 p-7 transition hover:-translate-y-1 hover:border-white/30">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${b.accent}22`, color: b.accent }}>
              <b.icon className="h-5 w-5" strokeWidth={2} />
            </div>
            <h3 className="text-base font-bold text-white">{b.label}</h3>
            <p className="mt-1.5 text-sm text-slate-400">{b.tagline}</p>
            <div className="mt-5 flex gap-2">
              <Link
                to={`/login/${b.id}`}
                className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-semibold text-slate-200 hover:bg-white/5"
              >
                Iniciar sesión
              </Link>
              <Link
                to={`/registro/${b.id}`}
                className="flex-1 rounded-lg px-3 py-2 text-center text-xs font-bold text-slate-950"
                style={{ backgroundColor: b.accent }}
              >
                Crear cuenta
              </Link>
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-white/10 p-6 text-center">
        {import.meta.env.VITE_LOCAL_DEMO==='1'&&<p className="mb-3 text-sm text-slate-300">Acceso de pruebas en los cinco rubros: <strong>maestro@rubroos.test</strong> · Contraseña: <strong>Maestro2026!</strong></p>}
        <Link to="/owner/login" className="text-sm font-semibold text-emerald-300">Abrir administración central →</Link>
      </div>
    </div>
  );
}
