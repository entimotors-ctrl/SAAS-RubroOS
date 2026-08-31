const { getTool, authorize, runTool } = require('./toolRegistry');
const history = require('./history');

const PENDING_ACTION_TTL_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Orquestador de IA — la pieza que decide CUÁNDO ejecutar una tool
 * (inmediatamente, o solo tras confirmación explícita), sin conectar
 * todavía ningún proveedor de IA. server/src/ai/core/provider.js define la
 * interfaz que un futuro proveedor implementará; hasta entonces, quien
 * decide qué tool llamar con qué argumentos es el caller (una prueba, o más
 * adelante el propio provider), no este módulo.
 *
 * Flujo:
 *   mensaje → AiContext → proposeToolCall()
 *     ├─ tool sin requiresConfirmation → se ejecuta ya, se registra en ai_actions.
 *     └─ tool con requiresConfirmation → se valida (sin ejecutar) y se deja
 *        "pending_confirmation" en ai_actions. Hace falta confirmToolCall()
 *        con el MISMO actionId — nunca se puede confirmar una acción
 *        distinta a la que se propuso, porque confirmToolCall() vuelve a
 *        ejecutar exactamente los argumentos que quedaron guardados, no los
 *        que lleguen en la llamada de confirmación.
 */

function actionAge(action) {
  return Date.now() - new Date(action.created_at.replace(' ', 'T') + 'Z').getTime();
}

function proposeToolCall({ conversationId, context, toolName, args, idempotencyKey = null }) {
  const tool = getTool(toolName);
  if (!tool) return { success: false, code: 'TOOL_NOT_FOUND', message: `Herramienta desconocida: ${toolName}` };

  const conversation = history.getConversation(conversationId, context.tenantId);
  if (!conversation) return { success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversación no encontrada para este tenant' };

  // Idempotencia: mismo tool + misma idempotencyKey en la misma
  // conversación no se procesa dos veces (reintentos, webhook duplicado,
  // doble tap del usuario).
  if (idempotencyKey) {
    const existing = history.findExistingAction(conversationId, context.tenantId, toolName, idempotencyKey);
    if (existing?.status === 'executed') {
      return { success: true, deduplicated: true, actionId: existing.id, data: existing.result ? JSON.parse(existing.result) : null };
    }
    if (existing?.status === 'pending_confirmation') {
      return { success: true, needsConfirmation: true, actionId: existing.id, message: `${tool.description}. ¿Confirmas esta acción?` };
    }
  }

  if (!tool.requiresConfirmation) {
    const result = runTool(toolName, context, args);
    const action = history.createAction({
      conversationId,
      tenantId: context.tenantId,
      toolName,
      args,
      idempotencyKey,
      status: result.success ? 'executed' : 'failed',
    });
    history.updateActionStatus(action.id, context.tenantId, action.status, result);
    return { ...result, actionId: action.id };
  }

  // Se valida (rubro + permiso + forma de los argumentos) ANTES de pedir
  // confirmación, para no confirmar algo que de todas formas iba a fallar.
  const auth = authorize(toolName, context, args);
  if (!auth.ok) return auth.result;

  const action = history.createAction({
    conversationId,
    tenantId: context.tenantId,
    toolName,
    args: auth.args,
    idempotencyKey,
    status: 'pending_confirmation',
  });
  return { success: true, needsConfirmation: true, actionId: action.id, message: `${tool.description}. ¿Confirmas esta acción?` };
}

/**
 * Ejecuta una acción previamente propuesta. SIEMPRE usa los argumentos que
 * quedaron guardados en ai_actions al proponerla — el parámetro `args` de
 * quien llama a proposeToolCall() no puede reaparecer aquí con otro valor.
 */
function confirmToolCall({ actionId, context }) {
  const action = history.getAction(actionId, context.tenantId);
  if (!action) return { success: false, code: 'ACTION_NOT_FOUND', message: 'Acción no encontrada para este tenant' };
  if (action.status !== 'pending_confirmation') {
    return { success: false, code: 'ACTION_NOT_PENDING', message: `Esta acción ya está en estado "${action.status}"` };
  }
  if (actionAge(action) > PENDING_ACTION_TTL_MS) {
    history.updateActionStatus(action.id, context.tenantId, 'expired');
    return { success: false, code: 'ACTION_EXPIRED', message: 'La confirmación expiró, vuelve a pedir la acción' };
  }

  const storedArgs = JSON.parse(action.arguments || '{}');
  const result = runTool(action.tool_name, context, storedArgs);
  history.updateActionStatus(action.id, context.tenantId, result.success ? 'executed' : 'failed', result);
  return { ...result, actionId: action.id };
}

function rejectToolCall({ actionId, context }) {
  const action = history.getAction(actionId, context.tenantId);
  if (!action) return { success: false, code: 'ACTION_NOT_FOUND', message: 'Acción no encontrada para este tenant' };
  if (action.status !== 'pending_confirmation') {
    return { success: false, code: 'ACTION_NOT_PENDING', message: `Esta acción ya está en estado "${action.status}"` };
  }
  history.updateActionStatus(action.id, context.tenantId, 'rejected');
  return { success: true, actionId: action.id };
}

module.exports = { proposeToolCall, confirmToolCall, rejectToolCall };
