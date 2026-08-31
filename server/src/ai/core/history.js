const db = require('../../db');

const SENSITIVE_KEY = /password|contrasena|token|secret|jwt|api[_-]?key/i;

/**
 * Antes de guardar cualquier cosa en ai_messages/ai_actions, quita
 * recursivamente cualquier campo que huela a credencial. Ninguna tool
 * actual pide contraseñas/tokens, pero esto es la barrera para que un
 * futuro campo sensible no termine guardado en el historial de auditoría
 * por accidente.
 */
function sanitizeForAudit(value) {
  if (Array.isArray(value)) return value.map(sanitizeForAudit);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[oculto]' : sanitizeForAudit(v);
    }
    return out;
  }
  return value;
}

// ---- Conversaciones ----

function createConversation({ tenantId, userId, channel = 'web', externalUserId = null }) {
  if (!tenantId) throw new Error('createConversation requiere tenantId');
  const info = db
    .prepare('INSERT INTO ai_conversations (tenant_id, user_id, channel, external_user_id) VALUES (?, ?, ?, ?)')
    .run(tenantId, userId || null, channel, externalUserId);
  return getConversation(info.lastInsertRowid, tenantId);
}

/** SIEMPRE filtrado por tenant_id — una conversación de otro tenant nunca se devuelve, ni por error. */
function getConversation(conversationId, tenantId) {
  return db.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ?').get(conversationId, tenantId);
}

function listConversations(tenantId, { userId } = {}) {
  if (userId) {
    return db.prepare('SELECT * FROM ai_conversations WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC').all(tenantId, userId);
  }
  return db.prepare('SELECT * FROM ai_conversations WHERE tenant_id = ? ORDER BY id DESC').all(tenantId);
}

// ---- Mensajes ----

function recordMessage(conversationId, tenantId, role, content) {
  const conversation = getConversation(conversationId, tenantId);
  if (!conversation) throw new Error('Conversación no encontrada para este tenant');
  const safeContent = typeof content === 'string' ? content : JSON.stringify(sanitizeForAudit(content));
  const info = db
    .prepare('INSERT INTO ai_messages (conversation_id, tenant_id, role, content) VALUES (?, ?, ?, ?)')
    .run(conversationId, tenantId, role, safeContent);
  db.prepare('UPDATE ai_conversations SET updated_at = datetime(\'now\') WHERE id = ?').run(conversationId);
  return db.prepare('SELECT * FROM ai_messages WHERE id = ?').get(info.lastInsertRowid);
}

/** SIEMPRE filtrado por tenant_id, no solo por conversation_id. */
function listMessages(conversationId, tenantId) {
  return db.prepare('SELECT * FROM ai_messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY id ASC').all(conversationId, tenantId);
}

// ---- Acciones (propuestas / confirmadas / ejecutadas) ----

function findExistingAction(conversationId, tenantId, toolName, idempotencyKey) {
  if (!idempotencyKey) return null;
  return db
    .prepare('SELECT * FROM ai_actions WHERE conversation_id = ? AND tenant_id = ? AND tool_name = ? AND idempotency_key = ?')
    .get(conversationId, tenantId, toolName, idempotencyKey);
}

function createAction({ conversationId, tenantId, toolName, args, idempotencyKey = null, status = 'pending_confirmation' }) {
  const info = db
    .prepare(
      `INSERT INTO ai_actions (conversation_id, tenant_id, tool_name, arguments, idempotency_key, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(conversationId, tenantId, toolName, JSON.stringify(sanitizeForAudit(args || {})), idempotencyKey, status);
  return getAction(info.lastInsertRowid, tenantId);
}

/** SIEMPRE filtrado por tenant_id — clave para que no se pueda confirmar una acción ajena. */
function getAction(actionId, tenantId) {
  return db.prepare('SELECT * FROM ai_actions WHERE id = ? AND tenant_id = ?').get(actionId, tenantId);
}

function updateActionStatus(actionId, tenantId, status, result) {
  db.prepare("UPDATE ai_actions SET status = ?, result = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(
    status,
    result !== undefined ? JSON.stringify(sanitizeForAudit(result)) : null,
    actionId,
    tenantId
  );
  return getAction(actionId, tenantId);
}

module.exports = {
  sanitizeForAudit,
  createConversation,
  getConversation,
  listConversations,
  recordMessage,
  listMessages,
  findExistingAction,
  createAction,
  getAction,
  updateActionStatus,
};
