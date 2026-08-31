/**
 * Prueba de seguridad multi-tenant (adversarial).
 *
 * No prueba que el CRUD funcione — prueba que un tenant NUNCA pueda leer,
 * modificar, eliminar o enlazar (vía foreign key) datos de otro tenant,
 * incluso manipulando directamente la petición HTTP.
 *
 * Requiere el servidor corriendo en http://localhost:4000 (o API_URL).
 * Uso:  node tests/security-multitenant.js
 */

const BASE = process.env.API_URL || 'http://localhost:4000/api';

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

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function registro(business_type, tag) {
  const email = `sec-${tag}-${Date.now()}@qa-security.test`;
  const r = await api('/auth/registro', {
    method: 'POST',
    body: {
      business_type,
      empresa_nombre: `QA Security ${tag} ${Date.now()}`,
      nombre: `QA ${tag}`,
      email,
      password: 'QaSecurity2026!',
    },
  });
  if (r.status !== 201) throw new Error(`No se pudo registrar tenant de prueba (${tag}): ${JSON.stringify(r.body)}`);
  return { token: r.body.token, tenantId: r.body.tenant.id, email };
}

async function main() {
  console.log('=== Preparando tenants de prueba (Tenant A y Tenant B) ===');
  const tallerA = await registro('taller', 'taller-a');
  const tallerB = await registro('taller', 'taller-b');
  const ganaderiaA = await registro('ganaderia', 'gan-a');
  const ganaderiaB = await registro('ganaderia', 'gan-b');
  const carwashA = await registro('carwash', 'car-a');
  const carwashB = await registro('carwash', 'car-b');

  // ---- Datos base en Tenant B (taller) ----
  const clienteB = await api('/taller/clientes', { method: 'POST', token: tallerB.token, body: { nombre: 'Cliente de Tenant B' } });
  const clienteBId = clienteB.body.id;
  const ventaB = await api('/taller/ventas', {
    method: 'POST',
    token: tallerB.token,
    body: { cliente_id: clienteBId, tipo: 'contado', items: [{ descripcion: 'Servicio B', cantidad: 1, precio_unitario: 100 }] },
  });

  console.log('\n=== Taller: IDOR — Tenant A contra registros de Tenant B ===');

  // 1) Consultar: la lista de A nunca debe incluir el cliente de B
  const listaClientesA = await api('/taller/clientes', { token: tallerA.token });
  check(
    'GET /taller/clientes de A no incluye cliente de B',
    Array.isArray(listaClientesA.body) && !listaClientesA.body.some((c) => c.id === clienteBId)
  );

  // 2) Modificar: PUT de A sobre el id de B debe fallar (404), y el dato de B no debe cambiar
  const putAjeno = await api(`/taller/clientes/${clienteBId}`, { method: 'PUT', token: tallerA.token, body: { nombre: 'HACKEADO' } });
  check('PUT de A sobre cliente de B → 404 (no 200)', putAjeno.status === 404, `status=${putAjeno.status}`);
  const clienteBTrasIntento = await api('/taller/clientes', { token: tallerB.token });
  const siguSiendoIntacto = clienteBTrasIntento.body.find((c) => c.id === clienteBId)?.nombre === 'Cliente de Tenant B';
  check('El cliente de B no fue modificado por A', siguSiendoIntacto);

  // 3) Eliminar: DELETE de A sobre el id de B debe fallar (404), y el dato de B debe seguir existiendo
  const delAjeno = await api(`/taller/clientes/${clienteBId}`, { method: 'DELETE', token: tallerA.token });
  check('DELETE de A sobre cliente de B → 404 (no 204)', delAjeno.status === 404, `status=${delAjeno.status}`);
  const clienteBTrasDelete = await api('/taller/clientes', { token: tallerB.token });
  check('El cliente de B sigue existiendo tras el intento de borrado de A', clienteBTrasDelete.body.some((c) => c.id === clienteBId));

  // 4) Foreign key ajena: A intenta crear un vehículo enlazado al cliente de B
  const vehiculoConFKAjena = await api('/taller/vehiculos', {
    method: 'POST',
    token: tallerA.token,
    body: { cliente_id: clienteBId, placa: 'HACK-001' },
  });
  check(
    'POST /taller/vehiculos de A con cliente_id de B → 400 (rechazado)',
    vehiculoConFKAjena.status === 400,
    `status=${vehiculoConFKAjena.status} body=${JSON.stringify(vehiculoConFKAjena.body)}`
  );

  // 5) Foreign key ajena: A intenta crear una venta enlazada al cliente de B
  const ventaConFKAjena = await api('/taller/ventas', {
    method: 'POST',
    token: tallerA.token,
    body: { cliente_id: clienteBId, tipo: 'contado', items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }] },
  });
  check(
    'POST /taller/ventas de A con cliente_id de B → 400 (rechazado)',
    ventaConFKAjena.status === 400,
    `status=${ventaConFKAjena.status} body=${JSON.stringify(ventaConFKAjena.body)}`
  );

  // 6) La lista de ventas de A nunca debe traer el nombre del cliente de B vía JOIN
  const ventasA = await api('/taller/ventas', { token: tallerA.token });
  check(
    'GET /taller/ventas de A no expone cliente_nombre de B',
    Array.isArray(ventasA.body) && !ventasA.body.some((v) => v.cliente_nombre === 'Cliente de Tenant B')
  );
  check('La venta creada en B existe (control positivo)', ventaB.status === 201);

  console.log('\n=== Ganadería: contaminación cruzada de reportes agregados ===');
  const animalB = await api('/ganaderia/animales', { method: 'POST', token: ganaderiaB.token, body: { arete: 'SEC-B-01' } });
  const animalBId = animalB.body.id;

  // A intenta registrar producción de leche contra el animal de B
  const produccionAjena = await api('/ganaderia/produccion', {
    method: 'POST',
    token: ganaderiaA.token,
    body: { animal_id: animalBId, fecha: '2026-01-01', turno: 'AM', litros: 999 },
  });
  check(
    'POST /ganaderia/produccion de A con animal_id de B → 400 (rechazado)',
    produccionAjena.status === 400,
    `status=${produccionAjena.status} body=${JSON.stringify(produccionAjena.body)}`
  );

  // Verifica que el resumen de B no contenga litros inyectados por A (999)
  const resumenB = await api('/ganaderia/produccion/resumen', { token: ganaderiaB.token });
  const litrosInyectados = (resumenB.body?.porAnimal || []).some((r) => r.litros === 999);
  check('El resumen de producción de B no fue contaminado por A', !litrosInyectados);

  console.log('\n=== Carwash: foreign key ajena y fuga por JOIN ===');
  const clienteCarB = await api('/carwash/clientes', { method: 'POST', token: carwashB.token, body: { nombre: 'Cliente Carwash B' } });
  const clienteCarBId = clienteCarB.body.id;

  const turnoAjeno = await api('/carwash/turnos', { method: 'POST', token: carwashA.token, body: { cliente_id: clienteCarBId } });
  check(
    'POST /carwash/turnos de A con cliente_id de B → 400 (rechazado)',
    turnoAjeno.status === 400,
    `status=${turnoAjeno.status} body=${JSON.stringify(turnoAjeno.body)}`
  );

  const membresiaAjena = await api('/carwash/membresias', {
    method: 'POST',
    token: carwashA.token,
    body: { cliente_id: clienteCarBId, plan: 'Ilimitado' },
  });
  check(
    'POST /carwash/membresias de A con cliente_id de B → 400 (rechazado)',
    membresiaAjena.status === 400,
    `status=${membresiaAjena.status} body=${JSON.stringify(membresiaAjena.body)}`
  );

  console.log('\n=== Aislamiento por rubro (requireBusinessType) ===');
  const tallerTokenEnCarwash = await api('/carwash/clientes', { token: tallerA.token });
  check('Token de taller no puede usar /api/carwash → 403', tallerTokenEnCarwash.status === 403, `status=${tallerTokenEnCarwash.status}`);

  console.log('\n=== Módulo Inversiones eliminado ===');
  const inversionesRoute = await api('/inversiones/oportunidades', { token: tallerA.token });
  check('/api/inversiones/* ya no existe → 404', inversionesRoute.status === 404, `status=${inversionesRoute.status}`);

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Error ejecutando la prueba:', err);
  process.exit(1);
});
