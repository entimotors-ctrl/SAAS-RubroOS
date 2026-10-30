/**
 * Agenda pública (clientes sin cuenta) para barbería — ver
 * server/src/routes/publicBooking.js. Prueba por HTTP real contra el
 * servidor, sin JWT (como lo haría un cliente de verdad desde el navegador).
 *
 * Uso: node tests/public-booking.js
 */
const assert = require('node:assert/strict');
const db = require('../src/db');
const dbAccess = require('../src/security/dbAccess');

const BASE = process.env.API_URL || 'http://localhost:4000/api';

let pass = 0;
let fail = 0;
function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log(`  OK   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

// Un miércoles, siempre al menos 3 días en el futuro: cae dentro del horario
// por defecto que el trigger barberia_barbero_horario_inicial crea solo al
// insertar un barbero (lunes a sábado 09:00-18:00, domingo inactivo) — ver
// server/src/db/migrations.js y supabase/migrations/20261027140002_barberia.sql.
// Así la prueba no depende de qué día de la semana es "hoy" al correrla.
function nextWednesday(minDaysAhead = 3) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + minDaysAhead);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const RUN = Date.now();
  const slug = `qa-public-booking-${RUN}`;
  const fecha = nextWednesday();

  const { tenantId, otherTenantId, barberoId, servicioId } = await dbAccess.asSystem(() => db.transaction(async () => {
    const tid = (await db.prepare("INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES ('barberia', 'QA Public Booking', ?, 'pro', 'activo')").run(slug)).lastInsertRowid;
    const otherTid = (await db.prepare(`INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES ('taller', 'QA Public Booking (otro rubro)', ?, 'pro', 'activo')`).run(`${slug}-taller`)).lastInsertRowid;
    // El horario lunes-sábado 09:00-18:00 lo crea solo el trigger
    // barberia_barbero_horario_inicial al insertar el barbero (ver arriba).
    const bid = (await db.prepare('INSERT INTO barberia_barberos (tenant_id, nombre, activo, comision_porcentaje) VALUES (?, ?, 1, 40)').run(tid, 'QA Barbero')).lastInsertRowid;
    const sid = (await db.prepare('INSERT INTO barberia_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?, ?, ?, ?)').run(tid, 'QA Corte', 100, 30)).lastInsertRowid;
    return { tenantId: tid, otherTenantId: otherTid, barberoId: bid, servicioId: sid };
  }).immediate());

  try {
    check('Slug inexistente -> 404', (await api('/public/no-existe-este-negocio-qa')).status === 404);

    const info = await api(`/public/${slug}`);
    check('GET /public/:slug responde con el negocio', info.status === 200 && info.body.business_type === 'barberia', JSON.stringify(info.body));

    const servicios = await api(`/public/${slug}/barberia/servicios`);
    check('Lista servicios públicos (sin auth)', servicios.body.some((s) => s.id === servicioId));

    const barberos = await api(`/public/${slug}/barberia/barberos`);
    check('Lista barberos públicos (sin auth)', barberos.body.some((b) => b.id === barberoId));

    const disp1 = await api(`/public/${slug}/barberia/disponibilidad?barbero_id=${barberoId}&servicio_id=${servicioId}&fecha=${fecha}`);
    check('Disponibilidad incluye 09:00 antes de reservar nada', disp1.body.slots.includes('09:00'), JSON.stringify(disp1.body));

    const otroRubro = await api(`/public/${slug}-taller/barberia/servicios`);
    check('Rubro distinto de barbería -> 404 en agenda pública', otroRubro.status === 404);

    const creada = await api(`/public/${slug}/barberia/citas`, {
      method: 'POST',
      body: { nombre_cliente: 'Cliente QA', telefono: '99990000', barbero_id: barberoId, servicio_id: servicioId, fecha, hora: '09:00' },
    });
    check('POST crea la cita (201, pendiente)', creada.status === 201 && creada.body.estado === 'pendiente', JSON.stringify(creada.body));

    const disp2 = await api(`/public/${slug}/barberia/disponibilidad?barbero_id=${barberoId}&servicio_id=${servicioId}&fecha=${fecha}`);
    check('09:00 ya no aparece disponible tras reservarlo', !disp2.body.slots.includes('09:00'), JSON.stringify(disp2.body));

    const repetida = await api(`/public/${slug}/barberia/citas`, {
      method: 'POST',
      body: { nombre_cliente: 'Otro Cliente QA', telefono: '99991111', barbero_id: barberoId, servicio_id: servicioId, fecha, hora: '09:00' },
    });
    check('No se puede reservar el mismo horario dos veces (409)', repetida.status === 409, JSON.stringify(repetida.body));

    const citaEnBD = await dbAccess.asTenant(tenantId, () => db.prepare('SELECT * FROM barberia_citas WHERE tenant_id = ?').all(tenantId));
    check('La cita quedó en el tenant correcto (visible para el panel real)', citaEnBD.length === 1 && citaEnBD[0].id === creada.body.id);

    const citasOtroTenant = await dbAccess.asTenant(otherTenantId, () => db.prepare('SELECT * FROM barberia_citas WHERE tenant_id = ?').all(otherTenantId));
    check('El otro tenant (taller) no tiene ninguna cita de barbería filtrada', citasOtroTenant.length === 0);

    console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    await dbAccess.asSystem(() => db.transaction(async () => {
      await db.prepare('DELETE FROM barberia_citas WHERE tenant_id = ?').run(tenantId);
      await db.prepare('DELETE FROM barberia_clientes WHERE tenant_id = ?').run(tenantId);
      await db.prepare('DELETE FROM barberia_horarios WHERE tenant_id = ?').run(tenantId);
      await db.prepare('DELETE FROM barberia_servicios WHERE tenant_id = ?').run(tenantId);
      await db.prepare('DELETE FROM barberia_barberos WHERE tenant_id = ?').run(tenantId);
      await db.prepare('DELETE FROM tenants WHERE id IN (?, ?)').run(tenantId, otherTenantId);
    }).immediate());
  }
}

main().catch((err) => {
  console.error('Error ejecutando la prueba:', err);
  process.exit(1);
});
