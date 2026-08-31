/**
 * Interfaz que debe implementar cualquier proveedor de IA (OpenAI, Claude,
 * el que sea) para conectarse a RubroOS sin acoplar las tools ni el
 * orchestrator a un SDK específico.
 *
 * Forma esperada (JSDoc, este proyecto es JS plano):
 *
 * @typedef {Object} AIProviderMessage
 * @property {'user'|'assistant'|'system'|'tool'} role
 * @property {string} content
 *
 * @typedef {Object} AIProviderToolCall
 * @property {'message'} type
 * @property {string} content
 * -- o --
 * @property {'tool_call'} type
 * @property {string} toolName
 * @property {Object} args
 *
 * @typedef {Object} AIProvider
 * @property {(input: { systemPrompt: string, messages: AIProviderMessage[], tools: { name: string, description: string, inputSchema: Object }[] }) => Promise<AIProviderToolCall>} chat
 *
 * El orchestrator (server/src/ai/core/orchestrator.js) no depende de esto
 * todavía — hoy es el caller (una prueba, o más adelante un endpoint) quien
 * decide qué tool invocar. Cuando se conecte un proveedor real, el
 * orchestrator podrá recibir uno de estos como dependencia y usar su
 * `chat()` para decidirlo, sin cambiar ninguna tool ni ningún service.
 */

class NotImplementedError extends Error {
  constructor(providerName) {
    super(`AIProvider "${providerName}" no está implementado todavía — ningún proveedor de IA está conectado en esta fase.`);
    this.name = 'NotImplementedError';
  }
}

/** Implementación nula: cumple la interfaz pero nunca se conecta a nada externo. Es el default hasta la siguiente fase. */
class NullAIProvider {
  async chat() {
    throw new NotImplementedError('NullAIProvider');
  }
}

module.exports = { NullAIProvider, NotImplementedError };
