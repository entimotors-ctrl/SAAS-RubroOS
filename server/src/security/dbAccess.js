const { AsyncLocalStorage } = require('async_hooks');

// Contexto de acceso a datos (Fase 3, RLS en Postgres) — de qué tenant es la
// operación en curso, o si es el dueño del SaaS, o una operación de sistema
// que legítimamente necesita ver a través de tenants (login, registro,
// recuperación de contraseña, invitaciones de staff, identidad de WhatsApp:
// todo esto ocurre ANTES de saber a qué tenant pertenece la fila).
//
// server/src/db/postgres.js exige que exista un contexto antes de cualquier
// consulta (lanza si no lo hay) y lo traduce a session vars de Postgres
// (app.tenant_id / app.bypass_rls) que las políticas RLS de
// supabase/migrations/20261027140010_rls.sql verifican del lado del motor —
// así que un bug de la aplicación que olvide un WHERE tenant_id=? también
// queda bloqueado por la base, no solo por este chequeo.
//
// Bajo SQLite (sin DATABASE_URL) esto no tiene ningún efecto: server/src/db.js
// no lee este módulo en absoluto — existe únicamente para la rama Postgres.
const store = new AsyncLocalStorage();

function asTenant(tenantId, fn) {
  if (!Number.isInteger(tenantId)) throw new Error('asTenant requiere un tenantId entero');
  return store.run({ tenantId }, fn);
}

function asOwner(fn) {
  return store.run({ owner: true }, fn);
}

/** Para operaciones que, por diseño, resuelven A QUÉ tenant pertenece algo (login, registro, tokens de invitación/recuperación, identidad de WhatsApp) — nunca para lógica de negocio normal. */
function asSystem(fn) {
  return store.run({ system: true }, fn);
}

function current() {
  return store.getStore();
}

module.exports = { asTenant, asOwner, asSystem, current };
