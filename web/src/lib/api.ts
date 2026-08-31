import { showToast } from './toast';

const TOKEN_KEY = 'rubroos_token';
// Estas rutas ya muestran su propio error en pantalla (formulario de login/registro), así que no duplicamos con un toast.
const SILENT_PATHS = ['/auth/login', '/auth/registro', '/auth/owner-login', '/auth/me'];

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message = (body as { error?: string })?.error || `Error ${res.status}`;
    if (!SILENT_PATHS.includes(path)) showToast(message, 'error');
    throw new ApiError(message, res.status);
  }

  return body as T;
}

export const apiGet = <T = unknown>(path: string) => api<T>(path);
export const apiPost = <T = unknown>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined });
export const apiPut = <T = unknown>(path: string, data?: unknown) =>
  api<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined });
export const apiDelete = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });
