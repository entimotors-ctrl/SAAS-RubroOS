const history = require('../ai/core/history');
const chatService = require('../ai/core/chatService');
const { getTool } = require('../ai/core/toolRegistry');

const CONFIRM_TOKENS = new Set(['si', 'sí', 's', '1', 'confirmar', 'confirmo', 'dale', 'ok', 'okay']);
const CANCEL_TOKENS = new Set(['no', 'n', '2', 'cancelar', 'cancela']);

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[¡!¿?.,]/g, '');
}

function describeAction(action) {
  return getTool(action.tool_name)?.description || 'una acción pendiente';
}

/**
 * Intercepta un mensaje entrante ANTES de mandarlo al LLM, solo cuando hay
 * al menos una acción esperando confirmación en la conversación y el texto
 * es exactamente un token corto de confirmar/cancelar (nunca por
 * coincidencia parcial dentro de una frase larga — así "no sé cuántos
 * productos tengo" no se confunde con un "no"). Nunca decide nada por sí
 * mismo: solo delega en chatService.confirmAndReply/cancelAndReply, que a
 * su vez usan el orchestrator ya existente (mismo mecanismo del chat web).
 *
 * Devuelve null si no aplica (el caller sigue el flujo normal de
 * chatService.handleChatMessage), o la respuesta ya lista para el usuario.
 */
async function tryHandle({ context, conversation, text }) {
  const norm = normalize(text);
  const pending = history.listPendingActions(conversation.id, context.tenantId);
  if (pending.length === 0) return null;

  // "cancela 2" / "cancelar 2" / "no 2" -> cancela esa posición, sin ambigüedad posible.
  const cancelByIndex = norm.match(/^(cancelar|cancela|no)\s+(\d+)$/);
  if (cancelByIndex) {
    const chosen = pending[Number(cancelByIndex[2]) - 1];
    if (!chosen) return null;
    history.recordMessage(conversation.id, context.tenantId, 'user', text);
    return chatService.cancelAndReply({ context, actionId: chosen.id });
  }

  // Un número suelto solo tiene sentido como "elige la #N" cuando hay más de una pendiente.
  const bareIndex = norm.match(/^(\d+)$/);
  if (bareIndex && pending.length > 1) {
    const chosen = pending[Number(bareIndex[1]) - 1];
    if (!chosen) return null;
    history.recordMessage(conversation.id, context.tenantId, 'user', text);
    return chatService.confirmAndReply({ context, actionId: chosen.id });
  }

  const intent = CONFIRM_TOKENS.has(norm) ? 'confirm' : CANCEL_TOKENS.has(norm) ? 'cancel' : null;
  if (!intent) return null;

  history.recordMessage(conversation.id, context.tenantId, 'user', text);

  if (pending.length === 1) {
    return intent === 'confirm'
      ? chatService.confirmAndReply({ context, actionId: pending[0].id })
      : chatService.cancelAndReply({ context, actionId: pending[0].id });
  }

  // 2+ pendientes y un "sí"/"no" sin número: no se adivina, se pregunta cuál.
  const listado = pending.map((a, i) => `${i + 1}. ${describeAction(a)}`).join('\n');
  const message = `Tienes más de una acción esperando confirmación:\n${listado}\n\nResponde con el número de la que quieres confirmar, o escribe "cancelar" seguido del número para cancelar una en específico (ej: cancelar 2).`;
  history.recordMessage(conversation.id, context.tenantId, 'assistant', message);
  return { type: 'message', conversationId: conversation.id, message };
}

module.exports = { tryHandle };
