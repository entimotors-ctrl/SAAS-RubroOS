const bcrypt = require('bcryptjs');
const db = require('./db');

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'stwinkidoo@gmail.com';
const OWNER_PASSWORD = process.env.OWNER_SEED_PASSWORD;
const DEMO_PASSWORD = 'demo1234';
const MASTER_EMAIL = 'maestro@rubroos.test';
const MASTER_PASSWORD = 'Maestro2026!';

// Fechas de demo calculadas en JS en vez de con el minilenguaje de
// modificadores de fecha de SQLite (date('now','+N day')), que no existe en
// PostgreSQL — así estas siembras de ejemplo sirven para ambos motores.
function addDays(days) { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function addMonths(months) { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); }

async function crearUsuarioMaestro(tenantId, business_type) {
  const hash = bcrypt.hashSync(MASTER_PASSWORD, 10);
  await db.prepare(
    `INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, ?, ?, ?, 'Usuario Maestro', 'tenant_admin')`
  ).run(tenantId, business_type, MASTER_EMAIL, hash);
}

async function crearTenant(business_type, nombre_empresa, slug) {
  const info = await db
    .prepare(`INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES (?, ?, ?, 'pro', 'activo')`)
    .run(business_type, nombre_empresa, slug);
  return info.lastInsertRowid;
}

async function crearUsuario(tenantId, business_type, email, nombre) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  await db.prepare(`INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, ?, ?, ?, ?, 'tenant_admin')`).run(
    tenantId,
    business_type,
    email,
    hash,
    nombre
  );
}

async function seedTaller(tenantId) {
  const cliente = await db.prepare('INSERT INTO taller_clientes (tenant_id, nombre, telefono, direccion) VALUES (?,?,?,?)').run(tenantId, 'Carlos Ramírez', '9988-1122', 'Col. Kennedy, Tegucigalpa');
  const cliente2 = await db.prepare('INSERT INTO taller_clientes (tenant_id, nombre, telefono, direccion) VALUES (?,?,?,?)').run(tenantId, 'María Torres', '9911-4455', 'Comayagüela');
  await db.prepare('INSERT INTO taller_vehiculos (tenant_id, cliente_id, placa, marca, modelo, anio) VALUES (?,?,?,?,?,?)').run(tenantId, cliente.lastInsertRowid, 'HAB-1234', 'Bajaj', 'Pulsar 180', '2022');
  await db.prepare('INSERT INTO taller_vehiculos (tenant_id, cliente_id, placa, marca, modelo, anio) VALUES (?,?,?,?,?,?)').run(tenantId, cliente2.lastInsertRowid, 'HAC-5678', 'Yamaha', 'FZ 150', '2023');
  await db.prepare("INSERT INTO taller_citas (tenant_id, cliente_id, fecha, hora, servicio, estado) VALUES (?,?,?,'10:00','Cambio de aceite','pendiente')").run(tenantId, cliente.lastInsertRowid, addDays(0));
  await db.prepare("INSERT INTO taller_citas (tenant_id, cliente_id, fecha, hora, servicio, estado) VALUES (?,?,?,'14:30','Frenos','pendiente')").run(tenantId, cliente2.lastInsertRowid, addDays(1));
  await db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?,?,?,?,?)').run(tenantId, 'Bujía NGK', 'BUJ-001', 95, 40);
  await db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?,?,?,?,?)').run(tenantId, 'Aceite 20W50 (litro)', 'ACE-020', 180, 60);
  await db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?,?,?,?,?)').run(tenantId, 'Pastillas de freno', 'FRE-010', 350, 15);
  const venta = await db.prepare("INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado) VALUES (?,?,'contado',275,275,0,'pagada')").run(tenantId, cliente.lastInsertRowid);
  await db.prepare('INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)').run(venta.lastInsertRowid, 'Cambio de aceite + filtro', 1, 275, 275);
  const credito = await db.prepare("INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado) VALUES (?,?,'credito',1200,400,800,'credito_abierto')").run(tenantId, cliente2.lastInsertRowid);
  await db.prepare('INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)').run(credito.lastInsertRowid, 'Reparación de motor', 1, 1200, 1200);
  await db.prepare('INSERT INTO taller_abonos (tenant_id, venta_id, monto) VALUES (?,?,?)').run(tenantId, credito.lastInsertRowid, 400);
}

async function seedBarberia(tenantId) {
  const b1 = await db.prepare('INSERT INTO barberia_barberos (tenant_id, nombre, especialidad, activo, comision_porcentaje) VALUES (?,?,?,1,40)').run(tenantId, 'Junior Flores', 'Fade y diseño');
  await db.prepare('INSERT INTO barberia_barberos (tenant_id, nombre, especialidad, activo, comision_porcentaje) VALUES (?,?,?,1,40)').run(tenantId, 'Kevin Paz', 'Barba y clásico');
  await db.prepare('INSERT INTO barberia_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Corte clásico', 150, 30);
  const s2 = await db.prepare('INSERT INTO barberia_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Corte + Barba', 250, 45);
  const cliente = await db.prepare('INSERT INTO barberia_clientes (tenant_id, nombre, telefono) VALUES (?,?,?)').run(tenantId, 'Douglas Martínez', '9977-3344');
  await db.prepare("INSERT INTO barberia_citas (tenant_id, cliente_id, barbero_id, servicio_id, fecha, hora, estado) VALUES (?,?,?,?,?,'11:00','pendiente')").run(tenantId, cliente.lastInsertRowid, b1.lastInsertRowid, s2.lastInsertRowid, addDays(0));
  const cuenta = await db.prepare("INSERT INTO barberia_cuentas (tenant_id, cliente_id, barbero_id, estado, total, metodo_pago, cobrada_at, comision_total) VALUES (?,?,?,'pagada',250,'efectivo',datetime('now'),100)").run(tenantId, cliente.lastInsertRowid, b1.lastInsertRowid);
  await db.prepare('INSERT INTO barberia_cuenta_items (cuenta_id, tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?)').run(cuenta.lastInsertRowid, 'servicio', 'Corte + Barba', 1, 250, 250);
}

async function seedAgro(tenantId) {
  // Olancho produce ~75% del sorgo, frijol y maíz blanco de Honduras, y ~35% del frijol nacional.
  await db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Semilla de maíz blanco mejorado (qq)', 'Semillas', 1850, 25, 'quintal');
  await db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Semilla de frijol rojo (qq)', 'Semillas', 2100, 18, 'quintal');
  await db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Fertilizante 18-46-0 (qq)', 'Fertilizantes', 1450, 30, 'quintal');
  await db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Alambre de púas (rollo)', 'Cercas', 890, 20, 'rollo');
  await db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Concentrado bovino (qq)', 'Alimentos', 620, 50, 'quintal');
  const cliente = await db.prepare('INSERT INTO agro_clientes (tenant_id, nombre, finca, telefono) VALUES (?,?,?,?)').run(tenantId, 'Don Marco Turcios', 'Finca El Roble, Catacamas', '9922-1100');
  await db.prepare("INSERT INTO agro_cotizaciones_dron (tenant_id, cliente_nombre, hectareas, tipo_servicio, precio_estimado) VALUES (?,?,?,?,?)").run(tenantId, 'Finca El Roble, Catacamas', 12, 'fumigacion', 4200);
  await db.prepare("INSERT INTO agro_cotizaciones_cerca (tenant_id, cliente_nombre, metros, hilos, precio_estimado) VALUES (?,?,?,?,?)").run(tenantId, 'Finca El Roble, Catacamas', 500, 4, 34000);
  const pedido = await db.prepare("INSERT INTO agro_pedidos (tenant_id, cliente_id, estado, total) VALUES (?,?,'pendiente',3700)").run(tenantId, cliente.lastInsertRowid);
  const primerProducto = await db.prepare('SELECT id FROM agro_productos WHERE tenant_id=? ORDER BY id LIMIT 1').get(tenantId);
  await db.prepare('INSERT INTO agro_pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)').run(pedido.lastInsertRowid, primerProducto.id, 2, 1850, 3700);
}

async function seedGanaderia(tenantId) {
  // Razas típicas de Olancho (zona ganadera-lechera más importante de Honduras: Juticalpa y Catacamas):
  // Gyr Lechero y Pardo Suizo para leche, Brahman como base de cría por su resistencia al trópico.
  const vaca1 = await db.prepare("INSERT INTO ganaderia_animales (tenant_id, arete, nombre, raza, sexo, fecha_nacimiento, peso_kg, estado) VALUES (?,?,?,?,?,?,?,'activo')").run(tenantId, 'HN-001', 'Canela', 'Gyr Lechero', 'hembra', '2021-03-10', 480);
  const vaca2 = await db.prepare("INSERT INTO ganaderia_animales (tenant_id, arete, nombre, raza, sexo, fecha_nacimiento, peso_kg, estado) VALUES (?,?,?,?,?,?,?,'activo')").run(tenantId, 'HN-002', 'Luna', 'Pardo Suizo', 'hembra', '2020-11-02', 410);
  await db.prepare("INSERT INTO ganaderia_animales (tenant_id, arete, nombre, raza, sexo, fecha_nacimiento, peso_kg, estado) VALUES (?,?,?,?,?,?,?,'activo')").run(tenantId, 'HN-003', 'Trueno', 'Brahman', 'macho', '2022-01-15', 320);

  for (let i = 6; i >= 0; i -= 1) {
    await db.prepare("INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?,?,?,'AM',?)").run(tenantId, vaca1.lastInsertRowid, addDays(-i), 9 + (i % 3));
    await db.prepare("INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?,?,?,'PM',?)").run(tenantId, vaca1.lastInsertRowid, addDays(-i), 7 + (i % 2));
    await db.prepare("INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?,?,?,'AM',?)").run(tenantId, vaca2.lastInsertRowid, addDays(-i), 6 + (i % 2));
  }

  await db.prepare("INSERT INTO ganaderia_sanidad (tenant_id, animal_id, tipo, nombre, fecha, proxima_fecha, notas) VALUES (?,?,'vacuna','Fiebre aftosa', ?, ?, 'Refuerzo semestral')").run(tenantId, vaca1.lastInsertRowid, addMonths(-2), addDays(10));
  await db.prepare("INSERT INTO ganaderia_sanidad (tenant_id, animal_id, tipo, nombre, fecha, proxima_fecha, notas) VALUES (?,?,'tratamiento','Desparasitante', ?, ?, NULL)").run(tenantId, vaca2.lastInsertRowid, addMonths(-1), addDays(45));
  await db.prepare("INSERT INTO ganaderia_reproduccion (tenant_id, animal_id, tipo, fecha, fecha_probable_parto, notas) VALUES (?,?,'inseminacion', ?, ?, 'Toro Brahman HN-010')").run(tenantId, vaca1.lastInsertRowid, addDays(-60), addDays(220));
}

async function seedCarwash(tenantId) {
  await db.prepare('INSERT INTO carwash_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Lavado básico', 120, 20);
  const s2 = await db.prepare('INSERT INTO carwash_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Lavado completo + encerado', 280, 45);
  await db.prepare('INSERT INTO carwash_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Lavado de motor', 200, 30);
  const cliente = await db.prepare('INSERT INTO carwash_clientes (tenant_id, nombre, telefono) VALUES (?,?,?)').run(tenantId, 'Sofía Elvir', '9933-2211');
  const vehiculo = await db.prepare("INSERT INTO carwash_vehiculos (tenant_id, cliente_id, placa, tipo) VALUES (?,?,?,'sedan')").run(tenantId, cliente.lastInsertRowid, 'HAT-9090');
  await db.prepare("INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado) VALUES (?,?, 'Ilimitado Mensual', 690, ?, ?,'activa')").run(tenantId, cliente.lastInsertRowid, addDays(-10), addDays(20));
  await db.prepare("INSERT INTO carwash_turnos (tenant_id, cliente_id, vehiculo_id, servicio_id, estado, usa_membresia, precio) VALUES (?,?,?,?,'en_cola',1,0)").run(tenantId, cliente.lastInsertRowid, vehiculo.lastInsertRowid, s2.lastInsertRowid);
}

async function ensureSeed() {
  const yaSembrado = (await db.prepare('SELECT COUNT(*) AS n FROM tenants').get()).n > 0;
  const ownerExiste = await db.prepare("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1").get();

  const run = db.transaction(async () => {
    if (!ownerExiste) {
      if (!OWNER_PASSWORD) {
        throw new Error(
          'Falta OWNER_SEED_PASSWORD en el entorno. Defínela en server/.env (ver server/.env.example) antes de arrancar el servidor por primera vez, para crear la cuenta owner.'
        );
      }
      if(process.env.NODE_ENV==='production'&&(!process.env.OWNER_EMAIL||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(OWNER_EMAIL)))throw Error('Configura el correo real del dueño en OWNER_EMAIL');
      const hash = process.env.NODE_ENV==='production'?require('./services/passwords').hashPassword(OWNER_PASSWORD):bcrypt.hashSync(OWNER_PASSWORD, 10);
      await db.prepare("INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (NULL, NULL, ?, ?, 'Dueño RubroOS', 'owner')").run(OWNER_EMAIL, hash);
      console.log(`[seed] Cuenta owner creada: ${OWNER_EMAIL}`);
    }

    if (!yaSembrado && process.env.NODE_ENV !== 'production') {
      const taller = await crearTenant('taller', 'Moto Taller Rápido', 'moto-taller-rapido');
      await crearUsuario(taller, 'taller', 'demo@taller.test', 'Douglas (Taller)');
      await crearUsuarioMaestro(taller, 'taller');
      await seedTaller(taller);

      const barberia = await crearTenant('barberia', 'Barbería El Corte', 'barberia-el-corte');
      await crearUsuario(barberia, 'barberia', 'demo@barberia.test', 'Junior (Barbería)');
      await crearUsuarioMaestro(barberia, 'barberia');
      await seedBarberia(barberia);

      const agro = await crearTenant('agro', 'AgroInsumos Centro — Juticalpa, Olancho', 'agroinsumos-centro');
      await crearUsuario(agro, 'agro', 'demo@agro.test', 'Elena (Agro)');
      await crearUsuarioMaestro(agro, 'agro');
      await seedAgro(agro);

      const ganaderia = await crearTenant('ganaderia', 'Hacienda La Esperanza — Catacamas, Olancho', 'hacienda-la-esperanza');
      await crearUsuario(ganaderia, 'ganaderia', 'demo@ganaderia.test', 'Don Chepe (Ganadería)');
      await crearUsuarioMaestro(ganaderia, 'ganaderia');
      await seedGanaderia(ganaderia);

      const carwash = await crearTenant('carwash', 'AquaShine Carwash', 'aquashine-carwash');
      await crearUsuario(carwash, 'carwash', 'demo@carwash.test', 'Sofía (Carwash)');
      await crearUsuarioMaestro(carwash, 'carwash');
      await seedCarwash(carwash);

      console.log('[seed] Tenants demo creados (contraseña para todos: demo1234)');
      console.log(`[seed] Usuario maestro (todos los rubros): ${MASTER_EMAIL} / ${MASTER_PASSWORD}`);
    }
  });

  await run();
}

module.exports = { ensureSeed, OWNER_EMAIL, DEMO_PASSWORD, MASTER_EMAIL, MASTER_PASSWORD };
