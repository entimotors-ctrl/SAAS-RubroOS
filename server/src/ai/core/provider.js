/**
 * Interfaz que debe implementar cualquier proveedor de IA (OpenAI, Claude,
 * Gemini, un modelo local...) para conectarse a RubroOS sin acoplar el
 * resto del sistema (tools, services, orchestrator) a un SDK específico.
 *
 * @typedef {Object} AIProviderToolCallRef
 * @property {string} id     — identificador de la llamada, lo asigna el proveedor.
 * @property {string} name   — nombre de la tool (ver server/src/ai/tools/*).
 * @property {Object} args   — argumentos que el modelo propone para esa tool.
 *
 * @typedef {Object} AIProviderMessage
 * @property {'user'|'assistant'|'tool'} role
 * @property {string} content            — texto (user/assistant) o resultado serializado (tool).
 * @property {AIProviderToolCallRef[]} [toolCalls] — solo en un mensaje 'assistant' que pidió herramientas.
 * @property {string} [toolCallId]       — solo en un mensaje 'tool': a qué toolCalls[].id responde.
 * @property {string} [name]             — solo en un mensaje 'tool': nombre de la tool ejecutada.
 *
 * @typedef {Object} AIProviderToolSpec
 * @property {string} name
 * @property {string} description
 * @property {Object} inputSchema — formato de server/src/ai/core/toolRegistry.js (NO json-schema crudo;
 *                                   cada proveedor lo adapta al formato que necesite, ver providerToolAdapter.js).
 *
 * @typedef {Object} AIProvider
 * @property {(input: { systemPrompt: string, messages: AIProviderMessage[], tools: AIProviderToolSpec[] }) =>
 *   Promise<{ type: 'message', content: string } | { type: 'tool_call', id: string, toolName: string, args: Object }>} chat
 *
 * Este mismo array `messages` es lo que el orchestrator/chatService reconstruye
 * en cada vuelta del loop de tools — es responsabilidad del proveedor
 * traducirlo a su formato de wire específico (por eso OpenAIProvider vive
 * separado, en server/src/ai/providers/openaiProvider.js). Ninguna tool ni
 * ningún service conoce esta forma; solo el proveedor y el chatService.
 */

class NotImplementedError extends Error {
  constructor(providerName) {
    super(`AIProvider "${providerName}" no está implementado todavía.`);
    this.name = 'NotImplementedError';
  }
}

/** Implementación nula: cumple la interfaz pero nunca se conecta a nada externo. Útil como default seguro y en pruebas que no deben tocar la red. */
class NullAIProvider {
  async chat() {
    throw new NotImplementedError('NullAIProvider');
  }
}

module.exports = { NullAIProvider, NotImplementedError };
