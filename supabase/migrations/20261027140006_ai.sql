-- RubroOS — AI Core. Ver convenciones en 20261027140000_core.sql.
--
-- tenant_id se guarda también en ai_messages/ai_actions (no solo en
-- ai_conversations) a propósito: así cualquier consulta puede filtrar por
-- tenant_id directamente, sin depender de un JOIN correcto contra
-- ai_conversations (la misma razón que en el esquema SQLite original).

CREATE TABLE ai_conversations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT,
  channel TEXT NOT NULL DEFAULT 'web',
  external_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_conversations_tenant ON ai_conversations (tenant_id);

CREATE TABLE ai_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ai_conversations (id),
  tenant_id BIGINT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_messages_conversation ON ai_messages (conversation_id);

CREATE TABLE ai_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ai_conversations (id),
  tenant_id BIGINT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending_confirmation',
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_actions_conversation ON ai_actions (conversation_id);
CREATE UNIQUE INDEX idx_ai_actions_idempotency
  ON ai_actions (conversation_id, tool_name, idempotency_key) WHERE idempotency_key IS NOT NULL;
