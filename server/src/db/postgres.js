const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');
const dbAccess = require('../security/dbAccess');

// `pg` devuelve BIGINT y NUMERIC como string por defecto (para no perder
// precisión en valores fuera de rango). better-sqlite3 siempre devolvía
// number. El código existente compara/opera esos valores como number
// (Number.isInteger, aritmética, igualdad estricta), así que se parsean aquí
// para igualar ese comportamiento. Los ids e importes de este negocio nunca
// se acercan a perder precisión como number de JS.
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

// `pg` por defecto parsea DATE/TIMESTAMP(TZ) a un objeto Date de JS.
// better-sqlite3 siempre devolvía TEXT plano ('YYYY-MM-DD' / 'YYYY-MM-DD
// HH:MM:SS'), y el código existente depende de eso: lo trata como string
// (p. ej. `action.created_at.replace(' ','T')+'Z'` en ai/core/orchestrator.js,
// o lo serializa tal cual en respuestas JSON). Se reproduce ese formato aquí
// en vez de dejar pasar un Date — con TimeZone=UTC fijado arriba en el Pool,
// el wire text de timestamptz ya viene en UTC, así que tomar los primeros 19
// caracteres ('YYYY-MM-DD HH:MM:SS', sin fracción de segundo ni offset) basta.
types.setTypeParser(1082, (v) => v); // date: ya viene como 'YYYY-MM-DD'
types.setTypeParser(1114, (v) => v.slice(0, 19)); // timestamp
types.setTypeParser(1184, (v) => v.slice(0, 19)); // timestamptz

/**
 * Adaptador PostgreSQL con la MISMA forma que usa hoy el server/src/db.js de
 * better-sqlite3 (`.prepare(sql).get/all/run(...)`, `db.transaction(fn).immediate()`,
 * `lastInsertRowid`, `changes`, `.close()`) para que los ~41 archivos que ya
 * llaman a ese API no necesiten un rediseño — solo volverse `async` y hacer
 * `await` en cada llamada. `await` sobre un valor no-promesa (la rama SQLite)
 * es un no-op, así que el mismo código sirve para ambos motores.
 *
 * Tablas sin columna `id` (clave compuesta o natural): no se les agrega
 * RETURNING id porque no existe esa columna. Lista derivada directamente de
 * supabase/migrations/ — si cambia el esquema, actualizar aquí también.
 */
const TABLES_WITHOUT_ID = new Set([
  'operation_requests',
  'tenant_settings',
  'whatsapp_inbound_events',
  'password_resets',
  'staff_invitations',
  'staff_profiles',
]);

// El pooler de Supabase (*.pooler.supabase.com) firma su certificado con su
// propia CA privada ("Supabase Root 2021 CA") — no una pública (DigiCert,
// Let's Encrypt, etc.), así que Node no la reconoce por defecto y rechaza la
// conexión ("self-signed certificate in certificate chain") a menos que se
// le indique explícitamente que confíe en ESA CA puntual — nunca se
// deshabilita rejectUnauthorized/BYPASS como atajo. El certificado en sí
// (server/certs/supabase-ca.crt) no es un secreto: es la CA pública de
// Supabase para su pooler, igual para cualquier proyecto.
// Otros hosts (un Postgres directo con sslmode=require, sin CA privada)
// siguen verificando contra el set de CAs públicas de confianza de Node.
const SUPABASE_CA_PATH = path.join(__dirname, '..', '..', 'certs', 'supabase-ca.crt');
function sslOptionFor(connectionString) {
  if (!connectionString) return undefined;
  let hostname;
  try { hostname = new URL(connectionString).hostname; } catch { return undefined; }
  if (/\.supabase\.com$/.test(hostname)) return { ca: fs.readFileSync(SUPABASE_CA_PATH, 'utf8') };
  return /sslmode=require/.test(connectionString) ? true : undefined;
}

// options: '-c TimeZone=UTC' fija la sesión de Postgres en UTC sin importar
// la configuración del servidor: el código de la app (igual que el lado
// JS — ver businessClock.js) siempre trata un timestamp sin zona como UTC: al
// insertar `datetime('now')`/`now()`, y al comparar/castear un string de
// fecha-hora "naive" (sin offset) a timestamptz. Si la sesión usara otro
// TimeZone, Postgres interpretaría esos strings naive con esa zona en vez de
// UTC y el resultado no coincidiría con el lado SQLite/JS.
function poolFor(connectionString) {
  return new Pool({ connectionString, ssl: sslOptionFor(connectionString), options: '-c TimeZone=UTC' });
}
const pool = poolFor(process.env.DATABASE_URL);
// DATABASE_ADMIN_URL (opcional): conexión con privilegios para el bootstrap
// (crear/alterar el rol de la app, aplicar supabase/migrations/). Sin ella,
// el bootstrap reutiliza el mismo `pool` — conveniente para desarrollo local,
// pero entonces `DATABASE_URL` debe ser ya un rol con permisos de owner/DDL.
// En producción, `DATABASE_URL` debe ser el rol restringido de la Fase 3
// (ver ensureAppRole) y `DATABASE_ADMIN_URL` el rol administrador real.
const adminPool = process.env.DATABASE_ADMIN_URL ? poolFor(process.env.DATABASE_ADMIN_URL) : pool;
const txContext = new AsyncLocalStorage();

const ROLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Fase 3 (RLS): crea o sincroniza (idempotente) el rol de Postgres que usa
 * `DATABASE_URL` — sin privilegios de superusuario/owner/BYPASSRLS, para que
 * las políticas RLS de 20261027140010_rls.sql realmente apliquen — y le
 * otorga el mínimo necesario (USAGE del esquema + CRUD en cada tabla; nunca
 * DDL). El nombre de rol y la contraseña salen de `DATABASE_URL` mismo: no
 * hay credenciales nuevas que inventar ni guardar en ningún archivo.
 */
async function ensureAppRole(adminConn, databaseUrl) {
  const url = new URL(databaseUrl);
  // El pooler de Supabase (Supavisor) exige que el usuario de conexión sea
  // "rol.referencia-de-proyecto" para enrutar a la base correcta — pero el
  // ROL de Postgres en sí (el que hay que crear y otorgarle permisos) es
  // solo la parte antes del primer punto; Supavisor quita ese sufijo antes
  // de autenticar contra Postgres. Fuera de Supabase no hay sufijo que quitar.
  const appUser = decodeURIComponent(url.username || '').split('.')[0];
  const appPassword = decodeURIComponent(url.password || '');
  if (!ROLE_NAME_PATTERN.test(appUser)) throw new Error(`DATABASE_URL tiene un nombre de usuario/rol inválido: "${appUser}"`);
  // CREATE ROLE/ALTER ROLE no aceptan parámetros ($1) en la cláusula PASSWORD
  // (son sentencias de utilidad, no DML) — se escapa a mano como literal SQL.
  // appUser/appPassword salen de DATABASE_URL (un secreto de despliegue, no
  // entrada de un usuario final), y appUser ya se validó contra ROLE_NAME_PATTERN.
  const passwordLiteral = `'${appPassword.replace(/'/g, "''")}'`;
  const { rows } = await adminConn.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
  if (!rows.length) {
    await adminConn.query(`CREATE ROLE "${appUser}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${passwordLiteral}`);
  } else {
    // Solo la contraseña: re-afirmar NOSUPERUSER/etc. en un rol que ya los
    // tiene no debería hacer falta, y algunos Postgres gestionados (p. ej. el
    // propio de Supabase, vía su extensión supautils) bloquean un ALTER ROLE
    // que toque esas banderas salvo que la conexión sea el superusuario real
    // del clúster (que ni siquiera en Supabase lo es "postgres").
    await adminConn.query(`ALTER ROLE "${appUser}" WITH LOGIN PASSWORD ${passwordLiteral}`);
  }
  await adminConn.query(`GRANT USAGE ON SCHEMA public TO "${appUser}"`);
  const { rows: tables } = await adminConn.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  for (const { tablename } of tables) {
    await adminConn.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "${tablename}" TO "${appUser}"`);
  }
}

/** Si el rol que usa `pool` puede saltarse RLS (superusuario, BYPASSRLS, o dueño de las tablas), las políticas de 20261027140010_rls.sql no protegen nada de verdad — avisa fuerte en el log en vez de fallar en silencio. */
async function warnIfRlsBypassed() {
  try {
    const { rows } = await pool.query(
      "SELECT rolsuper, rolbypassrls, (SELECT rolname FROM pg_roles WHERE oid = (SELECT relowner FROM pg_class WHERE relname = 'tenants')) AS table_owner, current_user AS me FROM pg_roles WHERE rolname = current_user"
    );
    const info = rows[0];
    if (info && (info.rolsuper || info.rolbypassrls || info.table_owner === info.me)) {
      console.warn(
        `[rls] ADVERTENCIA: el rol de conexión de la app ("${info.me}") puede saltarse RLS ` +
          `(superusuario, BYPASSRLS, o dueño de las tablas) — las políticas de aislamiento por ` +
          `tenant de supabase/migrations/20261027140010_rls.sql NO se están aplicando de verdad. ` +
          'Usa un rol de aplicación restringido en cualquier entorno real (ver docs/MIGRACION-SUPABASE-POSTGRES.md).'
      );
    }
  } catch {
    // No bloquea el arranque por esto — es un diagnóstico, no una verificación de seguridad en sí.
  }
}

/**
 * Traduce el contexto de acceso (server/src/security/dbAccess.js) a session
 * vars de Postgres que las políticas RLS verifican. Exige que exista un
 * contexto — sin esto, un bug que olvide requireAuth/requireTenant, o un
 * script nuevo que no se haya adaptado, fallaría agregando IMPORTANTE: con
 * un error claro en el log, no con un resultado vacío silencioso.
 */
async function applyAccessContext(conn) {
  const ctx = dbAccess.current();
  if (!ctx) {
    throw new Error(
      'Consulta a la base sin contexto de acceso (tenant/owner/sistema) establecido — ' +
        'ver server/src/security/dbAccess.js. Esto es a propósito: Postgres con RLS deniega ' +
        'todo por defecto si no sabe de qué tenant es la operación.'
    );
  }
  if (ctx.owner || ctx.system) {
    await conn.query("SELECT set_config('app.bypass_rls', 'true', true)");
  } else {
    await conn.query("SELECT set_config('app.tenant_id', $1, true)", [String(ctx.tenantId)]);
  }
}

function translateSql(sql) {
  // datetime('now') (SQLite) -> now() (Postgres). Único reemplazo de función
  // de fecha necesario a nivel de app: ver docs/MIGRACION-SUPABASE-POSTGRES.md.
  let translated = sql.replace(/datetime\(\s*'now'\s*\)/gi, 'now()');
  // Posicionales `?` (SQLite) -> `$1, $2, ...` (Postgres). Ninguna consulta de
  // la app usa un '?' literal dentro de un string SQL, así que un reemplazo
  // secuencial simple es seguro.
  let n = 0;
  translated = translated.replace(/\?/g, () => '$' + (++n));
  return translated;
}

function injectReturningId(sql) {
  if (/^\s*insert\b/i.test(sql) && !/returning/i.test(sql)) {
    const match = sql.match(/^\s*insert\s+into\s+["']?(\w+)["']?/i);
    const table = match && match[1];
    if (table && !TABLES_WITHOUT_ID.has(table)) return sql + ' RETURNING id';
  }
  return sql;
}

function prepare(rawSql) {
  const translated = injectReturningId(translateSql(rawSql));
  const isInsertWithId = / RETURNING id$/.test(translated);
  async function exec(params) {
    await ready; // el bootstrap de esquema (ensureSchema) debe terminar antes de la primera consulta real.
    const outer = txContext.getStore();
    if (outer) {
      // Ya estamos dentro de una transacción explícita (db.transaction(fn)):
      // el contexto de acceso para RLS ya se aplicó una sola vez al abrir esa
      // transacción (ver runTransaction) — reutilizar la misma conexión.
      return outer.query(translated, params);
    }
    // Llamada suelta (sin transacción explícita de la app): cada una abre su
    // propia mini-transacción SOLO para que `SET LOCAL` (el contexto de
    // acceso que las políticas RLS verifican) aplique de forma segura sin
    // importar qué conexión del pool le toque — ver applyAccessContext.
    const conn = await pool.connect();
    try {
      await conn.query('BEGIN');
      await applyAccessContext(conn);
      const res = await conn.query(translated, params);
      await conn.query('COMMIT');
      return res;
    } catch (e) {
      await conn.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }
  return {
    async get(...params) {
      const res = await exec(params);
      return res.rows[0];
    },
    async all(...params) {
      const res = await exec(params);
      return res.rows;
    },
    async run(...params) {
      const res = await exec(params);
      return {
        changes: res.rowCount,
        lastInsertRowid: isInsertWithId ? (res.rows[0] ? res.rows[0].id : null) : null,
      };
    },
  };
}

async function runTransaction(fn) {
  if (txContext.getStore()) return fn(); // ya hay una transacción ambiente: no abrir una anidada (ver comentario de diseño en docs).
  await ready;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await applyAccessContext(conn); // una sola vez: las llamadas anidadas reutilizan esta misma conexión/transacción.
    const result = await txContext.run(conn, fn);
    await conn.query('COMMIT');
    return result;
  } catch (e) {
    await conn.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

function transaction(fn) {
  // better-sqlite3 permite tanto `db.transaction(fn)()` (modo diferido por
  // defecto) como `db.transaction(fn).immediate()` — el código de la app usa
  // ambas formas, así que `run` debe ser invocable Y tener esos métodos.
  const run = () => runTransaction(fn);
  run.immediate = run;
  run.deferred = run;
  run.exclusive = run;
  return run;
}

async function ensureSchema() {
  const { rows } = await adminPool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants'");
  if (!rows.length) {
    const dir = process.env.MIGRATIONS_DIR || path.join(__dirname, '..', '..', '..', 'supabase', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const conn = await adminPool.connect();
    try {
      for (const file of files) {
        await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      }
      await ensureAppRole(conn, process.env.DATABASE_URL);
    } finally {
      conn.release();
    }
  }
  await warnIfRlsBypassed();
}

const ready = ensureSchema();

module.exports = {
  prepare,
  transaction,
  ready,
  close() {
    return Promise.all([pool.end(), ...(adminPool !== pool ? [adminPool.end()] : [])]);
  },
};
