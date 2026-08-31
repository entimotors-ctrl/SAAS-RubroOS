const db = require('../../db');
const history = require('./history');
const { listTools } = require('./toolRegistry');
const { proposeToolCall, confirmToolCall, rejectToolCall } = require('./orchestrator');
const { buildFullPrompt } = require('../prompts');
const { createProvider } = require('../providers');

const MAX_TOOL_ITERATIONS = 5; // límite de seguridad contra loops infinitos (fase 15)
const MAX_HISTORY_MESSAGES = 20; // ventana simple de contexto (fase 19: acotar tokens)
const MAX_ARRAY_ITEMS_TO_MODEL = 30; // no mandar listas completas de miles de filas al modelo

/**
 * Implementa el flujo completo del chat (ver server/src/ai/README.md):
 *   AiContext → historial → system prompt → AIProvider → tool_call?
 *     → toolRegistry.authorize() (dentro de proposeToolCall) → confirmation? → service → resultado
 *     → AIProvider (para redactar la respuesta final) → respuesta
 *
 * Nunca decide el tenant ni los permisos — eso ya viene resuelto en
 * `context` (ver core/context.js). Nunca ejecuta una tool directamente:
 * todo pasa por orchestrator.js, que a su vez pasa por toolRegistry.js.
 */

function getAvailableTools(context) {
  return listTools(context.businessType).filter((t) => context.permissions?.includes(t.permission));
}

function getPromptNames(context) {
  const tenant = db.prepare('SELECT nombre_empresa FROM tenants WHERE id = ?').get(context.tenantId);
  const user = context.userId ? db.prepare('SELECT nombre FROM users WHERE id = ?').get(context.userId) : null;
  return { tenantName: tenant?.nombre_empresa, userName: user?.nombre };
}

function systemPromptFor(context) {
  const { tenantName, userName } = getPromptNames(context);
  return buildFullPrompt({ businessType: context.businessType, tenantName, userName, role: context.role });
}

function resolveConversation(context, conversationId) {
  if (conversationId) {
    const existing = history.getConversation(conversationId, context.tenantId);
    if (existing) return existing;
    // El id no existe o pertenece a otro tenant: no se filtra información,
    // simplemente se abre una conversación nueva.
  }
  return history.createConversation({ tenantId: context.tenantId, userId: context.userId, channel: context.channel });
}

function buildWorkingMessages(context, conversation) {
  const prior = history.listMessages(conversation.id, context.tenantId).slice(-MAX_HISTORY_MESSAGES);
  return prior.map((m) => ({ role: m.role, content: m.content }));
}

/** Recorta lo que se le manda al modelo sobre un resultado de tool — nunca errores crudos, nunca listas gigantes. */
function toolResultForModel(toolResult) {
  if (!toolResult.success) return { success: false, code: toolResult.code, message: toolResult.message };
  let data = toolResult.data;
  if (Array.isArray(data) && data.length > MAX_ARRAY_ITEMS_TO_MODEL) {
    data = { total: data.length, primeros: data.slice(0, MAX_ARRAY_ITEMS_TO_MODEL), nota: 'lista recortada, hay más resultados de los mostrados' };
  }
  return { success: true, data };
}

function toProviderToolList(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

async function handleChatMessage({ context, conversationId, userMessage, provider }) {
  const activeProvider = provider || createProvider();
  const conversation = resolveConversation(context, conversationId);
  history.recordMessage(conversation.id, context.tenantId, 'user', userMessage);

  const tools = getAvailableTools(context);
  const systemPrompt = systemPromptFor(context);
  const workingMessages = buildWorkingMessages(context, conversation); // ya incluye el mensaje recién grabado

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    let response;
    try {
      response = await activeProvider.chat({ systemPrompt, messages: workingMessages, tools: toProviderToolList(tools) });
    } catch (err) {
      console.error('[ai] error del proveedor:', err?.message || err);
      const fallback = 'No fue posible conectar con el asistente en este momento. Intenta de nuevo en unos minutos.';
      history.recordMessage(conversation.id, context.tenantId, 'assistant', fallback);
      return { type: 'message', conversationId: conversation.id, message: fallback };
    }

    if (response.type === 'message') {
      const text = response.content || 'No tengo una respuesta para eso.';
      history.recordMessage(conversation.id, context.tenantId, 'assistant', text);
      return { type: 'message', conversationId: conversation.id, message: text };
    }

    // tool_call
    const toolResult = proposeToolCall({ conversationId: conversation.id, context, toolName: response.toolName, args: response.args });

    if (toolResult.needsConfirmation) {
      history.recordMessage(conversation.id, context.tenantId, 'assistant', toolResult.message);
      return { type: 'confirmation_required', conversationId: conversation.id, actionId: toolResult.actionId, message: toolResult.message };
    }

    workingMessages.push({ role: 'assistant', content: '', toolCalls: [{ id: response.id, name: response.toolName, args: response.args }] });
    workingMessages.push({ role: 'tool', name: response.toolName, toolCallId: response.id, content: JSON.stringify(toolResultForModel(toolResult)) });
  }

  const fallback = 'No pude completar tu solicitud — intenta reformularla o hazla más específica.';
  history.recordMessage(conversation.id, context.tenantId, 'assistant', fallback);
  return { type: 'message', conversationId: conversation.id, message: fallback };
}

async function confirmAndReply({ context, actionId, provider }) {
  const activeProvider = provider || createProvider();
  const action = history.getAction(actionId, context.tenantId);
  if (!action) return { type: 'error', code: 'ACTION_NOT_FOUND', message: 'No encontré esa acción para confirmar.' };

  const conversation = history.getConversation(action.conversation_id, context.tenantId);
  const result = confirmToolCall({ actionId, context });

  if (!result.success) {
    const text = `No pude completar la acción: ${result.message}`;
    if (conversation) history.recordMessage(conversation.id, context.tenantId, 'assistant', text);
    return { type: 'message', conversationId: conversation?.id, message: text };
  }

  const tools = getAvailableTools(context);
  const systemPrompt = systemPromptFor(context);
  const workingMessages = conversation ? buildWorkingMessages(context, conversation) : [];
  workingMessages.push({ role: 'assistant', content: '', toolCalls: [{ id: 'confirmed', name: action.tool_name, args: JSON.parse(action.arguments || '{}') }] });
  workingMessages.push({ role: 'tool', name: action.tool_name, toolCallId: 'confirmed', content: JSON.stringify(toolResultForModel(result)) });

  let text;
  try {
    const response = await activeProvider.chat({ systemPrompt, messages: workingMessages, tools: toProviderToolList(tools) });
    text = response.type === 'message' && response.content ? response.content : 'Listo, se completó la acción.';
  } catch (err) {
    console.error('[ai] error del proveedor al confirmar:', err?.message || err);
    text = 'La acción se completó correctamente, aunque no pude generar un resumen en este momento.';
  }

  if (conversation) history.recordMessage(conversation.id, context.tenantId, 'assistant', text);
  return { type: 'message', conversationId: conversation?.id, message: text };
}

function cancelAndReply({ context, actionId }) {
  const action = history.getAction(actionId, context.tenantId);
  if (!action) return { type: 'error', code: 'ACTION_NOT_FOUND', message: 'No encontré esa acción para cancelar.' };
  const conversation = history.getConversation(action.conversation_id, context.tenantId);
  const result = rejectToolCall({ actionId, context });
  if (!result.success) {
    return { type: 'message', conversationId: conversation?.id, message: `No pude cancelar: ${result.message}` };
  }
  const text = 'Entendido, no realicé esa acción.';
  if (conversation) history.recordMessage(conversation.id, context.tenantId, 'assistant', text);
  return { type: 'message', conversationId: conversation?.id, message: text };
}

module.exports = { handleChatMessage, confirmAndReply, cancelAndReply, getAvailableTools };
