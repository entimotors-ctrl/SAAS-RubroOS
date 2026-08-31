const bcrypt = require('bcryptjs');
const db = require('./db');

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'stwinkidoo@gmail.com';
const OWNER_PASSWORD = process.env.OWNER_SEED_PASSWORD;
const DEMO_PASSWORD = 'demo1234';
const MASTER_EMAIL = 'maestro@rubroos.test';
const MASTER_PASSWORD = 'Maestro2026!';

function crearUsuarioMaestro(tenantId, business_type) {
  const hash = bcrypt.hashSync(MASTER_PASSWORD, 10);
  db.prepare(
    `INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, ?, ?, ?, 'Usuario Maestro', 'tenant_admin')`
  ).run(tenantId, business_type, MASTER_EMAIL, hash);
}

function crearTenant(business_type, nombre_empresa, slug) {
  const info = db
    .prepare(`INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES (?, ?, ?, 'pro', 'activo')`)
    .run(business_type, nombre_empresa, slug);
  return info.lastInsertRowid;
}

function crearUsuario(tenantId, business_type, email, nombre) {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  db.prepare(`INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, ?, ?, ?, ?, 'tenant_admin')`).run(
    tenantId,
    business_type,
    email,
    hash,
    nombre
  );
}

function seedTaller(tenantId) {
  const cliente = db.prepare('INSERT INTO taller_clientes (tenant_id, nombre, telefono, direccion) VALUES (?,?,?,?)').run(tenantId, 'Carlos Ramírez', '9988-1122', 'Col. Kennedy, Tegucigalpa');
  const cliente2 = db.prepare('INSERT INTO taller_clientes (tenant_id, nombre, telefono, direccion) VALUES (?,?,?,?)').run(tenantId, 'María Torres', '9911-4455', 'Comayagüela');
  db.prepare('INSERT INTO taller_vehiculos (tenant_id, cliente_id, placa, marca, modelo, anio) VALUES (?,?,?,?,?,?)').run(tenantId, cliente.lastInsertRowid, 'HAB-1234', 'Bajaj', 'Pulsar 180', '2022');
  db.prepare('INSERT INTO taller_vehiculos (tenant_id, cliente_id, placa, marca, modelo, anio) VALUES (?,?,?,?,?,?)').run(tenantId, cliente2.lastInsertRowid, 'HAC-5678', 'Yamaha', 'FZ 150', '2023');
  db.prepare("INSERT INTO taller_citas (tenant_id, cliente_id, fecha, hora, servicio, estado) VALUES (?,?,date('now'),'10:00','Cambio de aceite','pendiente')").run(tenantId, cliente.lastInsertRowid);
  db.prepare("INSERT INTO taller_citas (tenant_id, cliente_id, fecha, hora, servicio, estado) VALUES (?,?,date('now','+1 day'),'14:30','Frenos','pendiente')").run(tenantId, cliente2.lastInsertRowid);
  db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?,?,?,?,?)').run(tenantId, 'Bujía NGK', 'BUJ-001', 95, 40);
  db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?,?,?,?,?)').run(tenantId, 'Aceite 20W50 (litro)', 'ACE-020', 180, 60);
  db.prepare('INSERT INTO taller_inventario (tenant_id, nombre, sku, precio, stock) VALUES (?,?,?,?,?)').run(tenantId, 'Pastillas de freno', 'FRE-010', 350, 15);
  const venta = db.prepare("INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado) VALUES (?,?,'contado',275,275,0,'pagada')").run(tenantId, cliente.lastInsertRowid);
  db.prepare('INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)').run(venta.lastInsertRowid, 'Cambio de aceite + filtro', 1, 275, 275);
  const credito = db.prepare("INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado) VALUES (?,?,'credito',1200,400,800,'credito_abierto')").run(tenantId, cliente2.lastInsertRowid);
  db.prepare('INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)').run(credito.lastInsertRowid, 'Reparación de motor', 1, 1200, 1200);
  db.prepare('INSERT INTO taller_abonos (tenant_id, venta_id, monto) VALUES (?,?,?)').run(tenantId, credito.lastInsertRowid, 400);
}

function seedBarberia(tenantId) {
  const b1 = db.prepare('INSERT INTO barberia_barberos (tenant_id, nombre, especialidad, activo) VALUES (?,?,?,1)').run(tenantId, 'Junior Flores', 'Fade y diseño');
  db.prepare('INSERT INTO barberia_barberos (tenant_id, nombre, especialidad, activo) VALUES (?,?,?,1)').run(tenantId, 'Kevin Paz', 'Barba y clásico');
  db.prepare('INSERT INTO barberia_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Corte clásico', 150, 30);
  const s2 = db.prepare('INSERT INTO barberia_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Corte + Barba', 250, 45);
  const cliente = db.prepare('INSERT INTO barberia_clientes (tenant_id, nombre, telefono) VALUES (?,?,?)').run(tenantId, 'Douglas Martínez', '9977-3344');
  db.prepare("INSERT INTO barberia_citas (tenant_id, cliente_id, barbero_id, servicio_id, fecha, hora, estado) VALUES (?,?,?,?,date('now'),'11:00','pendiente')").run(tenantId, cliente.lastInsertRowid, b1.lastInsertRowid, s2.lastInsertRowid);
  const cuenta = db.prepare("INSERT INTO barberia_cuentas (tenant_id, cliente_id, barbero_id, estado, total, metodo_pago) VALUES (?,?,?,'pagada',250,'efectivo')").run(tenantId, cliente.lastInsertRowid, b1.lastInsertRowid);
  db.prepare('INSERT INTO barberia_cuenta_items (cuenta_id, tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?)').run(cuenta.lastInsertRowid, 'servicio', 'Corte + Barba', 1, 250, 250);
}

function seedAgro(tenantId) {
  // Olancho produce ~75% del sorgo, frijol y maíz blanco de Honduras, y ~35% del frijol nacional.
  db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Semilla de maíz blanco mejorado (qq)', 'Semillas', 1850, 25, 'quintal');
  db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Semilla de frijol rojo (qq)', 'Semillas', 2100, 18, 'quintal');
  db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Fertilizante 18-46-0 (qq)', 'Fertilizantes', 1450, 30, 'quintal');
  db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Alambre de púas (rollo)', 'Cercas', 890, 20, 'rollo');
  db.prepare('INSERT INTO agro_productos (tenant_id, nombre, categoria, precio, stock, unidad) VALUES (?,?,?,?,?,?)').run(tenantId, 'Concentrado bovino (qq)', 'Alimentos', 620, 50, 'quintal');
  const cliente = db.prepare('INSERT INTO agro_clientes (tenant_id, nombre, finca, telefono) VALUES (?,?,?,?)').run(tenantId, 'Don Marco Turcios', 'Finca El Roble, Catacamas', '9922-1100');
  db.prepare("INSERT INTO agro_cotizaciones_dron (tenant_id, cliente_nombre, hectareas, tipo_servicio, precio_estimado) VALUES (?,?,?,?,?)").run(tenantId, 'Finca El Roble, Catacamas', 12, 'fumigacion', 4200);
  db.prepare("INSERT INTO agro_cotizaciones_cerca (tenant_id, cliente_nombre, metros, hilos, precio_estimado) VALUES (?,?,?,?,?)").run(tenantId, 'Finca El Roble, Catacamas', 500, 4, 34000);
  const pedido = db.prepare("INSERT INTO agro_pedidos (tenant_id, cliente_id, estado, total) VALUES (?,?,'pendiente',3700)").run(tenantId, cliente.lastInsertRowid);
  db.prepare('INSERT INTO agro_pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)').run(pedido.lastInsertRowid, 1, 2, 1850, 3700);
}

function seedGanaderia(tenantId) {
  // Razas típicas de Olancho (zona ganadera-lechera más importante de Honduras: Juticalpa y Catacamas):
  // Gyr Lechero y Pardo Suizo para leche, Brahman como base de cría por su resistencia al trópico.
  const vaca1 = db.prepare("INSERT INTO ganaderia_animales (tenant_id, arete, nombre, raza, sexo, fecha_nacimiento, peso_kg, estado) VALUES (?,?,?,?,?,?,?,'activo')").run(tenantId, 'HN-001', 'Canela', 'Gyr Lechero', 'hembra', '2021-03-10', 480);
  const vaca2 = db.prepare("INSERT INTO ganaderia_animales (tenant_id, arete, nombre, raza, sexo, fecha_nacimiento, peso_kg, estado) VALUES (?,?,?,?,?,?,?,'activo')").run(tenantId, 'HN-002', 'Luna', 'Pardo Suizo', 'hembra', '2020-11-02', 410);
  db.prepare("INSERT INTO ganaderia_animales (tenant_id, arete, nombre, raza, sexo, fecha_nacimiento, peso_kg, estado) VALUES (?,?,?,?,?,?,?,'activo')").run(tenantId, 'HN-003', 'Trueno', 'Brahman', 'macho', '2022-01-15', 320);

  for (let i = 6; i >= 0; i -= 1) {
    db.prepare("INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?,?,date('now', ?),'AM',?)").run(tenantId, vaca1.lastInsertRowid, `-${i} day`, 9 + (i % 3));
    db.prepare("INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?,?,date('now', ?),'PM',?)").run(tenantId, vaca1.lastInsertRowid, `-${i} day`, 7 + (i % 2));
    db.prepare("INSERT INTO ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno, litros) VALUES (?,?,date('now', ?),'AM',?)").run(tenantId, vaca2.lastInsertRowid, `-${i} day`, 6 + (i % 2));
  }

  db.prepare("INSERT INTO ganaderia_sanidad (tenant_id, animal_id, tipo, nombre, fecha, proxima_fecha, notas) VALUES (?,?,'vacuna','Fiebre aftosa', date('now','-2 month'), date('now','+10 day'), 'Refuerzo semestral')").run(tenantId, vaca1.lastInsertRowid);
  db.prepare("INSERT INTO ganaderia_sanidad (tenant_id, animal_id, tipo, nombre, fecha, proxima_fecha, notas) VALUES (?,?,'tratamiento','Desparasitante', date('now','-1 month'), date('now','+45 day'), NULL)").run(tenantId, vaca2.lastInsertRowid);
  db.prepare("INSERT INTO ganaderia_reproduccion (tenant_id, animal_id, tipo, fecha, fecha_probable_parto, notas) VALUES (?,?,'inseminacion', date('now','-60 day'), date('now','+220 day'), 'Toro Brahman HN-010')").run(tenantId, vaca1.lastInsertRowid);
}

function seedCarwash(tenantId) {
  db.prepare('INSERT INTO carwash_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Lavado básico', 120, 20);
  const s2 = db.prepare('INSERT INTO carwash_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Lavado completo + encerado', 280, 45);
  db.prepare('INSERT INTO carwash_servicios (tenant_id, nombre, precio, duracion_min) VALUES (?,?,?,?)').run(tenantId, 'Lavado de motor', 200, 30);
  const cliente = db.prepare('INSERT INTO carwash_clientes (tenant_id, nombre, telefono) VALUES (?,?,?)').run(tenantId, 'Sofía Elvir', '9933-2211');
  const vehiculo = db.prepare("INSERT INTO carwash_vehiculos (tenant_id, cliente_id, placa, tipo) VALUES (?,?,?,'sedan')").run(tenantId, cliente.lastInsertRowid, 'HAT-9090');
  db.prepare("INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado) VALUES (?,?, 'Ilimitado Mensual', 690, date('now','-10 day'), date('now','+20 day'),'activa')").run(tenantId, cliente.lastInsertRowid);
  db.prepare("INSERT INTO carwash_turnos (tenant_id, cliente_id, vehiculo_id, servicio_id, estado, usa_membresia, precio) VALUES (?,?,?,?,'en_cola',1,0)").run(tenantId, cliente.lastInsertRowid, vehiculo.lastInsertRowid, s2.lastInsertRowid);
}

function ensureSeed() {
  const yaSembrado = db.prepare('SELECT COUNT(*) AS n FROM tenants').get().n > 0;
  const ownerExiste = db.prepare("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1").get();

  const run = db.transaction(() => {
    if (!ownerExiste) {
      if (!OWNER_PASSWORD) {
        throw new Error(
          'Falta OWNER_SEED_PASSWORD en el entorno. Defínela en server/.env (ver server/.env.example) antes de arrancar el servidor por primera vez, para crear la cuenta owner.'
        );
      }
      const hash = bcrypt.hashSync(OWNER_PASSWORD, 10);
      db.prepare("INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (NULL, NULL, ?, ?, 'Dueño RubroOS', 'owner')").run(OWNER_EMAIL, hash);
      console.log(`[seed] Cuenta owner creada: ${OWNER_EMAIL}`);
    }

    if (!yaSembrado) {
      const taller = crearTenant('taller', 'Moto Taller Rápido', 'moto-taller-rapido');
      crearUsuario(taller, 'taller', 'demo@taller.test', 'Douglas (Taller)');
      crearUsuarioMaestro(taller, 'taller');
      seedTaller(taller);

      const barberia = crearTenant('barberia', 'Barbería El Corte', 'barberia-el-corte');
      crearUsuario(barberia, 'barberia', 'demo@barberia.test', 'Junior (Barbería)');
      crearUsuarioMaestro(barberia, 'barberia');
      seedBarberia(barberia);

      const agro = crearTenant('agro', 'AgroInsumos Centro — Juticalpa, Olancho', 'agroinsumos-centro');
      crearUsuario(agro, 'agro', 'demo@agro.test', 'Elena (Agro)');
      crearUsuarioMaestro(agro, 'agro');
      seedAgro(agro);

      const ganaderia = crearTenant('ganaderia', 'Hacienda La Esperanza — Catacamas, Olancho', 'hacienda-la-esperanza');
      crearUsuario(ganaderia, 'ganaderia', 'demo@ganaderia.test', 'Don Chepe (Ganadería)');
      crearUsuarioMaestro(ganaderia, 'ganaderia');
      seedGanaderia(ganaderia);

      const carwash = crearTenant('carwash', 'AquaShine Carwash', 'aquashine-carwash');
      crearUsuario(carwash, 'carwash', 'demo@carwash.test', 'Sofía (Carwash)');
      crearUsuarioMaestro(carwash, 'carwash');
      seedCarwash(carwash);

      console.log('[seed] Tenants demo creados (contraseña para todos: demo1234)');
      console.log(`[seed] Usuario maestro (todos los rubros): ${MASTER_EMAIL} / ${MASTER_PASSWORD}`);
    }
  });

  run();
}

module.exports = { ensureSeed, OWNER_EMAIL, DEMO_PASSWORD, MASTER_EMAIL, MASTER_PASSWORD };
