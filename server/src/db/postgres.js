const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');

// `pg` devuelve BIGINT y NUMERIC como string por defecto (para no perder
// precisión en valores fuera de rango). better-sqlite3 siempre devolvía
// number. El código existente compara/opera esos valores como number
// (Number.isInteger, aritmética, igualdad estricta), así que se parsean aquí
// para igualar ese comportamiento. Los ids e importes de este negocio nunca
// se acercan a perder precisión como number de JS.
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 / bigint
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric

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

// sslmode=require en la cadena de conexión activa TLS con verificación normal
// del certificado (Supabase usa una CA pública válida) — nunca se deshabilita
// rejectUnauthorized aquí.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /sslmode=require/.test(process.env.DATABASE_URL || '') ? true : undefined });
const txContext = new AsyncLocalStorage();
function client() { return txContext.getStore() || pool; }

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
    const res = await client().query(translated, params);
    return res;
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
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
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
  const { rows } = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants'");
  if (rows.length) return;
  const dir = path.join(__dirname, '..', '..', '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const conn = await pool.connect();
  try {
    for (const file of files) {
      await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  } finally {
    conn.release();
  }
}

const ready = ensureSchema();

module.exports = {
  prepare,
  transaction,
  ready,
  close() {
    return pool.end();
  },
};
