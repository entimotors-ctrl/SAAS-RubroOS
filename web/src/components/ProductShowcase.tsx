import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Milk } from 'lucide-react';
import { useEffect, useState } from 'react';
import tallerShot from '../assets/screenshots/taller-resumen.png';
import ganaderiaShot from '../assets/screenshots/ganaderia-resumen.png';
import carwashShot from '../assets/screenshots/carwash-turnos.png';

const SLIDES = [
  { src: tallerShot, label: 'Taller', url: 'app.rubroos.com/taller', accent: '#f97316' },
  { src: ganaderiaShot, label: 'Ganadería y Lechería', url: 'app.rubroos.com/ganaderia', accent: '#059669' },
  { src: carwashShot, label: 'Carwash', url: 'app.rubroos.com/carwash', accent: '#06b6d4' },
];

export function ProductShowcase() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 4200);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[index];

  return (
    <div className="relative">
      {/* browser chrome mockup */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-center text-[11px] text-slate-500">
            {slide.url}
          </span>
        </div>
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
          <AnimatePresence>
            <motion.img
              key={slide.src}
              src={slide.src}
              alt={`Panel de ${slide.label} en RubroOS`}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute inset-0 h-full w-full object-cover object-left-top"
            />
          </AnimatePresence>
        </div>
      </div>

      {/* dot navigation */}
      <div className="mt-4 flex justify-center gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setIndex(i)}
            aria-label={`Ver ${s.label}`}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === index ? 22 : 8, backgroundColor: i === index ? s.accent : 'rgba(255,255,255,0.15)' }}
          />
        ))}
      </div>

      {/* floating notification chips */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: [0, -8, 0] }}
        transition={{ opacity: { delay: 0.6, duration: 0.5 }, y: { delay: 1, duration: 3.5, repeat: Infinity, ease: 'easeInOut' } }}
        className="absolute -left-6 -top-6 hidden rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur sm:block"
      >
        <p className="flex items-center gap-1.5 font-semibold text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Venta cobrada
        </p>
        <p className="text-slate-400">L. 1,475.00 · Taller</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: [0, 8, 0] }}
        transition={{ opacity: { delay: 0.9, duration: 0.5 }, y: { delay: 1.3, duration: 4, repeat: Infinity, ease: 'easeInOut' } }}
        className="absolute -bottom-6 -right-4 hidden rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur sm:block"
      >
        <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
          <Milk className="h-3.5 w-3.5" /> 22 litros ordeñados hoy
        </p>
        <p className="text-slate-400">Hacienda La Esperanza</p>
      </motion.div>
    </div>
  );
}
