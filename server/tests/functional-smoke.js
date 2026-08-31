/**
 * Smoke test funcional — un recorrido rápido y real (no simulado) de login +
 * CRUD básico en cada uno de los 5 rubros, más el panel del owner.
 *
 * Requiere el servidor corriendo en http://localhost:4000 (o API_URL) con
 * los datos demo sembrados (server/src/seed.js). No modifica datos demo
 * existentes de forma destructiva: solo agrega un registro de prueba
 * (nombre con prefijo "QA Smoke") y lo borra al final.
 *
 * Uso: node tests/functional-smoke.js
 */

const BASE = process.env.API_URL || 'http://localhost:4000/api';
const DEMO_PASSWORD = 'demo1234';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'stwinkidoo@gmail.com';
const OWNER_PASSWORD = process.env.OWNER_SEED_PASSWORD;

let pass = 0;
let fail = 0;
const failedRubros = [];

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`    OK   ${label}`);
  } else {
    fail += 1;
    console.log(`    FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
  return condition;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

async function login(business_type, email) {
  const r = await api('/auth/login', { method: 'POST', body: { business_type, email, password: DEMO_PASSWORD } });
  if (r.status !== 200) throw new Error(`login falló para ${email}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

async function runRubro(nombre, fn) {
  console.log(`\n=== ${nombre} ===`);
  const before = fail;
  try {
    await fn();
  } catch (err) {
    check(`${nombre}: excepción inesperada`, false, err.message);
  }
  if (fail > before) failedRubros.push(nombre);
}

async function main() {
  await runRubro('Taller', async () => {
    const token = await login('taller', 'demo@taller.test');
    const clientes = await api('/taller/clientes', { token });
    check('GET clientes', clientes.status === 200 && Array.isArray(clientes.body));
    const nuevo = await api('/taller/clientes', { method: 'POST', token, body: { nombre: 'QA Smoke Cliente' } });
    check('POST cliente', nuevo.status === 201);
    const sinNombre = await api('/taller/clientes', { method: 'POST', token, body: {} });
    check('POST cliente sin nombre → 400 (no 500)', sinNombre.status === 400, `status=${sinNombre.status}`);
    const ventas = await api('/taller/ventas', { token });
    check('GET ventas', ventas.status === 200);
    if (nuevo.body?.id) await api(`/taller/clientes/${nuevo.body.id}`, { method: 'DELETE', token });
  });

  await runRubro('Barbería', async () => {
    const token = await login('barberia', 'demo@barberia.test');
    const barberos = await api('/barberia/barberos', { token });
    check('GET barberos', barberos.status === 200 && barberos.body.length > 0);
    const clientes = await api('/barberia/clientes', { token });
    check('GET clientes', clientes.status === 200);
    const nuevo = await api('/barberia/clientes', { method: 'POST', token, body: { nombre: 'QA Smoke Cliente' } });
    check('POST cliente', nuevo.status === 201);
    if (nuevo.body?.id) await api(`/barberia/clientes/${nuevo.body.id}`, { method: 'DELETE', token });
  });

  await runRubro('Agro', async () => {
    const token = await login('agro', 'demo@agro.test');
    const productos = await api('/agro/productos', { token });
    check('GET productos', productos.status === 200 && productos.body.length > 0);
    const pedidos = await api('/agro/pedidos', { token });
    check('GET pedidos', pedidos.status === 200);
    const cliente = await api('/agro/clientes', { method: 'POST', token, body: { nombre: 'QA Smoke Cliente' } });
    check('POST cliente', cliente.status === 201);
    if (cliente.body?.id) await api(`/agro/clientes/${cliente.body.id}`, { method: 'DELETE', token });
  });

  await runRubro('Ganadería y Lechería', async () => {
    const token = await login('ganaderia', 'demo@ganaderia.test');
    const animales = await api('/ganaderia/animales', { token });
    check('GET animales', animales.status === 200 && animales.body.length > 0);
    const produccion = await api('/ganaderia/produccion', { token });
    check('GET produccion', produccion.status === 200);
    const alertas = await api('/ganaderia/sanidad/alertas', { token });
    check('GET alertas de sanidad', alertas.status === 200);
    const resumen = await api('/ganaderia/produccion/resumen', { token });
    check('GET resumen de producción', resumen.status === 200 && typeof resumen.body.litrosHoy === 'number');
  });

  await runRubro('Carwash', async () => {
    const token = await login('carwash', 'demo@carwash.test');
    const servicios = await api('/carwash/servicios', { token });
    check('GET servicios', servicios.status === 200 && servicios.body.length > 0);
    const membresias = await api('/carwash/membresias', { token });
    check('GET membresias', membresias.status === 200);
    const turnos = await api('/carwash/turnos', { token });
    check('GET turnos', turnos.status === 200);
  });

  await runRubro('Owner', async () => {
    if (!OWNER_PASSWORD) {
      console.log('    SKIP (define OWNER_SEED_PASSWORD en el entorno para probar el login del owner)');
      return;
    }
    const r = await api('/auth/owner-login', { method: 'POST', body: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
    check('owner login', r.status === 200, `status=${r.status}`);
    const token = r.body?.token;
    const overview = await api('/owner/overview', { token });
    check('GET overview', overview.status === 200 && overview.body.totalTenants > 0);
    check('overview refleja 5 rubros (sin inversiones)', overview.body.porRubro?.length === 5, JSON.stringify(overview.body.porRubro?.map((r) => r.business_type)));
    const tenants = await api('/owner/tenants', { token });
    check('GET tenants', tenants.status === 200 && Array.isArray(tenants.body));
  });

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  for (const nombre of ['Taller', 'Barbería', 'Agro', 'Ganadería y Lechería', 'Carwash', 'Owner']) {
    console.log(`  ${nombre}: ${failedRubros.includes(nombre) ? 'FAIL' : 'PASS'}`);
  }
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Error ejecutando la prueba:', err);
  process.exit(1);
});
