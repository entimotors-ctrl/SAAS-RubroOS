-- RubroOS — rubro Carwash. Ver convenciones en 20261027140000_core.sql.

CREATE TABLE carwash_servicios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  precio NUMERIC NOT NULL DEFAULT 0,
  duracion_min INTEGER NOT NULL DEFAULT 20
);

CREATE TABLE carwash_clientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT
);

CREATE TABLE carwash_vehiculos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  placa TEXT,
  tipo TEXT NOT NULL DEFAULT 'sedan'
);

CREATE TABLE carwash_membresias (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT NOT NULL,
  plan TEXT NOT NULL,
  precio_mensual NUMERIC NOT NULL DEFAULT 0,
  fecha_inicio DATE NOT NULL DEFAULT current_date,
  fecha_renovacion DATE,
  estado TEXT NOT NULL DEFAULT 'activa'
);

CREATE TABLE carwash_turnos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  vehiculo_id BIGINT,
  servicio_id BIGINT,
  estado TEXT NOT NULL DEFAULT 'en_cola',
  usa_membresia SMALLINT NOT NULL DEFAULT 0,
  precio NUMERIC NOT NULL DEFAULT 0,
  entregado_at TIMESTAMPTZ,
  metodo_pago TEXT,
  membresia_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
