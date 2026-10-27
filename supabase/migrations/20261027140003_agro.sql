-- RubroOS — rubro Agropecuario. Ver convenciones en 20261027140000_core.sql.

CREATE TABLE agro_productos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  categoria TEXT,
  precio NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  unidad TEXT DEFAULT 'unidad'
);

CREATE TABLE agro_clientes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  nombre TEXT NOT NULL,
  finca TEXT,
  telefono TEXT
);

CREATE TABLE agro_pedidos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_id BIGINT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  total NUMERIC NOT NULL DEFAULT 0,
  pagado NUMERIC NOT NULL DEFAULT 0,
  metodo_pago TEXT,
  cobrado_at TIMESTAMPTZ,
  reembolsado NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agro_pedido_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id BIGINT NOT NULL,
  producto_id BIGINT,
  cantidad NUMERIC NOT NULL DEFAULT 1,
  precio_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE agro_cotizaciones_dron (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_nombre TEXT,
  hectareas NUMERIC NOT NULL,
  tipo_servicio TEXT NOT NULL,
  precio_estimado NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agro_cotizaciones_cerca (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  cliente_nombre TEXT,
  metros NUMERIC NOT NULL,
  hilos INTEGER NOT NULL DEFAULT 4,
  precio_estimado NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
