/**
 * PROMPT 08 — pruebas de regresión para los hallazgos 2 (búsqueda sensible a
 * acentos) y 4 (registrarVenta sin transacción) encontrados en la prueba
 * real de WhatsApp de PROMPT 07. No requieren el servidor HTTP corriendo:
 * ejercitan tallerService directamente contra la base de datos real, mismo
 * estilo que tests/ai-core.js.
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

async function testAcentos(tenantId) {
  console.log('\n=== Hallazgo 2: búsqueda de clientes sin distinguir acentos ===');
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantId, 'Carlos Ramírez');
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantId, 'José Peña');
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantId, 'Ana Pena');

  const exact = await tallerService.buscarCliente(tenantId, { nombre: 'Carlos Ramírez' });
  check('"Carlos Ramírez" encuentra "Carlos Ramírez" (coincidencia exacta)', exact.some((c) => c.nombre === 'Carlos Ramírez'));

  const sinTilde = await tallerService.buscarCliente(tenantId, { nombre: 'Carlos Ramirez' });
  check('"Carlos Ramirez" (sin tilde) encuentra "Carlos Ramírez"', sinTilde.some((c) => c.nombre === 'Carlos Ramírez'));

  const mayus = await tallerService.buscarCliente(tenantId, { nombre: 'RAMIREZ' });
  check('"RAMIREZ" (mayúsculas, sin tilde) encuentra "Ramírez"', mayus.some((c) => c.nombre === 'Carlos Ramírez'));

  const parcial = await tallerService.buscarCliente(tenantId, { nombre: 'ramir' });
  check('búsqueda parcial sin tilde ("ramir") funciona', parcial.some((c) => c.nombre === 'Carlos Ramírez'));

  const conNhLiteral = await tallerService.buscarCliente(tenantId, { nombre: 'Pena' });
  check(
    '"Pena" (con n) NO se confunde con "Peña" (con ñ)',
    !conNhLiteral.some((c) => c.nombre === 'José Peña') && conNhLiteral.some((c) => c.nombre === 'Ana Pena')
  );

  const conEnhe = await tallerService.buscarCliente(tenantId, { nombre: 'Peña' });
  check('"Peña" (con ñ) SÍ encuentra a "José Peña"', conEnhe.some((c) => c.nombre === 'José Peña'));
}

async function testAcentosAislamientoTenant(tenantA, tenantB) {
  db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tenantB, 'Carlos Ramírez');
  const resultado = await tallerService.buscarCliente(tenantA, { nombre: 'Ramirez' });
  check(
    'Tenant A nunca encuentra un cliente de Tenant B, ni con la búsqueda normalizada',
    resultado.every((c) => c.tenant_id === tenantA)
  );
}

/** Fuerza que la SIGUIENTE llamada .run() de un statement que matchea `sqlSubstring` lance un error, para probar atomicidad sin dañar datos reales. Restaura db.prepare siempre. */
function withForcedFailure(sqlSubstring, fn) {
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = originalPrepare(sql);
    if (sql.includes(sqlSubstring)) {
      stmt.run = () => {
        throw new Error('Fallo forzado de prueba (QA transacción PROMPT 08)');
      };
    }
    return stmt;
  };
  try {
    return fn();
  } finally {
    db.prepare = originalPrepare;
  }
}

function testTransaccion(tenantId) {
  console.log('\n=== Hallazgo 4: registrarVenta debe ser atómico ===');
  const ventasAntes = db.prepare('SELECT COUNT(*) as n FROM taller_ventas WHERE tenant_id = ?').get(tenantId).n;
  const itemsAntes = db
    .prepare('SELECT COUNT(*) as n FROM taller_venta_items vi JOIN taller_ventas v ON v.id = vi.venta_id WHERE v.tenant_id = ?')
    .get(tenantId).n;

  let threw = false;
  try {
    withForcedFailure('INSERT INTO taller_venta_items', () => {
      tallerService.registrarVenta(tenantId, {
        tipo: 'contado',
        items: [{ descripcion: 'Repuesto de prueba QA', cantidad: 1, precio_unitario: 100 }],
      });
    });
  } catch {
    threw = true;
  }
  check('registrarVenta lanza cuando el INSERT de ítems falla a mitad de camino', threw);

  const ventasDespues = db.prepare('SELECT COUNT(*) as n FROM taller_ventas WHERE tenant_id = ?').get(tenantId).n;
  const itemsDespues = db
    .prepare('SELECT COUNT(*) as n FROM taller_venta_items vi JOIN taller_ventas v ON v.id = vi.venta_id WHERE v.tenant_id = ?')
    .get(tenantId).n;

  check('No quedó ninguna venta huérfana (el conteo de ventas no cambió)', ventasDespues === ventasAntes, `antes=${ventasAntes} después=${ventasDespues}`);
  check('No quedó ningún ítem huérfano (el conteo de ítems no cambió)', itemsDespues === itemsAntes, `antes=${itemsAntes} después=${itemsDespues}`);

  // Control positivo: sin fallo forzado, la venta sí se crea completa.
  const venta = tallerService.registrarVenta(tenantId, {
    tipo: 'contado',
    items: [{ descripcion: 'Repuesto de control', cantidad: 2, precio_unitario: 50 }],
  });
  check('Control positivo: sin fallo forzado, la venta se crea con su ítem', venta.id && venta.items.length === 1 && venta.items[0].subtotal === 100);
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

async function main() {
  const tenantA = crearTenantDePrueba('a');
  const tenantB = crearTenantDePrueba('b');
  try {
    await testAcentos(tenantA);
    await testAcentosAislamientoTenant(tenantA, tenantB);
    testTransaccion(tenantA);
  } finally {
    limpiar([tenantA, tenantB]);
  }

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e=>{console.error(e);process.exitCode=1;});
