const { OpenAIProvider } = require('./openaiProvider');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b'; // rápido (inferencia en LPUs de Groq) y con buen soporte de tool calling; documentado en server/.env.example

/**
 * Groq expone un endpoint compatible con el formato de chat completions de
 * OpenAI (mismos tools/tool_calls/tool_choice) — por eso esto es una
 * subclase mínima de OpenAIProvider que solo cambia la URL base y el
 * modelo por defecto, sin duplicar la lógica de conversión de mensajes/tools.
 */
class GroqProvider extends OpenAIProvider {
  constructor({ apiKey, model } = {}) {
    super({ apiKey, model: model || DEFAULT_MODEL, baseUrl: GROQ_URL });
  }
}

module.exports = { GroqProvider, DEFAULT_MODEL };
