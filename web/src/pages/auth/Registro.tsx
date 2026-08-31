import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { getBusinessType, type BusinessTypeId } from '../../lib/business-types';
import { useAuth } from '../../lib/auth-context';
import { ApiError } from '../../lib/api';
import { Button, Card, Field, Input } from '../../components/ui';

export default function Registro() {
  const { businessType } = useParams<{ businessType: string }>();
  const business = getBusinessType(businessType);
  const { registro } = useAuth();
  const navigate = useNavigate();

  const [empresaNombre, setEmpresaNombre] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!business) return <Navigate to="/elegir-sistema" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registro({ business_type: business.id as BusinessTypeId, empresa_nombre: empresaNombre, nombre, email, password });
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${business.accent}22`, color: business.accent }}>
            <business.icon className="h-6 w-6" strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold">Crea tu cuenta</h1>
          <p className="mt-1 text-xs text-slate-500">{business.label} · 14 días gratis</p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Nombre de tu negocio">
              <Input required value={empresaNombre} onChange={(e) => setEmpresaNombre(e.target.value)} placeholder="Ej. Taller Don Beto" />
            </Field>
            <Field label="Tu nombre">
              <Input required value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Field>
            <Field label="Correo electrónico">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña">
              <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </Field>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creando cuenta…' : 'Crear cuenta gratis'}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link to={`/login/${business.id}`} className="font-semibold text-slate-300 hover:text-white">
            Iniciar sesión
          </Link>
        </p>
        <p className="mt-2 text-center text-xs">
          <Link to="/elegir-sistema" className="text-slate-500 hover:text-slate-300">← Elegir otro rubro</Link>
        </p>
      </div>
    </div>
  );
}
