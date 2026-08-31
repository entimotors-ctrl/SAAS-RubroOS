const { toProviderTools } = require('../core/providerToolAdapter');

const GOOGLE_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.6-flash'; // rápido y económico, con buen soporte de function calling; documentado en server/.env.example
const REQUEST_TIMEOUT_MS = 45000; // los modelos "flash" actuales razonan (thinking) antes de responder — toma más que un endpoint sin razonamiento
const MAX_RESPONSE_TOKENS = 1024; // el presupuesto de salida incluye los tokens de thinking, no solo el texto final
const MAX_RETRIES = 1;

const JSON_SCHEMA_TYPE_TO_GEMINI = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
};

/** El "Schema" de Gemini usa un subconjunto de OpenAPI con `type` en mayúsculas (STRING/OBJECT/...), no JSON Schema estándar; y no soporta additionalProperties. */
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (out.type) out.type = JSON_SCHEMA_TYPE_TO_GEMINI[out.type] || String(out.type).toUpperCase();
  if (out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (out.items) out.items = toGeminiSchema(out.items);
  delete out.additionalProperties;
  return out;
}

/**
 * Implementación de AIProvider (ver core/provider.js) para la API de
 * Google AI Studio / Gemini. Es la ÚNICA pieza del sistema que conoce el
 * formato de wire de Gemini — el orchestrator/chatService, las tools y los
 * services no saben que existe. Tercera alternativa intercambiable por
 * AI_PROVIDER junto a OpenAIProvider y AnthropicProvider.
 */
class GoogleAIProvider {
  constructor({ apiKey, model } = {}) {
    if (!apiKey) throw new Error('GoogleAIProvider requiere un apiKey (AI_API_KEY)');
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
    // Los modelos "thinking" de Gemini exigen reenviar la thought_signature
    // exacta de una functionCall para poder reproducir ese turno en la
    // siguiente vuelta. Se cachea por id de llamada, solo dentro de la vida
    // de esta instancia (una por request, ver providers/index.js). Si no
    // se tiene la firma (p. ej. el flujo de confirmación reconstruye la
    // llamada desde ai_actions, no desde una respuesta viva del modelo),
    // toGoogleContents cae a un turno de texto plano en vez de fallar.
    this._thoughtSignatures = new Map();
  }

  toGoogleContents(messages) {
    const out = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];

      if (m.role === 'assistant' && m.toolCalls?.length) {
        const tc = m.toolCalls[0]; // se procesa una tool call por turno (ver chat())
        const next = messages[i + 1];
        const hasResult = next && next.role === 'tool' && next.toolCallId === tc.id;
        const signature = this._thoughtSignatures.get(tc.id);
        let resultData;
        if (hasResult) {
          try {
            resultData = JSON.parse(next.content || '{}');
          } catch {
            resultData = { raw: next.content };
          }
        }

        if (hasResult && signature) {
          const parts = [];
          if (m.content) parts.push({ text: m.content });
          parts.push({ functionCall: { name: tc.name, args: tc.args || {} }, thoughtSignature: signature });
          out.push({ role: 'model', parts });
          out.push({ role: 'user', parts: [{ functionResponse: { name: next.name || tc.name, response: resultData } }] });
          i += 1; // ya se consumió el mensaje 'tool' emparejado
          continue;
        }

        if (hasResult) {
          // Sin firma disponible: no se puede reproducir el turno functionCall
          // tal cual, así que se colapsa la llamada + su resultado en texto
          // plano — el modelo igual puede redactar una respuesta a partir de esto.
          out.push({
            role: 'user',
            parts: [{ text: `Resultado de la acción "${tc.name}": ${JSON.stringify(resultData)}. Redacta una respuesta breve y clara para el usuario a partir de este resultado, sin tecnicismos.` }],
          });
          i += 1;
          continue;
        }

        if (m.content) out.push({ role: 'model', parts: [{ text: m.content }] });
        continue;
      }

      if (m.role === 'tool') {
        // Mensaje 'tool' sin su assistant-toolCalls emparejado justo antes
        // (no debería ocurrir en el flujo actual) — se manda como texto para no perder información.
        let response;
        try {
          response = JSON.parse(m.content || '{}');
        } catch {
          response = { raw: m.content };
        }
        out.push({ role: 'user', parts: [{ text: `Resultado de herramienta "${m.name}": ${JSON.stringify(response)}` }] });
        continue;
      }

      out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content ?? '' }] });
    }
    return out;
  }

  toGoogleTools(tools) {
    const functionDeclarations = toProviderTools(tools).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.parameters),
    }));
    return [{ functionDeclarations }];
  }

  async requestWithRetry(body) {
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${GOOGLE_URL_BASE}/${this.model}:generateContent`, {
          method: 'POST',
          // La clave va en un header, nunca en la URL (para que no quede en logs de acceso/proxies).
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`Google AI respondió ${res.status}`);
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
      contents: this.toGoogleContents(messages),
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: MAX_RESPONSE_TOKENS, temperature: 0.2 },
    };
    if (tools?.length) body.tools = this.toGoogleTools(tools);

    const data = await this.requestWithRetry(body);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCallPart = parts.find((p) => p.functionCall);

    if (functionCallPart) {
      // Igual que OpenAI/Anthropic: se procesa una tool call por turno del
      // loop (ver ai/core/chatService.js).
      const { functionCall, thoughtSignature } = functionCallPart;
      const id = functionCall.id || functionCall.name;
      if (thoughtSignature) this._thoughtSignatures.set(id, thoughtSignature);
      return { type: 'tool_call', id, toolName: functionCall.name, args: functionCall.args || {} };
    }

    const text = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
    return { type: 'message', content: text };
  }
}

module.exports = { GoogleAIProvider, DEFAULT_MODEL };
