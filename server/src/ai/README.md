# Arquitectura de IA (preparación — no conectada todavía)

Esta carpeta deja lista la estructura para que un futuro asistente de IA
(chat web y WhatsApp) use la misma lógica de negocio que ya usa la app web,
sin duplicarla y sin saltarse el aislamiento multi-tenant.

```
AI Tool  →  Business Service (server/src/services/*)  →  Validación + tenant_id  →  SQLite
```

- `core/context.js` — construye el `AiContext` (tenantId, businessType, role, channel) a partir de una identidad ya autenticada. Nunca acepta un tenant_id suelto del mensaje del usuario.
- `core/toolRegistry.js` — registro y punto único de ejecución de herramientas. Aplica rubro correcto + confirmación explícita para acciones sensibles antes de llamar al service.
- `tools/*` — una herramienta por operación de negocio relevante, cada una delegando en `server/src/services/*` (nunca toca SQLite directamente).
- `security/permissions.js` — espejo del mismo modelo de permisos de la API REST (`requireTenant`/`requireBusinessType`/role).
- `prompts/system.js` — placeholder del texto de sistema; no está conectado a ningún proveedor de IA.

## Qué falta para que esto haga algo

Nada aquí ejecuta código por sí solo todavía. Para tener un asistente funcional falta:

1. Un endpoint (p. ej. `POST /api/ai/chat`) que reciba un mensaje, resuelva el `AiContext` desde el JWT de la sesión, y llame a un proveedor de IA (usando `AI_API_KEY`) pasándole `listTools()` como las funciones disponibles.
2. Que el proveedor de IA devuelva qué herramienta quiere invocar y con qué argumentos, y que el endpoint llame a `runTool(...)`.
3. Guardar la conversación y las acciones en `ai_conversations` / `ai_messages` / `ai_actions` (tablas ya creadas en `server/src/db.js`, con `status` empezando en `pending_confirmation` para las tools sensibles).
4. Conectar `server/src/routes/whatsapp.js` (webhook ya preparado, inactivo) a esta misma capa, resolviendo primero el número de WhatsApp a un usuario/tenant vinculado — sin esa vinculación, WhatsApp no debe poder ejecutar ninguna tool.

Deliberadamente no implementado en esta fase para no conectar servicios externos sin que el usuario lo pida explícitamente.
