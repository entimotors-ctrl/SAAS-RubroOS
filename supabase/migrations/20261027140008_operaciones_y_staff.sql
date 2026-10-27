-- RubroOS — operación transversal y portal de colaboradores.
-- Ver convenciones en 20261027140000_core.sql.

CREATE TABLE operation_requests (
  tenant_id BIGINT NOT NULL,
  scope TEXT NOT NULL,
  request_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  result_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, scope, request_key)
);

CREATE TABLE tenant_settings (
  tenant_id BIGINT NOT NULL,
  section TEXT NOT NULL,
  settings TEXT NOT NULL,
  PRIMARY KEY (tenant_id, section)
);

CREATE TABLE business_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT,
  event TEXT NOT NULL,
  entity_id BIGINT,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_business_events ON business_events (tenant_id, id);

CREATE TABLE owner_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  tenant_id BIGINT,
  event TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- expires_at/used_at se mantienen como epoch en milisegundos (BIGINT), igual
-- que en SQLite: el código hoy los compara directamente contra Date.now().
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_by BIGINT NOT NULL
);

CREATE TABLE daily_closures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  fecha DATE NOT NULL,
  user_id BIGINT NOT NULL,
  snapshot TEXT NOT NULL,
  notas TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fecha)
);

CREATE TABLE staff_profiles (
  user_id BIGINT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  barbero_id BIGINT
);
CREATE UNIQUE INDEX staff_barber ON staff_profiles (tenant_id, barbero_id) WHERE barbero_id IS NOT NULL;

CREATE TABLE staff_invitations (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  created_by BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  assigned_to BIGINT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pendiente',
  version INTEGER NOT NULL DEFAULT 1,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_tasks_assignment ON staff_tasks (tenant_id, assigned_to, status, due_date);

CREATE TABLE staff_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX staff_events_tenant ON staff_events (tenant_id, id);
