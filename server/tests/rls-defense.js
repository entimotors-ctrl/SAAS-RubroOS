/**
 * Fase 3 (RLS): prueba ADVERSARIAL, no de funcionalidad normal — demuestra
 * que Postgres mismo bloquea el acceso entre tenants incluso cuando el SQL
 * de la consulta "olvida" el WHERE tenant_id = ?, simulando exactamente el
 * bug que esto existe para prevenir. No prueba la app tal cual se usa hoy
 * (eso ya lo cubren las otras 13 suites) — prueba que la base de datos no
 * confía ciegamente en que el código de arriba siempre filtre bien.
 *
 * Sin DATABASE_URL (SQLite) no hay RLS que probar — se reporta 0/0 y sale 0.
 * Uso: node tests/rls-defense.js
 */
const assert = require('node:assert/strict');
const db = require('../src/db');
const dbAccess = require('../src/security/dbAccess');

let pass = 0;
let fail = 0;
function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  OK   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('Sin DATABASE_URL (SQLite): RLS no aplica, nada que probar aquí.');
    console.log('0/0 checks OK');
    return;
  }

  const [tenantA, tenantB] = await dbAccess.asSystem(() => db.transaction(async () => {
    const a = (await db.prepare("INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES ('taller', 'QA RLS A', ?, 'pro', 'activo')").run(`qa-rls-a-${Date.now()}`)).lastInsertRowid;
    const b = (await db.prepare("INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES ('taller', 'QA RLS B', ?, 'pro', 'activo')").run(`qa-rls-b-${Date.now()}`)).lastInsertRowid;
    await db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(a, 'Cliente secreto de A');
    const clienteB = (await db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(b, 'Cliente secreto de B')).lastInsertRowid;
    return [{ id: a }, { id: b, clienteId: clienteB }];
  }).immediate());

  // 1) El propio rol de conexión no debe poder saltarse RLS (si esto falla,
  //    nada más abajo prueba nada real).
  const roleInfo = await dbAccess.asSystem(() => db.prepare(
    "SELECT rolsuper, rolbypassrls, (SELECT rolname FROM pg_roles WHERE oid = (SELECT relowner FROM pg_class WHERE relname = 'tenants')) AS table_owner, current_user AS me FROM pg_roles WHERE rolname = current_user"
  ).get());
  check(
    'El rol de conexión NO es superusuario, NI BYPASSRLS, NI dueño de las tablas (si no, esta prueba no demuestra nada)',
    !roleInfo.rolsuper && !roleInfo.rolbypassrls && roleInfo.table_owner !== roleInfo.me,
    JSON.stringify(roleInfo)
  );

  // 2) Consulta SIN WHERE tenant_id (el bug exacto que RLS debe cubrir):
  //    bajo el contexto de A, debe ver SOLO lo de A.
  const vistaDesdeA = await dbAccess.asTenant(tenantA.id, () => db.prepare('SELECT tenant_id, nombre FROM taller_clientes').all());
  check('Una consulta sin WHERE tenant_id, bajo el contexto de A, NO devuelve ninguna fila de B', vistaDesdeA.every((r) => r.tenant_id !== tenantB.id), JSON.stringify(vistaDesdeA));
  check('...y SÍ devuelve la propia de A', vistaDesdeA.some((r) => r.tenant_id === tenantA.id));

  // 3) UPDATE/DELETE sin WHERE tenant_id, apuntando por id a una fila de B,
  //    ejecutado bajo el contexto de A: debe afectar CERO filas (WITH CHECK).
  const resultadoUpdate = await dbAccess.asTenant(tenantA.id, () => db.prepare('UPDATE taller_clientes SET nombre = ? WHERE id = ?').run('Hackeado por A', tenantB.clienteId));
  check('UPDATE de A sobre una fila de B (por id, sin tenant_id) afecta 0 filas', resultadoUpdate.changes === 0, JSON.stringify(resultadoUpdate));
  const clienteBTrasIntento = await dbAccess.asSystem(() => db.prepare('SELECT nombre FROM taller_clientes WHERE id = ?').get(tenantB.clienteId));
  check('La fila de B sigue intacta', clienteBTrasIntento.nombre === 'Cliente secreto de B', clienteBTrasIntento.nombre);

  // 4) INSERT falsificando un tenant_id ajeno bajo el contexto de A: el
  //    WITH CHECK debe rechazarlo (no silenciosamente ignorar tenant_id).
  await assert.rejects(
    () => dbAccess.asTenant(tenantA.id, () => db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantB.id, 'Intento de A suplantando a B')),
    /row-level security|policy/i
  );
  check('INSERT de A con tenant_id de B es rechazado por la política (WITH CHECK)', true);

  // 5) El bypass (dueño del SaaS / sistema) sí ve a través de tenants.
  const vistaBypass = await dbAccess.asOwner(() => db.prepare('SELECT COUNT(*) AS n FROM taller_clientes WHERE tenant_id IN (?, ?)').get(tenantA.id, tenantB.id));
  check('Bajo bypass (owner/sistema) sí se ven ambos tenants', vistaBypass.n === 2, String(vistaBypass.n));

  // 6) Sin NINGÚN contexto establecido, la app debe rechazar antes de llegar
  //    siquiera a la base (fallar fuerte, no devolver vacío en silencio).
  await assert.rejects(() => db.prepare('SELECT 1').get(), /contexto de acceso/);
  check('Una consulta sin contexto de acceso establecido lanza un error claro (no un resultado vacío silencioso)', true);

  await dbAccess.asSystem(() => db.transaction(async () => {
    await db.prepare('DELETE FROM taller_clientes WHERE tenant_id IN (?, ?)').run(tenantA.id, tenantB.id);
    await db.prepare('DELETE FROM tenants WHERE id IN (?, ?)').run(tenantA.id, tenantB.id);
  }).immediate());

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Error ejecutando la prueba:', err);
  process.exit(1);
});
