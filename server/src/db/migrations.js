const fs = require('fs');
const path = require('path');

const migrations = [
  { version: 1, name: 'taller_stock_sales', up(db) {
    db.exec(`
      ALTER TABLE taller_venta_items ADD COLUMN producto_id INTEGER REFERENCES taller_inventario(id);
      ALTER TABLE taller_ventas ADD COLUMN request_key TEXT;
      ALTER TABLE taller_ventas ADD COLUMN request_hash TEXT;
      CREATE UNIQUE INDEX idx_taller_venta_request ON taller_ventas(tenant_id, request_key) WHERE request_key IS NOT NULL;
      CREATE TABLE taller_stock_movimientos (
        id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL REFERENCES taller_inventario(id),
        venta_id INTEGER REFERENCES taller_ventas(id),
        cantidad REAL NOT NULL, stock_resultante REAL NOT NULL,
        motivo TEXT NOT NULL, user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_taller_stock_tenant ON taller_stock_movimientos(tenant_id, producto_id, id);
    `);
  } },
  { version: 2, name: 'taller_repair_orders', up(db) {
    db.exec(`
      CREATE TABLE taller_ordenes (
        id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL,
        cliente_id INTEGER NOT NULL, vehiculo_id INTEGER NOT NULL,
        kilometraje REAL NOT NULL DEFAULT 0, motivo TEXT NOT NULL,
        diagnostico TEXT NOT NULL DEFAULT '', responsable TEXT NOT NULL DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'recibida', presupuesto TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1, venta_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_taller_ordenes_tenant ON taller_ordenes(tenant_id, estado);
      CREATE UNIQUE INDEX idx_taller_orden_venta ON taller_ordenes(venta_id) WHERE venta_id IS NOT NULL;
      CREATE TABLE taller_orden_eventos (
        id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL,
        orden_id INTEGER NOT NULL REFERENCES taller_ordenes(id), user_id INTEGER NOT NULL,
        evento TEXT NOT NULL, detalle TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_taller_orden_eventos ON taller_orden_eventos(tenant_id, orden_id, id);
    `);
  } },
  { version: 3, name: 'multi_business_beta', up(db) {
    db.exec(`
      ALTER TABLE barberia_citas ADD COLUMN duracion_min INTEGER;
      ALTER TABLE barberia_barberos ADD COLUMN comision_porcentaje REAL NOT NULL DEFAULT 0;
      ALTER TABLE barberia_cuentas ADD COLUMN comision_total REAL NOT NULL DEFAULT 0;
      ALTER TABLE barberia_cuentas ADD COLUMN cobrada_at TEXT;
      UPDATE barberia_cuentas SET cobrada_at = created_at WHERE estado = 'pagada';
      ALTER TABLE carwash_turnos ADD COLUMN entregado_at TEXT;
      ALTER TABLE carwash_turnos ADD COLUMN metodo_pago TEXT;
      ALTER TABLE carwash_turnos ADD COLUMN membresia_id INTEGER;
      UPDATE carwash_turnos SET entregado_at = created_at WHERE estado = 'entregado';
      CREATE TABLE operation_requests(tenant_id INTEGER NOT NULL,scope TEXT NOT NULL,request_key TEXT NOT NULL,payload TEXT NOT NULL,result_id INTEGER NOT NULL,PRIMARY KEY(tenant_id,scope,request_key));
      CREATE TABLE tenant_settings (tenant_id INTEGER NOT NULL, section TEXT NOT NULL, settings TEXT NOT NULL, PRIMARY KEY(tenant_id,section));
      CREATE TABLE business_events (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, user_id INTEGER, event TEXT NOT NULL, entity_id INTEGER, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE INDEX idx_business_events ON business_events(tenant_id,id);
      CREATE INDEX idx_milk_record ON ganaderia_produccion_leche(tenant_id,animal_id,fecha,turno);
      CREATE INDEX idx_appointments ON barberia_citas(tenant_id,barbero_id,fecha);
      CREATE TABLE owner_events (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, tenant_id INTEGER, event TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    `);
  } },
  { version: 4, name: 'stable_operations', up(db) {
    db.exec(`
      ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE ganaderia_produccion_leche ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE agro_pedidos ADD COLUMN pagado REAL NOT NULL DEFAULT 0;
      ALTER TABLE agro_pedidos ADD COLUMN metodo_pago TEXT;
      ALTER TABLE agro_pedidos ADD COLUMN cobrado_at TEXT;
      ALTER TABLE agro_pedidos ADD COLUMN reembolsado REAL NOT NULL DEFAULT 0;
      CREATE TABLE password_resets(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,created_by INTEGER NOT NULL);
      CREATE TABLE daily_closures(id INTEGER PRIMARY KEY,tenant_id INTEGER NOT NULL,fecha TEXT NOT NULL,user_id INTEGER NOT NULL,snapshot TEXT NOT NULL,notas TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(tenant_id,fecha));
    `);
  } },
  {version:5,name:'worker_portal',up(db){db.exec(`
    ALTER TABLE users ADD COLUMN access_status TEXT NOT NULL DEFAULT 'activo';
    ALTER TABLE barberia_citas ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE barberia_citas ADD COLUMN llamada_at TEXT;
    ALTER TABLE barberia_citas ADD COLUMN iniciada_at TEXT;
    ALTER TABLE barberia_citas ADD COLUMN finalizada_at TEXT;
    CREATE TABLE staff_profiles(user_id INTEGER PRIMARY KEY,tenant_id INTEGER NOT NULL,barbero_id INTEGER);
    CREATE UNIQUE INDEX staff_barber ON staff_profiles(tenant_id,barbero_id) WHERE barbero_id IS NOT NULL;
    CREATE TABLE staff_invitations(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,tenant_id INTEGER NOT NULL,created_by INTEGER NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,created_at TEXT NOT NULL DEFAULT(datetime('now')));
    CREATE TABLE staff_tasks(id INTEGER PRIMARY KEY,tenant_id INTEGER NOT NULL,assigned_to INTEGER NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',due_date TEXT,priority TEXT NOT NULL DEFAULT 'normal',status TEXT NOT NULL DEFAULT 'pendiente',version INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')));
    CREATE INDEX staff_tasks_assignment ON staff_tasks(tenant_id,assigned_to,status,due_date);
    CREATE TABLE staff_events(id INTEGER PRIMARY KEY,tenant_id INTEGER NOT NULL,user_id INTEGER NOT NULL,entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')));
    CREATE INDEX staff_events_tenant ON staff_events(tenant_id,id);
  `);}},
  {version:6,name:'barberia_appointment_accounts',up(db){db.exec(`
    ALTER TABLE barberia_cuentas ADD COLUMN cita_id INTEGER;
    CREATE UNIQUE INDEX barberia_cuenta_por_cita ON barberia_cuentas(tenant_id,cita_id) WHERE cita_id IS NOT NULL;
  `);}},
  {version:7,name:'barberia_availability',up(db){db.exec(`
    CREATE TABLE barberia_horarios (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      barbero_id INTEGER NOT NULL,
      dia_semana INTEGER NOT NULL,
      hora_inicio TEXT,
      hora_fin TEXT,
      activo INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tenant_id,barbero_id,dia_semana)
    );
    CREATE INDEX barberia_horarios_lookup ON barberia_horarios(tenant_id,barbero_id,dia_semana,activo);
    CREATE TABLE barberia_bloqueos (
      id INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      barbero_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      hora_inicio TEXT,
      hora_fin TEXT,
      motivo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
    CREATE INDEX barberia_bloqueos_lookup ON barberia_bloqueos(tenant_id,barbero_id,fecha);
    INSERT OR IGNORE INTO barberia_horarios(tenant_id,barbero_id,dia_semana,hora_inicio,hora_fin,activo)
    SELECT b.tenant_id,b.id,d.dia,'09:00','18:00',1
    FROM barberia_barberos b
    CROSS JOIN (
      SELECT 1 AS dia UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
      SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
    ) d
    WHERE b.activo=1;
    CREATE TRIGGER barberia_barbero_horario_inicial
    AFTER INSERT ON barberia_barberos
    BEGIN
      INSERT OR IGNORE INTO barberia_horarios(tenant_id,barbero_id,dia_semana,hora_inicio,hora_fin,activo)
      VALUES
        (NEW.tenant_id,NEW.id,1,'09:00','18:00',1),
        (NEW.tenant_id,NEW.id,2,'09:00','18:00',1),
        (NEW.tenant_id,NEW.id,3,'09:00','18:00',1),
        (NEW.tenant_id,NEW.id,4,'09:00','18:00',1),
        (NEW.tenant_id,NEW.id,5,'09:00','18:00',1),
        (NEW.tenant_id,NEW.id,6,'09:00','18:00',1),
        (NEW.tenant_id,NEW.id,0,NULL,NULL,0);
    END;
  `);}},

];

function migrate(db, dbPath) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  const pending = migrations.filter(m => !db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(m.version));
  if (!pending.length) return;
  // serialize produces a consistent SQLite snapshot, including committed WAL data.
  if (dbPath !== ':memory:' && db.prepare('SELECT COUNT(*) AS n FROM tenants').get().n > 0) {
    const folder = path.join(path.dirname(dbPath), 'backups');
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const destination = path.join(folder, `before-migration-${pending[0].version}-${Date.now()}.db`);
    fs.writeFileSync(destination, db.serialize(), { mode: 0o600, flag: 'wx' });
  }
  db.transaction(() => {
    for (const m of pending) {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations(version, name) VALUES (?, ?)').run(m.version, m.name);
    }
  }).immediate();
}
module.exports = { migrate };
