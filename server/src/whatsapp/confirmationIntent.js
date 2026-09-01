const history = require('../ai/core/history');
const chatService = require('../ai/core/chatService');
const { getTool } = require('../ai/core/toolRegistry');

const CONFIRM_TOKENS = new Set(['si', 'sí', 's', '1', 'confirmar', 'confirmo', 'dale', 'ok', 'okay']);
const CANCEL_TOKENS = new Set(['no', 'n', '2', 'cancelar', 'cancela']);
// Cancelación masiva: reconocida explícitamente para responder con la
// verdad ("no está soportado") en vez de dejar que caiga al LLM, que podría
// afirmar que canceló todo sin que eso ocurriera (hallazgo real de PROMPT 07).
const BULK_CANCEL_PHRASES = new Set(['cancelar todo', 'cancela todo', 'cancelar todas', 'cancela todas']);

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[¡!¿?.,]/g, '');
}

function describeAction(action) {
  return getTool(action.tool_name)?.description || 'una acción pendiente';
}

function listadoPendientes(pending) {
  return pending.map((a, i) => `${i + 1}. ${describeAction(a)}`).join('\n');
}

/**
 * Respuesta fija — NUNCA generada por el modelo — para cualquier caso donde
 * no se puede resolver una confirmación/cancelación de forma inequívoca. La
 * autoridad sobre si algo se canceló/confirmó es SIEMPRE el resultado real
 * de cancelAndReply()/confirmAndReply() (que a su vez leen el estado real de
 * ai_actions); el modelo jamás puede afirmarlo por su cuenta, porque estos
 * casos nunca llegan a chatService.handleChatMessage().
 */
function noResuelto(conversation, context, pending, motivo) {
  const message = `${motivo} Estas son las acciones pendientes:\n${listadoPendientes(pending)}\n\nResponde con el número de la que quieres confirmar, o escribe "cancelar" seguido del número para cancelar una en específico (ej: cancelar 2).`;
  history.recordMessage(conversation.id, context.tenantId, 'assistant', message);
  return { type: 'message', conversationId: conversation.id, message };
}

/**
 * Intercepta un mensaje entrante ANTES de mandarlo al LLM, solo cuando hay
 * al menos una acción esperando confirmación en la conversación. La capa
 * determinista (tokens exactos, "cancelar N", número suelto, frases de
 * cancelación masiva) tiene siempre prioridad y nunca interpreta lenguaje
 * natural arbitrario — así "no sé cuántos productos tengo" no se confunde
 * con un "no". Nunca decide nada por sí mismo: solo delega en
 * chatService.confirmAndReply/cancelAndReply (mismo mecanismo del chat web),
 * o en noResuelto() cuando la selección no se puede resolver — en NINGÚN
 * caso donde el texto matchea un patrón de confirmación/cancelación se deja
 * que el LLM sea quien responda, para que nunca pueda afirmar una
 * cancelación/confirmación que no ocurrió de verdad.
 *
 * Devuelve null solo cuando el mensaje no matchea ningún patrón de
 * confirmación/cancelación — el caller sigue el flujo normal de
 * chatService.handleChatMessage() para esos casos (preguntas u otras
 * solicitudes ajenas a la acción pendiente).
 */
async function tryHandle({ context, conversation, text }) {
  const norm = normalize(text);
  const pending = history.listPendingActions(conversation.id, context.tenantId);
  if (pending.length === 0) return null;

  // "cancela 2" / "cancelar 2" / "no 2" -> cancela esa posición SI existe
  // en la lista actual de pendientes; si no existe (posición vencida,
  // fuera de rango, o ya resuelta), nunca cae al LLM.
  const cancelByIndex = norm.match(/^(cancelar|cancela|no)\s+(\d+)$/);
  if (cancelByIndex) {
    const idx = Number(cancelByIndex[2]);
    const chosen = pending[idx - 1];
    history.recordMessage(conversation.id, context.tenantId, 'user', text);
    if (!chosen) return noResuelto(conversation, context, pending, `No hay ninguna acción pendiente con el número ${idx}.`);
    return chatService.cancelAndReply({ context, actionId: chosen.id });
  }

  // Cancelación masiva: no está soportada — nunca se adivina ni se deja que el modelo la afirme.
  if (BULK_CANCEL_PHRASES.has(norm)) {
    history.recordMessage(conversation.id, context.tenantId, 'user', text);
    return noResuelto(conversation, context, pending, 'Por ahora no puedo cancelar varias acciones a la vez, tienes que indicar cuál.');
  }

  // Un número suelto solo tiene sentido como "elige la #N" cuando hay más de una pendiente.
  const bareIndex = norm.match(/^(\d+)$/);
  if (bareIndex && pending.length > 1) {
    const idx = Number(bareIndex[1]);
    const chosen = pending[idx - 1];
    history.recordMessage(conversation.id, context.tenantId, 'user', text);
    if (!chosen) return noResuelto(conversation, context, pending, `No hay ninguna acción pendiente con el número ${idx}.`);
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
  return noResuelto(conversation, context, pending, 'Tienes más de una acción esperando confirmación.');
}

module.exports = { tryHandle };
