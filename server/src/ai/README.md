# Arquitectura de IA — chat web conectado, WhatsApp todavía NO

El asistente de IA de RubroOS ya funciona por chat web, usando la misma
lógica de negocio que ya usa la app web, sin duplicarla y sin saltarse el
aislamiento multi-tenant.

```
POST /api/ai/chat (JWT) → AiContext → chatService.handleChatMessage()
   → historial (ai_conversations/ai_messages) → system prompt dinámico
   → AIProvider.chat() → tool_call?
        → orchestrator.proposeToolCall() → toolRegistry.authorize()
          (rubro, permiso, argumentos, refs de tenant) → toolRegistry.runTool()
          → Business Service (server/src/services/*) → SQLite
        → needsConfirmation? → se corta el loop, responde confirmation_required
        → si no, el resultado se le devuelve al modelo y se repite (máx. 5 vueltas)
   → respuesta final en lenguaje natural
```

## Piezas

- **`core/context.js`** — construye el `AiContext` (`userId`, `tenantId`, `businessType`, `role`, `channel`, `permissions`) a partir de una identidad ya autenticada (JWT). Nunca acepta un `tenantId` suelto del mensaje del usuario. `permissions` se calcula del rol real (`security/permissions.js`).
- **`core/toolRegistry.js`** — registro de tools y `authorize()`/`runTool()`: existe → rubro coincide → permiso concedido → argumentos válidos → `refs` pertenecen al tenant. Nunca lanza: siempre `{ success, data }` o `{ success:false, code, message }`.
- **`core/validate.js`** — validador ligero de argumentos, pensado para lo que puede alucinar un LLM.
- **`core/orchestrator.js`** — `proposeToolCall()` / `confirmToolCall()` / `rejectToolCall()`. Una tool con `requiresConfirmation` queda "pending_confirmation" en `ai_actions` con sus argumentos exactos; confirmar **siempre** ejecuta esos argumentos guardados, nunca unos nuevos. Soporta `idempotencyKey`.
- **`core/chatService.js`** — el flujo HTTP completo: resuelve/crea la conversación, arma el system prompt dinámico (rubro, negocio, usuario, rol — `prompts/business.js`), filtra las tools por rubro+permiso antes de ofrecérselas al proveedor, corre el loop de tool calls (límite de 5 por turno) y persiste solo los mensajes en lenguaje natural en `ai_messages` (las llamadas a tools quedan en `ai_actions`, no se duplica el historial).
- **`core/history.js`** — CRUD de `ai_conversations` / `ai_messages` / `ai_actions`, siempre filtrado por `tenant_id`. `sanitizeForAudit()` oculta credenciales antes de guardar.
- **`core/provider.js`** — interfaz `AIProvider` (`chat({ systemPrompt, messages, tools }) → tool_call | message`). `NullAIProvider` es el default seguro cuando no hay `AI_API_KEY`.
- **`core/providerToolAdapter.js`** — convierte el `inputSchema` de una tool a JSON Schema, reutilizable por cualquier proveedor basado en function calling.
- **`providers/openaiProvider.js`** — `AIProvider` real sobre la API de OpenAI (fetch nativo, sin SDK).
- **`providers/anthropicProvider.js`** — `AIProvider` real sobre la API de Mensajes de Anthropic/Claude (fetch nativo, sin SDK) — misma interfaz, wire distinto (system fuera del array de mensajes, `tool_use`/`tool_result` en vez de `tool_calls`/role `tool`).
- **`providers/googleProvider.js`** — `AIProvider` real sobre la API de Google AI Studio/Gemini (fetch nativo, sin SDK). El modelo por defecto (`gemini-3.6-flash`) razona ("thinking") antes de responder, por eso usa más presupuesto de tokens/timeout que los otros dos. Cuando reproduce una `functionCall` en el siguiente turno necesita la `thought_signature` exacta que devolvió el modelo — se cachea en la instancia mientras dura el loop de una request; si no está disponible (p. ej. al redactar el resumen tras confirmar una acción, con una instancia nueva) cae a describir la llamada+resultado en texto plano en vez de fallar. Su capa gratuita es muy limitada (20 solicitudes/día para este modelo — un solo turno con varias tools encadenadas puede agotarla).
- **`providers/groqProvider.js`** — subclase mínima de `OpenAIProvider` (mismo `tools`/`tool_calls`/`tool_choice`, Groq expone un endpoint compatible con el formato de OpenAI) que solo cambia la URL base y el modelo por defecto — no duplica la lógica de conversión de mensajes/tools. Capa gratuita bastante más generosa que la de Google AI Studio.
- `providers/index.js` elige el proveedor según `AI_PROVIDER` (`openai` por defecto, o `anthropic`/`claude`, o `google`/`gemini`, o `groq`) + `AI_API_KEY`/`AI_MODEL` (`gpt-4o-mini`, `claude-haiku-4-5-20251001`, `gemini-3.6-flash` u `openai/gpt-oss-20b` por defecto según el proveedor).
- **`providers/fakeProviderForTests.js`** — proveedor determinista SOLO para pruebas (`AI_FAKE_PROVIDER=1`), nunca en producción.
- **`tools/*`** — 24 herramientas (14 de escritura/acción + 10 de lectura), cada una delegando en `server/src/services/*`.
- **`security/permissions.js`** — permisos por rol calculados del tool registry: `tenant_admin` → todo; `tenant_staff` → read+write, nunca `destructive`.
- **`prompts/`** — `core.js` (reglas fijas), `business.js` (rubro/negocio/usuario/rol dinámicos), `tools.js`, `security.js`. `prompts/index.js` compone el prompt completo. Sin secretos interpolados.

## Endpoints

- `POST /api/ai/chat` — `{ conversationId?, message }` → `{ type: 'message'|'confirmation_required', conversationId, message, actionId? }`.
- `POST /api/ai/confirm` — `{ actionId }` → ejecuta la acción pendiente con sus argumentos originales.
- `POST /api/ai/cancel` — `{ actionId }` → marca la acción como rechazada, no ejecuta nada.
- `GET /api/ai/conversations` — conversaciones del tenant/usuario autenticado.
- `GET /api/ai/conversations/:id/messages` — historial de una conversación (404 si no es del tenant autenticado).

Todas requieren `requireAuth` + `requireTenant` (igual que el resto de la API) y tienen su propio rate limit (40 solicitudes / 5 min).

## Variables de entorno

`AI_API_KEY` (obligatoria para que el chat responda de verdad — sin ella el provider es `NullAIProvider` y el chat falla con un mensaje genérico), `AI_PROVIDER` (opcional, `openai` por defecto, o `anthropic`/`claude`, o `google`/`gemini`, o `groq`) y `AI_MODEL` (opcional, default `gpt-4o-mini`, `claude-haiku-4-5-20251001`, `gemini-3.6-flash` u `openai/gpt-oss-20b` según el proveedor). Ninguna tiene valor real en `server/.env.example`; solo viven en `server/.env`, nunca en el frontend ni en el código.

## Qué falta

WhatsApp (`server/src/routes/whatsapp.js`) sigue inerte — es la siguiente fase: vincular número de WhatsApp a un usuario/tenant y conectar el webhook a `chatService`, reutilizando exactamente esta misma capa.

## Pruebas

- `server/tests/ai-core.js` — 23 checks del núcleo (sin HTTP ni proveedor).
- `server/tests/ai-chat.js` — 31 checks de integración HTTP real (requiere el servidor corriendo con `AI_FAKE_PROVIDER=1`).
