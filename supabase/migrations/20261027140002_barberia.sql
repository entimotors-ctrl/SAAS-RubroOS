-- RubroOS — rubro Barbería. Ver convenciones en 20261027140000_core.sql.

CREATE TABLE barberia_barberos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  especialidad TEXT,
  activo SMALLINT NOT NULL DEFAULT 1,
  comision_porcentaje NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE barberia_servicios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  precio NUMERIC NOT NULL DEFAULT 0,
  duracion_min INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE barberia_clientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE barberia_citas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  barbero_id BIGINT,
  servicio_id BIGINT,
  fecha DATE NOT NULL,
  hora TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  duracion_min INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  llamada_at TIMESTAMPTZ,
  iniciada_at TIMESTAMPTZ,
  finalizada_at TIMESTAMPTZ
);
CREATE INDEX idx_appointments ON barberia_citas (tenant_id, barbero_id, fecha);

CREATE TABLE barberia_cuentas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  barbero_id BIGINT,
  cita_id BIGINT,
  estado TEXT NOT NULL DEFAULT 'abierta',
  total NUMERIC NOT NULL DEFAULT 0,
  comision_total NUMERIC NOT NULL DEFAULT 0,
  metodo_pago TEXT,
  cobrada_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX barberia_cuenta_por_cita ON barberia_cuentas (tenant_id, cita_id) WHERE cita_id IS NOT NULL;

CREATE TABLE barberia_cuenta_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuenta_id BIGINT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'servicio',
  descripcion TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE barberia_horarios (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  barbero_id BIGINT NOT NULL,
  dia_semana INTEGER NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  activo SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, barbero_id, dia_semana)
);
CREATE INDEX barberia_horarios_lookup ON barberia_horarios (tenant_id, barbero_id, dia_semana, activo);

CREATE TABLE barberia_bloqueos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  barbero_id BIGINT NOT NULL,
  fecha DATE NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  motivo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX barberia_bloqueos_lookup ON barberia_bloqueos (tenant_id, barbero_id, fecha);

-- Equivalente al trigger SQLite "barberia_barbero_horario_inicial": al dar
-- de alta un barbero, le crea el horario semanal por defecto (L-S 09:00-18:00,
-- domingo inactivo). ON CONFLICT DO NOTHING hace de "INSERT OR IGNORE".
CREATE FUNCTION barberia_barbero_horario_inicial() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO barberia_horarios (tenant_id, barbero_id, dia_semana, hora_inicio, hora_fin, activo)
  VALUES
    (NEW.tenant_id, NEW.id, 1, '09:00', '18:00', 1),
    (NEW.tenant_id, NEW.id, 2, '09:00', '18:00', 1),
    (NEW.tenant_id, NEW.id, 3, '09:00', '18:00', 1),
    (NEW.tenant_id, NEW.id, 4, '09:00', '18:00', 1),
    (NEW.tenant_id, NEW.id, 5, '09:00', '18:00', 1),
    (NEW.tenant_id, NEW.id, 6, '09:00', '18:00', 1),
    (NEW.tenant_id, NEW.id, 0, NULL, NULL, 0)
  ON CONFLICT (tenant_id, barbero_id, dia_semana) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER barberia_barbero_horario_inicial
AFTER INSERT ON barberia_barberos
FOR EACH ROW EXECUTE FUNCTION barberia_barbero_horario_inicial();
