/**
 * PROMPT 08 — pruebas de regresión para el hallazgo 2 (búsqueda de clientes
 * sensible a acentos) encontrado en la prueba real de WhatsApp de PROMPT 07.
 * No requiere el servidor HTTP corriendo: ejercita tallerService
 * directamente contra la base de datos real, mismo estilo que
 * tests/ai-core.js.
 *
 * Uso: node tests/taller-hardening.js
 */

const db = require('../src/db');
const tallerService = require('../src/services/tallerService');

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function crearTenantDePrueba(tag) {
  const slug = `qa-taller-hardening-${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const info = db
    .prepare(`INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES ('taller', ?, ?, 'pro', 'activo')`)
    .run(`QA Taller Hardening ${tag}`, slug);
  return info.lastInsertRowid;
}

function testAcentos(tenantId) {
  console.log('\n=== Hallazgo 2: búsqueda de clientes sin distinguir acentos ===');
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantId, 'Carlos Ramírez');
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantId, 'José Peña');
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantId, 'Ana Pena');

  const exact = tallerService.buscarCliente(tenantId, { nombre: 'Carlos Ramírez' });
  check('"Carlos Ramírez" encuentra "Carlos Ramírez" (coincidencia exacta)', exact.some((c) => c.nombre === 'Carlos Ramírez'));

  const sinTilde = tallerService.buscarCliente(tenantId, { nombre: 'Carlos Ramirez' });
  check('"Carlos Ramirez" (sin tilde) encuentra "Carlos Ramírez"', sinTilde.some((c) => c.nombre === 'Carlos Ramírez'));

  const mayus = tallerService.buscarCliente(tenantId, { nombre: 'RAMIREZ' });
  check('"RAMIREZ" (mayúsculas, sin tilde) encuentra "Ramírez"', mayus.some((c) => c.nombre === 'Carlos Ramírez'));

  const parcial = tallerService.buscarCliente(tenantId, { nombre: 'ramir' });
  check('búsqueda parcial sin tilde ("ramir") funciona', parcial.some((c) => c.nombre === 'Carlos Ramírez'));

  const conNhLiteral = tallerService.buscarCliente(tenantId, { nombre: 'Pena' });
  check(
    '"Pena" (con n) NO se confunde con "Peña" (con ñ)',
    !conNhLiteral.some((c) => c.nombre === 'José Peña') && conNhLiteral.some((c) => c.nombre === 'Ana Pena')
  );

  const conEnhe = tallerService.buscarCliente(tenantId, { nombre: 'Peña' });
  check('"Peña" (con ñ) SÍ encuentra a "José Peña"', conEnhe.some((c) => c.nombre === 'José Peña'));
}

function testAcentosAislamientoTenant(tenantA, tenantB) {
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantB, 'Carlos Ramírez');
  const resultado = tallerService.buscarCliente(tenantA, { nombre: 'Ramirez' });
  check(
    'Tenant A nunca encuentra un cliente de Tenant B, ni con la búsqueda normalizada',
    resultado.every((c) => c.tenant_id === tenantA)
  );
}

function limpiar(tenants) {
  console.log('\n=== Limpieza de datos de prueba ===');
  const run = db.transaction(() => {
    for (const tid of tenants) {
      db.prepare('DELETE FROM taller_venta_items WHERE venta_id IN (SELECT id FROM taller_ventas WHERE tenant_id = ?)').run(tid);
      db.prepare('DELETE FROM taller_ventas WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM taller_clientes WHERE tenant_id = ?').run(tid);
    }
    db.prepare(`DELETE FROM tenants WHERE id IN (${tenants.map(() => '?').join(',')})`).run(...tenants);
  });
  run();
  console.log('  listo');
}

function main() {
  const tenantA = crearTenantDePrueba('a');
  const tenantB = crearTenantDePrueba('b');
  try {
    testAcentos(tenantA);
    testAcentosAislamientoTenant(tenantA, tenantB);
  } finally {
    limpiar([tenantA, tenantB]);
  }

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

main();
