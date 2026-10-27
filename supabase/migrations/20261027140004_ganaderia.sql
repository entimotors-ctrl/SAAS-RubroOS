-- RubroOS — rubro Ganadería y Lechería. Ver convenciones en 20261027140000_core.sql.

CREATE TABLE ganaderia_animales (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  arete TEXT NOT NULL,
  nombre TEXT,
  raza TEXT,
  sexo TEXT NOT NULL DEFAULT 'hembra',
  fecha_nacimiento DATE,
  peso_kg NUMERIC,
  estado TEXT NOT NULL DEFAULT 'activo',
  madre_arete TEXT,
  padre_arete TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, arete)
);

CREATE TABLE ganaderia_produccion_leche (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  animal_id BIGINT NOT NULL,
  fecha DATE NOT NULL,
  turno TEXT NOT NULL DEFAULT 'AM',
  litros NUMERIC NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milk_record ON ganaderia_produccion_leche (tenant_id, animal_id, fecha, turno);

CREATE TABLE ganaderia_sanidad (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  animal_id BIGINT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'vacuna',
  nombre TEXT NOT NULL,
  fecha DATE NOT NULL,
  proxima_fecha DATE,
  notas TEXT
);

CREATE TABLE ganaderia_reproduccion (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  animal_id BIGINT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'monta',
  fecha DATE NOT NULL,
  fecha_probable_parto DATE,
  notas TEXT
);
