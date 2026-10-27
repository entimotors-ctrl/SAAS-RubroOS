-- RubroOS — esquema PostgreSQL, Fase 1 de la migración (ver docs/MIGRACION-SUPABASE-POSTGRES.md).
--
-- Estas migraciones crean el estado FINAL del esquema (equivalente a aplicar
-- hoy mismo, sobre una base nueva, server/src/db.js + las 7 migraciones de
-- server/src/db/migrations.js) — no son una repetición histórica de cada
-- ALTER TABLE que SQLite fue aplicando con el tiempo.
--
-- Convenciones de tipos (SQLite -> PostgreSQL), para que Fase 2 (adaptador)
-- sepa qué esperar de cada columna:
--   INTEGER PRIMARY KEY AUTOINCREMENT -> BIGINT GENERATED ALWAYS AS IDENTITY
--   INTEGER usado como FK/tenant_id   -> BIGINT (para calzar con el identity)
--   REAL (dinero o cantidades)        -> NUMERIC, sin precisión fija (igual
--                                        de flexible que SQLite, evita el
--                                        error de redondeo binario de REAL)
--   TEXT con datetime('now') (*_at)   -> TIMESTAMPTZ DEFAULT now()
--   TEXT con solo fecha calendario     -> DATE
--   TEXT con solo hora ('HH:MM')       -> TEXT (se mantiene literal: el
--                                        código de negocio hoy compara y
--                                        concatena estas horas como string;
--                                        pasar a TIME es decisión de Fase 2)
--   INTEGER 0/1 como bandera           -> SMALLINT (se mantiene literal,
--                                        no se introduce BOOLEAN todavía
--                                        para no adelantar cambios de Fase 2)
--   TEXT con JSON serializado a mano   -> TEXT (podría pasar a JSONB en una
--                                        migración futura; no es necesario
--                                        para que el esquema exista)
--
-- No se agregan FOREIGN KEY, UNIQUE ni CHECK que el esquema SQLite actual no
-- tenga: esta fase traduce la estructura tal cual está, no la endurece.
--
-- No se repiten aquí los backfills de datos (p. ej. completar horarios de
-- barberos ya existentes) porque esta es una base nueva sin filas: esos
-- backfills solo aplican a datos reales y son trabajo de la Fase 4
-- (importación única desde SQLite), no de la Fase 1.

CREATE TABLE tenants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_type TEXT NOT NULL,
  nombre_empresa TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  status TEXT NOT NULL DEFAULT 'trial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id),
  business_type TEXT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant_admin',
  session_version INTEGER NOT NULL DEFAULT 0,
  access_status TEXT NOT NULL DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, business_type)
);
