import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { ApiError } from '../../lib/api';
import { Button, Card, Field, Input } from '../../components/ui';
import { LogoBadge } from '../../components/Logo';

export default function OwnerLogin() {
  const { ownerLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await ownerLogin(email, password);
      navigate('/owner');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <LogoBadge size={48} className="mx-auto mb-3" />
          <h1 className="text-xl font-bold">Panel del dueño de RubroOS</h1>
          <p className="mt-1 text-xs text-slate-500">Acceso exclusivo para administrar la plataforma.</p>
        </div>
        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Correo electrónico"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Contraseña"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</Button>
          </form>
        </Card>
        <p className="mt-5 text-center text-xs">
          <Link to="/" className="text-slate-500 hover:text-slate-300">← Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
