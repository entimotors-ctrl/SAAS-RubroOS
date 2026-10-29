const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { migrate } = require('../src/db/migrations');
const folder = fs.mkdtempSync(path.join(os.tmpdir(),'rubroos-migration-'));
const file = path.join(folder,'legacy.db');
const db = new Database(file);
try {
  db.pragma('journal_mode=WAL');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY); CREATE TABLE agro_pedidos(id INTEGER PRIMARY KEY); CREATE TABLE tenants(id INTEGER PRIMARY KEY); INSERT INTO tenants VALUES(1);
    CREATE TABLE barberia_citas(id INTEGER PRIMARY KEY,tenant_id INTEGER,barbero_id INTEGER,fecha TEXT); CREATE TABLE barberia_barberos(id INTEGER PRIMARY KEY,tenant_id INTEGER,activo INTEGER DEFAULT 1); CREATE TABLE barberia_cuentas(id INTEGER PRIMARY KEY,tenant_id INTEGER,estado TEXT,created_at TEXT); CREATE TABLE carwash_turnos(id INTEGER PRIMARY KEY,created_at TEXT,estado TEXT); CREATE TABLE ganaderia_produccion_leche(id INTEGER PRIMARY KEY,tenant_id INTEGER,animal_id INTEGER,fecha TEXT,turno TEXT);
    CREATE TABLE taller_inventario(id INTEGER PRIMARY KEY);
    CREATE TABLE taller_ventas(id INTEGER PRIMARY KEY, tenant_id INTEGER, total REAL);
    CREATE TABLE taller_venta_items(id INTEGER PRIMARY KEY, venta_id INTEGER, descripcion TEXT);
    INSERT INTO taller_ventas VALUES(1,1,50); INSERT INTO taller_venta_items VALUES(1,1,'Legacy service');`);
  migrate(db,file);
  assert.equal(db.prepare('SELECT total FROM taller_ventas WHERE id=1').get().total,50);
  assert.equal(db.prepare('SELECT producto_id FROM taller_venta_items WHERE id=1').get().producto_id,null);
  const backups=fs.readdirSync(path.join(folder,'backups'));assert.equal(backups.length,1);
  const backup=new Database(path.join(folder,'backups',backups[0]),{readonly:true});
  assert.equal(backup.pragma('quick_check',{simple:true}),'ok');
  assert.equal(backup.prepare('SELECT descripcion FROM taller_venta_items').get().descripcion,'Legacy service');
  assert.equal(backup.prepare('PRAGMA table_info(taller_venta_items)').all().some(c=>c.name==='producto_id'),false);backup.close();
  migrate(db,file);assert.equal(fs.readdirSync(path.join(folder,'backups')).filter(f => f.endsWith('.db')).length,1);
  // Esta sub-prueba ejercita específicamente el arranque en modo producción
  // con SQLite puro (DATABASE_PATH=':memory:'); si el proceso padre corre
  // bajo el arnés de Postgres (TEST_DATABASE_URL), hay que quitar
  // DATABASE_URL del entorno heredado o el hijo usaría ese adaptador en vez
  // de SQLite y la aserción síncrona de abajo (sin await) dejaría de aplicar.
  const envSinPostgres={...process.env};delete envSinPostgres.DATABASE_URL;delete envSinPostgres.DATABASE_ADMIN_URL;
  // ensureSeed() es async (toda la capa de datos lo es desde la Fase 2) — hay
  // que esperarla antes de leer, o las lecturas de abajo correrían antes de
  // que termine de sembrar.
  const result=spawnSync(process.execPath,['-e',"require('./src/seed').ensureSeed().then(() => { const db=require('./src/db'); if(db.prepare('SELECT COUNT(*) AS n FROM tenants').get().n !== 0) process.exit(1); if(db.prepare(\"SELECT COUNT(*) AS n FROM users WHERE role != 'owner'\").get().n !== 0) process.exit(2); }).catch((e) => { console.error(e); process.exit(3); });"], {cwd:path.resolve(__dirname,'..'),env:{...envSinPostgres,NODE_ENV:'production',DATABASE_PATH:':memory:',OWNER_EMAIL:'test@local.test',OWNER_SEED_PASSWORD:'Test-only-production-seed'}});
  assert.equal(result.status,0,result.stderr?.toString());
  console.log('8/8 checks OK');
} finally {db.close();fs.rmSync(folder,{recursive:true,force:true});}
