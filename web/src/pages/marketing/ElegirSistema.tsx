import { Link } from 'react-router-dom';
import { BUSINESS_TYPES } from '../../lib/business-types';

export default function ElegirSistema() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-14 text-white">
      <div className="mx-auto max-w-5xl text-center">
        <Link to="/" className="text-xs text-slate-500 hover:text-slate-300">← Volver al inicio</Link>
        <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">¿A qué se dedica tu negocio?</h1>
        <p className="mt-3 text-sm text-slate-400">Elige tu rubro para continuar. Cada uno tiene su propio sistema, listo para usar.</p>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BUSINESS_TYPES.map((b) => (
          <div key={b.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition hover:border-white/20">
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
    </div>
  );
}
