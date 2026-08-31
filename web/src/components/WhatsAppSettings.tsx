import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { Badge, Button, Field, Input, Modal } from './ui';
import { ApiError } from '../lib/api';
import { getWhatsAppStatus, linkWhatsApp, unlinkWhatsApp, verifyWhatsApp, type WhatsAppStatus } from '../lib/whatsapp-api';

/**
 * Configuración → Asistente IA → WhatsApp. Vinculación en dos pasos: se
 * manda un código de 6 dígitos por WhatsApp real al número que se quiere
 * vincular, y solo queda activo cuando ese código se ingresa de vuelta acá
 * — así se prueba que quien vincula de verdad puede recibir mensajes en ese
 * número, no solo que está autenticado en RubroOS.
 */
export function WhatsAppSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);

  const load = () => getWhatsAppStatus().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function handleLink() {
    setError('');
    setLoading(true);
    try {
      await linkWhatsApp(phone);
      setEditingPhone(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la vinculación.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError('');
    setLoading(true);
    try {
      await verifyWhatsApp(code);
      setCode('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo verificar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    setLoading(true);
    try {
      await unlinkWhatsApp();
      setPhone('');
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="WhatsApp">
      {!status ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : status.linked ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="success">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Conectado
            </Badge>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Número</p>
            <p className="mt-1 text-sm text-white">+{status.phoneNumber}</p>
          </div>
          {status.linkedUserName && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Vinculado por</p>
              <p className="mt-1 text-sm text-white">{status.linkedUserName}</p>
            </div>
          )}
          <Button variant="danger" onClick={handleUnlink} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Desvincular'}
          </Button>
        </div>
      ) : status.pending && !editingPhone ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            Te mandamos un código por WhatsApp a +{status.phoneNumber}. Ingrésalo aquí para activar el vínculo.
          </p>
          <Field label="Código de verificación">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} inputMode="numeric" />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleVerify} disabled={loading || !code.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPhone(status.phoneNumber || '');
                setEditingPhone(true);
              }}
              disabled={loading}
            >
              Cambiar número
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <MessageCircle className="h-4 w-4" /> No conectado
          </p>
          <Field label="Número de WhatsApp (con código de país)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+504 9999 0000" />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <Button onClick={handleLink} disabled={loading || !phone.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Configurar WhatsApp'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
