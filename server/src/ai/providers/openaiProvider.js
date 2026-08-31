const { toProviderTools } = require('../core/providerToolAdapter');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini'; // económico y con buen soporte de function calling; documentado en server/.env.example
const REQUEST_TIMEOUT_MS = 20000;
const MAX_RESPONSE_TOKENS = 600;
const MAX_RETRIES = 1;

/**
 * Implementación de AIProvider (ver core/provider.js) para la API de
 * OpenAI. Es la ÚNICA pieza del sistema que conoce el formato de wire de
 * OpenAI — el orchestrator/chatService, las tools y los services no saben
 * que existe. Cambiar de proveedor significa escribir otra clase con este
 * mismo chat({systemPrompt, messages, tools}), nada más.
 */
class OpenAIProvider {
  constructor({ apiKey, model } = {}) {
    if (!apiKey) throw new Error('OpenAIProvider requiere un apiKey (AI_API_KEY)');
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
  }

  toOpenAIMessages(systemPrompt, messages) {
    const out = [{ role: 'system', content: systemPrompt }];
    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          })),
        });
      } else if (m.role === 'tool') {
        out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      } else {
        out.push({ role: m.role, content: m.content ?? '' });
      }
    }
    return out;
  }

  toOpenAITools(tools) {
    return toProviderTools(tools).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }

  async requestWithRetry(body) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`OpenAI respondió ${res.status}`);
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
      messages: this.toOpenAIMessages(systemPrompt, messages),
      max_tokens: MAX_RESPONSE_TOKENS,
      temperature: 0.2,
    };
    if (tools?.length) {
      body.tools = this.toOpenAITools(tools);
      body.tool_choice = 'auto';
    }

    const data = await this.requestWithRetry(body);
    const choice = data.choices?.[0];
    const toolCalls = choice?.message?.tool_calls;

    if (toolCalls?.length) {
      // Se procesa una tool call por turno del loop (ver ai/core/chatService.js) — mantiene
      // el ciclo simple y auditable; si el modelo pide varias, las demás se re-piden en la
      // siguiente vuelta una vez resuelta la primera.
      const tc = toolCalls[0];
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }
      return { type: 'tool_call', id: tc.id, toolName: tc.function.name, args };
    }

    return { type: 'message', content: choice?.message?.content || '' };
  }
}

module.exports = { OpenAIProvider, DEFAULT_MODEL };
