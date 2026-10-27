-- RubroOS — canal WhatsApp. Ver convenciones en 20261027140000_core.sql.
--
-- Resuelve phone_number_id + from -> tenant_id + user_id. Nunca se acepta un
-- tenant_id que venga del mensaje o del payload de WhatsApp: la identidad
-- SOLO sale de esta tabla, vinculada explícitamente desde RubroOS (con
-- verificación por código) antes de que exista ningún flujo de negocio real.

CREATE TABLE whatsapp_identities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants (id),
  user_id BIGINT NOT NULL REFERENCES users (id),
  phone_number TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  verification_code TEXT,
  verification_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_identities_tenant ON whatsapp_identities (tenant_id);
CREATE INDEX idx_whatsapp_identities_lookup ON whatsapp_identities (phone_number_id, phone_number, status);
-- Un mismo número real nunca puede estar activo en dos tenants a la vez —
-- esto lo garantiza la base de datos, no solo el código de la aplicación.
CREATE UNIQUE INDEX idx_whatsapp_identities_phone_active
  ON whatsapp_identities (phone_number) WHERE status = 'active';

-- Ledger de idempotencia a nivel de mensaje: Meta puede reenviar el mismo
-- wamid (reintentos de entrega). Un INSERT que falla por message_id
-- duplicado es la señal atómica de "ya se vio este mensaje, no procesar de
-- nuevo" — se usa ANTES de tocar el AI Core, como primera capa de defensa
-- (la segunda capa es el idempotencyKey que ya soporta ai_actions).
CREATE TABLE whatsapp_inbound_events (
  message_id TEXT PRIMARY KEY,
  tenant_id BIGINT,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
