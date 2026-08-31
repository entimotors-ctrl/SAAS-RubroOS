const { toProviderTools } = require('../core/providerToolAdapter');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'; // económico y rápido, con buen soporte de tool use; documentado en server/.env.example
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RESPONSE_TOKENS = 600;
const MAX_RETRIES = 1;

/**
 * Implementación de AIProvider (ver core/provider.js) para la API de
 * Mensajes de Anthropic (Claude). Es la ÚNICA pieza del sistema que conoce
 * el formato de wire de Anthropic — el orchestrator/chatService, las tools
 * y los services no saben que existe. Vive junto a OpenAIProvider como una
 * alternativa intercambiable por env var (ver providers/index.js), sin que
 * ninguna otra parte del sistema tenga que cambiar.
 */
class AnthropicProvider {
  constructor({ apiKey, model } = {}) {
    if (!apiKey) throw new Error('AnthropicProvider requiere un apiKey (AI_API_KEY)');
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  toAnthropicMessages(messages) {
    const out = [];
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const content = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args || {} });
        out.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        // Anthropic no tiene un role "tool" propio: el resultado va como un
        // content block tool_result dentro de un turno "user".
        out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content ?? '' }] });
      } else {
        out.push({ role: m.role, content: m.content ?? '' });
      }
    }
    return out;
  }

  toAnthropicTools(tools) {
    return toProviderTools(tools).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }

  async requestWithRetry(body) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`Anthropic respondió ${res.status}`);
          err.status = res.status;
          err.body = text;
          // Reintenta solo errores transitorios (5xx); un 4xx (p. ej. API key inválida) no mejora reintentando.
          if (res.status >= 500 && attempt < MAX_RETRIES) {
            lastError = err;
            continue;
          }
          throw err;
        }
        return res.json();
      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        if (attempt >= MAX_RETRIES) break;
      }
    }
    throw lastError;
  }

  async chat({ systemPrompt, messages, tools }) {
    const body = {
      model: this.model,
      max_tokens: MAX_RESPONSE_TOKENS,
      temperature: 0.2,
      system: systemPrompt,
      messages: this.toAnthropicMessages(messages),
    };
    if (tools?.length) {
      body.tools = this.toAnthropicTools(tools);
    }

    const data = await this.requestWithRetry(body);
    const blocks = data.content || [];
    // Igual que OpenAIProvider: se procesa una tool call por turno del loop
    // (ver ai/core/chatService.js) — si el modelo pide varias, las demás se
    // re-piden en la siguiente vuelta una vez resuelta la primera.
    const toolUse = blocks.find((b) => b.type === 'tool_use');
    if (toolUse) {
      return { type: 'tool_call', id: toolUse.id, toolName: toolUse.name, args: toolUse.input || {} };
    }

    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { type: 'message', content: text };
  }
}

module.exports = { AnthropicProvider, DEFAULT_MODEL };
