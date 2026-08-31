import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { onToast, type ToastMessage } from '../lib/toast';

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return onToast((toast) => {
      setToasts((list) => [...list, toast]);
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), 5000);
    });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border p-3.5 text-sm shadow-2xl backdrop-blur ${
              t.tone === 'error' ? 'border-red-500/30 bg-red-950/90 text-red-200' : 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
            }`}
          >
            {t.tone === 'error' ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <p className="flex-1">{t.text}</p>
            <button onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
