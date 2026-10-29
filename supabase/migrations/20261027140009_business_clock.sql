-- Equivalentes Postgres de server/src/services/businessClock.js
-- (db.function('business_today', ...) / db.function('business_day', ...)),
-- que no existen en better-sqlite3 → Postgres: ver docs/ESTADO-FASE-2-ADAPTADOR-PG.md.
--
-- Mismo origen de datos que el cache en memoria del lado JS (tenant_settings,
-- sección 'operations'), así que no hay dos "verdades" sobre la zona horaria
-- de un tenant: ambos lados leen la misma fila.

CREATE OR REPLACE FUNCTION tenant_timezone(p_tenant_id BIGINT) RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT settings::jsonb ->> 'timezone' FROM tenant_settings
     WHERE tenant_id = p_tenant_id AND section = 'operations'),
    'America/Tegucigalpa'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION business_today(p_tenant_id BIGINT) RETURNS DATE AS $$
  SELECT (now() AT TIME ZONE tenant_timezone(p_tenant_id))::date;
$$ LANGUAGE sql STABLE;

-- Columnas timestamptz (created_at, cobrada_at, entregado_at, ...): convertir
-- al día calendario local del tenant, igual que business_day() en JS.
CREATE OR REPLACE FUNCTION business_day(p_value TIMESTAMPTZ, p_tenant_id BIGINT) RETURNS DATE AS $$
  SELECT CASE WHEN p_value IS NULL THEN NULL
    ELSE (p_value AT TIME ZONE tenant_timezone(p_tenant_id))::date END;
$$ LANGUAGE sql STABLE;

-- Columnas date (fecha, ...): ya son un día de calendario, sin componente de
-- hora que convertir — igual que la rama `value.length===10` del lado JS.
CREATE OR REPLACE FUNCTION business_day(p_value DATE, p_tenant_id BIGINT) RETURNS DATE AS $$
  SELECT p_value;
$$ LANGUAGE sql STABLE;

-- Equivalente de SQLite date(x, '+N month'/'-N month') con el mismo
-- "clamping" de SQLite (si el día de origen no existe en el mes destino, cae
-- al último día de ese mes) — Postgres por defecto desborda al mes siguiente
-- en vez de recortar. Usado solo para el modificador de meses: el de días
-- (date(x,'+N day')) es aritmética simple (fecha + entero) y no lo necesita.
CREATE OR REPLACE FUNCTION sqlite_add_months(p_date DATE, p_months INTEGER) RETURNS DATE AS $$
  SELECT LEAST(
    p_date + (p_months || ' month')::interval,
    date_trunc('month', p_date + ((p_months + 1) || ' month')::interval) - interval '1 day'
  )::date;
$$ LANGUAGE sql IMMUTABLE;
