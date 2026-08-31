const { NullAIProvider } = require('../core/provider');
const { OpenAIProvider } = require('./openaiProvider');
const { AnthropicProvider } = require('./anthropicProvider');
const { GoogleAIProvider } = require('./googleProvider');

/**
 * Elige el proveedor de IA a partir de las variables de entorno. Se llama
 * en cada request (no se cachea a nivel de módulo) para que un cambio de
 * AI_API_KEY/AI_MODEL/AI_PROVIDER en .env solo requiera reiniciar el server,
 * y para que las pruebas puedan seguir inyectando su propio provider sin
 * pasar por acá.
 */
function createProvider() {
  if (process.env.AI_FAKE_PROVIDER === '1') {
    // SOLO para pruebas automatizadas (server/tests/ai-chat.js) — nunca se
    // activa salvo que ese flag se ponga explícitamente en el entorno.
    const { FakeAIProvider } = require('./fakeProviderForTests');
    return new FakeAIProvider();
  }
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return new NullAIProvider();
  const kind = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  if (kind === 'anthropic' || kind === 'claude') {
    return new AnthropicProvider({ apiKey, model: process.env.AI_MODEL || undefined });
  }
  if (kind === 'google' || kind === 'gemini') {
    return new GoogleAIProvider({ apiKey, model: process.env.AI_MODEL || undefined });
  }
  return new OpenAIProvider({ apiKey, model: process.env.AI_MODEL || undefined });
}

module.exports = { createProvider };
