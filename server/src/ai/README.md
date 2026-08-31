# Arquitectura de IA (preparación — no conectada todavía)

Esta carpeta deja listo el núcleo para que un futuro asistente de IA (chat
web y WhatsApp) use la misma lógica de negocio que ya usa la app web, sin
duplicarla y sin saltarse el aislamiento multi-tenant.

```
mensaje → AiContext → orchestrator.proposeToolCall() → toolRegistry.authorize()
   → (rubro, permiso, argumentos, refs de tenant) → toolRegistry.runTool()
   → Business Service (server/src/services/*) → SQLite
```

## Piezas

- **`core/context.js`** — construye el `AiContext` (`userId`, `tenantId`, `businessType`, `role`, `channel`, `permissions`) a partir de una identidad ya autenticada. Nunca acepta un `tenantId` suelto del mensaje del usuario. `permissions` se calcula aquí desde el rol real (`security/permissions.js`), no lo decide el modelo.
- **`core/toolRegistry.js`** — registro de tools y `authorize()`/`runTool()`. Antes de ejecutar cualquier tool verifica, en orden: existe → rubro coincide con `businessType` → el permiso de la tool está en `context.permissions` → los argumentos pasan `inputSchema` → los `refs` (ids referenciados) pertenecen al tenant. Nunca lanza: siempre devuelve `{ success, data }` o `{ success:false, code, message }`.
- **`core/validate.js`** — validador ligero de argumentos (tipos, requeridos, rangos, `itemSchema` para listas) pensado para lo que puede alucinar un LLM, no para reemplazar la validación de negocio de los services.
- **`core/orchestrator.js`** — `proposeToolCall()` / `confirmToolCall()` / `rejectToolCall()`. Decide *cuándo* ejecutar: si la tool no requiere confirmación, se ejecuta ya; si la requiere, queda "pending_confirmation" en `ai_actions` con sus argumentos exactos, y `confirmToolCall()` **siempre** ejecuta esos argumentos guardados — nunca unos nuevos que lleguen en la confirmación. Soporta `idempotencyKey` para no duplicar una acción si el mismo evento llega dos veces.
- **`core/history.js`** — CRUD de `ai_conversations` / `ai_messages` / `ai_actions`, siempre filtrado por `tenant_id`. `sanitizeForAudit()` oculta cualquier campo que parezca password/token/secret antes de guardar nada.
- **`core/provider.js`** — interfaz `AIProvider` (`chat({ systemPrompt, messages, tools }) → tool_call | message`). `NullAIProvider` la cumple pero lanza `NotImplementedError` — es el default hasta que se conecte un proveedor real, para no acoplar las tools a un SDK específico.
- **`tools/*`** — 24 herramientas (14 de escritura/acción + 10 de solo lectura), cada una delegando en `server/src/services/*`. Formato estándar: `permission`, `riskLevel` (`read`/`write`/`destructive`), `requiresConfirmation`, `inputSchema`, `refs`, `handler`.
- **`security/permissions.js`** — calcula los permisos de un rol directamente del tool registry (no de un catálogo aparte): `tenant_admin` → todo; `tenant_staff` → read+write, nunca `destructive`.
- **`prompts/`** — `core.js` (reglas fijas), `business.js` (se adapta al rubro/tenant, resuelto desde el contexto), `tools.js` (cómo usar las herramientas), `security.js` (refuerzo de permisos/tenant). `prompts/index.js` compone el prompt completo. Sin secretos interpolados.

## Qué falta para que esto haga algo

Nada aquí llama a un proveedor de IA todavía. Para tener un asistente funcional falta:

1. Un endpoint (p. ej. `POST /api/ai/chat`) que reciba un mensaje, resuelva el `AiContext` desde el JWT de la sesión, cree/recupere una conversación (`history.createConversation`) y guarde el mensaje (`history.recordMessage`).
2. Implementar un `AIProvider` real (OpenAI, Claude, etc.) y pasarle `listTools(businessType)` + el prompt de `prompts/index.js`. Cuando el proveedor pida una tool, el endpoint llama a `orchestrator.proposeToolCall()`.
3. Si la respuesta trae `needsConfirmation`, mostrarle al usuario el mensaje de confirmación y, si confirma, llamar a `orchestrator.confirmToolCall()` con el mismo `actionId` — nunca reconstruir la acción desde cero.
4. Conectar `server/src/routes/whatsapp.js` (webhook ya preparado, inactivo) a esta misma capa, resolviendo primero el número de WhatsApp a un usuario/tenant vinculado — sin esa vinculación, WhatsApp no debe poder ejecutar ninguna tool.

Deliberadamente no implementado en esta fase para no conectar servicios externos sin que el usuario lo pida explícitamente.

## Pruebas

`server/tests/ai-core.js` — 23 checks contra el núcleo real (sin servidor HTTP ni proveedor de IA): aislamiento de tenant, permisos por rol, rubro, confirmaciones, idempotencia, validación de argumentos e historial. Uso: `node tests/ai-core.js`.
