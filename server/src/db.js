const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'rubroos.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_type TEXT NOT NULL,
  nombre_empresa TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'trial',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  business_type TEXT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant_admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email, business_type),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ===== TALLER =====
CREATE TABLE IF NOT EXISTS taller_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, telefono TEXT, direccion TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS taller_vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER,
  placa TEXT, marca TEXT, modelo TEXT, anio TEXT, notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS taller_citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER, vehiculo_id INTEGER,
  fecha TEXT NOT NULL, hora TEXT NOT NULL, servicio TEXT, estado TEXT NOT NULL DEFAULT 'pendiente', notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS taller_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, sku TEXT, precio REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS taller_ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER,
  tipo TEXT NOT NULL DEFAULT 'contado', total REAL NOT NULL DEFAULT 0, pagado REAL NOT NULL DEFAULT 0,
  saldo REAL NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'abierta',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS taller_venta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER NOT NULL,
  descripcion TEXT NOT NULL, cantidad REAL NOT NULL DEFAULT 1, precio_unitario REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS taller_abonos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, venta_id INTEGER NOT NULL,
  monto REAL NOT NULL, fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== BARBERIA =====
CREATE TABLE IF NOT EXISTS barberia_barberos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, especialidad TEXT, activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS barberia_servicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, precio REAL NOT NULL DEFAULT 0, duracion_min INTEGER NOT NULL DEFAULT 30
);
CREATE TABLE IF NOT EXISTS barberia_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, telefono TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS barberia_citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER, barbero_id INTEGER, servicio_id INTEGER,
  fecha TEXT NOT NULL, hora TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente'
);
CREATE TABLE IF NOT EXISTS barberia_cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER, barbero_id INTEGER,
  estado TEXT NOT NULL DEFAULT 'abierta', total REAL NOT NULL DEFAULT 0, metodo_pago TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS barberia_cuenta_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cuenta_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'servicio', descripcion TEXT NOT NULL, cantidad REAL NOT NULL DEFAULT 1,
  precio_unitario REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0
);

-- ===== AGRO =====
CREATE TABLE IF NOT EXISTS agro_productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, categoria TEXT, precio REAL NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, unidad TEXT DEFAULT 'unidad'
);
CREATE TABLE IF NOT EXISTS agro_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, finca TEXT, telefono TEXT
);
CREATE TABLE IF NOT EXISTS agro_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER,
  estado TEXT NOT NULL DEFAULT 'pendiente', total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agro_pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, producto_id INTEGER,
  cantidad REAL NOT NULL DEFAULT 1, precio_unitario REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agro_cotizaciones_dron (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  cliente_nombre TEXT, hectareas REAL NOT NULL, tipo_servicio TEXT NOT NULL, precio_estimado REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agro_cotizaciones_cerca (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  cliente_nombre TEXT, metros REAL NOT NULL, hilos INTEGER NOT NULL DEFAULT 4, precio_estimado REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== GANADERIA Y LECHERIA =====
CREATE TABLE IF NOT EXISTS ganaderia_animales (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  arete TEXT NOT NULL, nombre TEXT, raza TEXT, sexo TEXT NOT NULL DEFAULT 'hembra',
  fecha_nacimiento TEXT, peso_kg REAL, estado TEXT NOT NULL DEFAULT 'activo',
  madre_arete TEXT, padre_arete TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, arete)
);
CREATE TABLE IF NOT EXISTS ganaderia_produccion_leche (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, animal_id INTEGER NOT NULL,
  fecha TEXT NOT NULL, turno TEXT NOT NULL DEFAULT 'AM', litros REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ganaderia_sanidad (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, animal_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'vacuna', nombre TEXT NOT NULL, fecha TEXT NOT NULL,
  proxima_fecha TEXT, notas TEXT
);
CREATE TABLE IF NOT EXISTS ganaderia_reproduccion (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, animal_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'monta', fecha TEXT NOT NULL, fecha_probable_parto TEXT, notas TEXT
);

-- ===== CARWASH =====
CREATE UNIQUE INDEX IF NOT EXISTS idx_ganaderia_animales_arete ON ganaderia_animales(tenant_id, arete);

CREATE TABLE IF NOT EXISTS carwash_servicios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, precio REAL NOT NULL DEFAULT 0, duracion_min INTEGER NOT NULL DEFAULT 20
);
CREATE TABLE IF NOT EXISTS carwash_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, telefono TEXT
);
CREATE TABLE IF NOT EXISTS carwash_vehiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER,
  placa TEXT, tipo TEXT NOT NULL DEFAULT 'sedan'
);
CREATE TABLE IF NOT EXISTS carwash_membresias (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER NOT NULL,
  plan TEXT NOT NULL, precio_mensual REAL NOT NULL DEFAULT 0,
  fecha_inicio TEXT NOT NULL DEFAULT (date('now')), fecha_renovacion TEXT, estado TEXT NOT NULL DEFAULT 'activa'
);
CREATE TABLE IF NOT EXISTS carwash_turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, cliente_id INTEGER, vehiculo_id INTEGER, servicio_id INTEGER,
  estado TEXT NOT NULL DEFAULT 'en_cola', usa_membresia INTEGER NOT NULL DEFAULT 0, precio REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== IA (preparación — sin orquestador conectado todavía, ver server/src/ai) =====
-- tenant_id se guarda también en ai_messages/ai_actions (no solo en
-- ai_conversations) a propósito: así cualquier consulta puede filtrar por
-- tenant_id directamente, sin depender de un JOIN correcto contra
-- ai_conversations para no repetir la clase de error que corrigió la
-- auditoría de seguridad multi-tenant (JOIN sin tenant_id en ambos lados).
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, user_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'web', external_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
);
CREATE TABLE IF NOT EXISTS ai_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, tenant_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL, arguments TEXT, idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending_confirmation', result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant ON ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_actions_conversation ON ai_actions(conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_actions_idempotency
  ON ai_actions(conversation_id, tool_name, idempotency_key) WHERE idempotency_key IS NOT NULL;
`);

module.exports = db;
