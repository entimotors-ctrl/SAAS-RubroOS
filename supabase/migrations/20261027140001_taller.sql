-- RubroOS — rubro Taller (motos y vehículos). Ver convenciones en
-- 20261027140000_core.sql.

CREATE TABLE taller_clientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE taller_vehiculos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  placa TEXT,
  marca TEXT,
  modelo TEXT,
  anio TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE taller_citas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  vehiculo_id BIGINT,
  fecha DATE NOT NULL,
  hora TEXT NOT NULL,
  servicio TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE taller_inventario (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  sku TEXT,
  precio NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE taller_ventas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  tipo TEXT NOT NULL DEFAULT 'contado',
  total NUMERIC NOT NULL DEFAULT 0,
  pagado NUMERIC NOT NULL DEFAULT 0,
  saldo NUMERIC NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'abierta',
  request_key TEXT,
  request_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_taller_venta_request ON taller_ventas (tenant_id, request_key) WHERE request_key IS NOT NULL;

CREATE TABLE taller_venta_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venta_id BIGINT NOT NULL,
  producto_id BIGINT REFERENCES taller_inventario (id),
  descripcion TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE taller_abonos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  venta_id BIGINT NOT NULL,
  monto NUMERIC NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE taller_stock_movimientos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  producto_id BIGINT NOT NULL REFERENCES taller_inventario (id),
  venta_id BIGINT REFERENCES taller_ventas (id),
  cantidad NUMERIC NOT NULL,
  stock_resultante NUMERIC NOT NULL,
  motivo TEXT NOT NULL,
  user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taller_stock_tenant ON taller_stock_movimientos (tenant_id, producto_id, id);

CREATE TABLE taller_ordenes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT NOT NULL,
  vehiculo_id BIGINT NOT NULL,
  kilometraje NUMERIC NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL,
  diagnostico TEXT NOT NULL DEFAULT '',
  responsable TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'recibida',
  presupuesto TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  venta_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taller_ordenes_tenant ON taller_ordenes (tenant_id, estado);
CREATE UNIQUE INDEX idx_taller_orden_venta ON taller_ordenes (venta_id) WHERE venta_id IS NOT NULL;

CREATE TABLE taller_orden_eventos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  orden_id BIGINT NOT NULL REFERENCES taller_ordenes (id),
  user_id BIGINT NOT NULL,
  evento TEXT NOT NULL,
  detalle TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_taller_orden_eventos ON taller_orden_eventos (tenant_id, orden_id, id);
