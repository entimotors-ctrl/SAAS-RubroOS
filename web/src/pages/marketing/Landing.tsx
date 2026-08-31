import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Check, MessageCircle, Sparkles } from 'lucide-react';
import { BUSINESS_TYPES } from '../../lib/business-types';
import { LogoBadge } from '../../components/Logo';
import { Reveal, RevealGroup, RevealItem } from '../../components/Reveal';
import { Counter } from '../../components/Counter';
import { ProductShowcase } from '../../components/ProductShowcase';
import choiceIllustration from '../../assets/illustrations/choice.svg';
import growthIllustration from '../../assets/illustrations/growth-analytics.svg';

const PLANES = [
  { nombre: 'Starter', precio: 590, desc: 'Para negocios que arrancan.', features: ['1 usuario', 'Módulos básicos', 'Soporte por WhatsApp'] },
  { nombre: 'Pro', precio: 990, desc: 'El más elegido por PYMES.', features: ['Hasta 5 usuarios', 'Todos los módulos', 'Reportes y alertas', 'Soporte prioritario'], destacado: true },
  { nombre: 'Business', precio: 1590, desc: 'Para operaciones con varias sedes.', features: ['Usuarios ilimitados', 'Múltiples sucursales', 'Exportación de datos', 'Soporte dedicado'] },
];

const PASOS = [
  { n: '1', titulo: 'Elige tu rubro', texto: 'Taller, barbería, agro, inversiones, ganadería o carwash — el sistema se adapta a tu negocio, no al revés.' },
  { n: '2', titulo: 'Crea tu cuenta', texto: 'Sin tarjeta, sin instalar nada. En menos de un minuto tienes tu propio dashboard.' },
  { n: '3', titulo: 'Empieza a vender', texto: 'Tu panel ya viene con datos de muestra para que veas el sistema funcionando desde el primer clic.' },
];

function BackgroundBlobs() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-emerald-500/20 blur-[110px]"
      />
      <motion.div
        animate={{ x: [0, -30, 20, 0], y: [0, 30, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -right-24 top-32 h-[380px] w-[380px] rounded-full bg-blue-500/15 blur-[110px]"
      />
    </div>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 mx-auto flex max-w-6xl items-center justify-between px-6 py-4 transition-all ${
        scrolled ? 'border-b border-white/10 bg-slate-950/80 backdrop-blur-lg' : 'border-b border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <LogoBadge size={32} />
        <span className="text-lg font-bold">RubroOS</span>
      </div>
      <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
        <a href="#rubros" className="hover:text-white">Rubros</a>
        <a href="#como-funciona" className="hover:text-white">Cómo funciona</a>
        <a href="#precios" className="hover:text-white">Precios</a>
        <Link to="/owner/login" className="hover:text-white">Owner</Link>
      </nav>
      <Link to="/elegir-sistema" className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
        Empezar gratis
      </Link>
    </header>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-slate-950 text-white">
      <Header />

      {/* ===== HERO ===== */}
      <section className="relative px-6 pb-16 pt-14 sm:pt-20">
        <BackgroundBlobs />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-medium text-emerald-400"
            >
              🇭🇳 Hecho para PYMES de Honduras y Centroamérica
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="text-4xl font-extrabold leading-[1.08] sm:text-5xl"
            >
              El sistema operativo <span className="text-emerald-400">para tu negocio.</span>
              <br />
              Elige tu rubro.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="mt-5 max-w-lg text-base text-slate-400"
            >
              Un mismo panel, seis negocios distintos. Talleres, barberías, agropecuarias, carwash, ganadería y catálogos de
              inversión — cada uno con las herramientas exactas que necesita, listas en minutos.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link to="/elegir-sistema" className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400">
                  Elegir mi rubro <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
              <motion.a
                href="#rubros"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5"
              >
                Ver los 6 sistemas
              </motion.a>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-4 text-xs text-slate-500"
            >
              14 días gratis · sin tarjeta · datos de muestra incluidos
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <ProductShowcase />
          </motion.div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <Reveal className="border-y border-white/10 bg-white/[0.02] px-6 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 text-center sm:grid-cols-4">
          {[
            { to: 6, suffix: '', label: 'Rubros disponibles' },
            { to: 30, suffix: '+', label: 'Módulos listos para usar' },
            { to: 14, suffix: '', label: 'Días de prueba gratis' },
            { to: 3, suffix: '', label: 'Pasos para empezar' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-white sm:text-4xl">
                <Counter to={s.to} suffix={s.suffix} />
              </p>
              <p className="mt-1 text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ===== RUBROS ===== */}
      <section id="rubros" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal className="text-center">
          <h2 className="mb-2 text-2xl font-bold sm:text-3xl">Un sistema hecho a la medida de tu rubro</h2>
          <p className="mb-10 text-sm text-slate-400">Cada negocio es distinto. Por eso cada rubro tiene su propio dashboard, no uno genérico forzado.</p>
        </Reveal>
        <RevealGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_TYPES.map((b) => (
            <RevealItem key={b.id}>
              <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.25 }} className="h-full">
                <Link
                  to={`/registro/${b.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition hover:border-white/20"
                >
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: -4 }}
                    className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${b.accent}22`, color: b.accent }}
                  >
                    <b.icon className="h-5 w-5" strokeWidth={2} />
                  </motion.div>
                  <h3 className="text-base font-bold text-white">{b.label}</h3>
                  <p className="mt-1.5 flex-1 text-sm text-slate-400">{b.tagline}</p>
                  <p className="mt-4 flex items-center gap-1 text-xs font-semibold" style={{ color: b.accent }}>
                    Crear cuenta
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                  </p>
                </Link>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* ===== CÓMO FUNCIONA ===== */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="rounded-3xl bg-slate-50 p-8">
              <img src={choiceIllustration} alt="Eligiendo el sistema correcto para tu negocio" className="mx-auto w-full max-w-sm" />
            </div>
          </Reveal>
          <div>
            <Reveal>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" /> Así de simple
              </p>
              <h2 className="mb-8 text-2xl font-bold sm:text-3xl">De la visita a tu primer cobro, en minutos</h2>
            </Reveal>
            <RevealGroup className="space-y-6">
              {PASOS.map((p) => (
                <RevealItem key={p.n} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-400">
                    {p.n}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{p.titulo}</h3>
                    <p className="mt-1 text-sm text-slate-400">{p.texto}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <RevealGroup className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            { titulo: 'Onboarding en 3 pasos', texto: 'Elige tu rubro, crea tu cuenta y tu dashboard ya tiene datos de ejemplo listos.' },
            { titulo: 'Pensado en Lempiras', texto: 'Precios, reportes y cotizadores calculados en L. desde el primer día.' },
            { titulo: 'Soporte por WhatsApp', texto: 'Igual que tu negocio, hablamos por WhatsApp — sin tickets ni esperas.' },
          ].map((f) => (
            <RevealItem key={f.titulo}>
              <div className="h-full rounded-2xl border border-white/10 bg-slate-900/40 p-6 transition hover:border-white/20">
                <h3 className="mb-2 text-sm font-bold text-white">{f.titulo}</h3>
                <p className="text-sm text-slate-400">{f.texto}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* ===== PRECIOS ===== */}
      <section id="precios" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal className="text-center">
          <h2 className="mb-10 text-2xl font-bold sm:text-3xl">Precios simples, sin sorpresas</h2>
        </Reveal>
        <RevealGroup className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PLANES.map((p) => (
            <RevealItem key={p.nombre}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ duration: 0.25 }}
                className={`relative h-full rounded-2xl border p-6 ${p.destacado ? 'border-emerald-400/60 bg-emerald-500/5' : 'border-white/10 bg-slate-900/40'}`}
              >
                {p.destacado && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-emerald-400/40"
                  />
                )}
                {p.destacado && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-400">Más popular</p>}
                <h3 className="text-lg font-bold text-white">{p.nombre}</h3>
                <p className="text-sm text-slate-400">{p.desc}</p>
                <p className="mt-4 text-3xl font-extrabold text-white">
                  L. {p.precio}
                  <span className="text-sm font-medium text-slate-400">/mes</span>
                </p>
                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/elegir-sistema"
                  className={`mt-6 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${
                    p.destacado ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border border-white/15 text-slate-200 hover:bg-white/5'
                  }`}
                >
                  Empezar prueba gratis
                </Link>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-slate-900 to-blue-500/10 p-8 sm:p-12">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-2xl font-bold sm:text-3xl">¿Listo para dejar el cuaderno y el Excel?</h2>
                <p className="mt-3 max-w-lg text-sm text-slate-400">
                  Crea tu cuenta gratis hoy y prueba RubroOS con datos reales de tu negocio. Sin compromiso, sin tarjeta.
                </p>
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="mt-6 inline-block">
                  <Link to="/elegir-sistema" className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400">
                    Elegir mi rubro <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </div>
              <img src={growthIllustration} alt="Negocio creciendo con RubroOS" className="mx-auto hidden w-56 rounded-2xl bg-slate-50 p-4 lg:block" />
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-xs text-slate-500">
        <p className="flex items-center justify-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" /> RubroOS — El sistema operativo para tu negocio.
        </p>
        <div className="mt-3">
          <Link to="/owner/login" className="text-slate-500 hover:text-slate-300">Acceso del equipo RubroOS</Link>
        </div>
      </footer>
    </div>
  );
}
