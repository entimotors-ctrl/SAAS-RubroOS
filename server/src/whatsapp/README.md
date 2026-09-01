# WhatsApp Cloud API — otro canal del mismo AI Core

WhatsApp usa exactamente el mismo `chatService`/`orchestrator`/`toolRegistry`/tools/services que el chat web (`server/src/ai/`). No hay un segundo cerebro, ni tools duplicadas, ni una capa de permisos aparte — lo único que cambia es de dónde sale la identidad (JWT en el chat web, un número de teléfono ya vinculado en WhatsApp) y cómo se entrega la respuesta (JSON de vuelta al fetch del navegador vs. un mensaje de WhatsApp).

```
WhatsApp → Meta → POST /api/whatsapp/webhook
  → firma X-Hub-Signature-256 válida? (si no, 403, no se procesa nada)
  → adapter.parseIncomingEvents() (Meta JSON -> WhatsAppIncomingMessage[])
  → reclama cada wamid (INSERT en whatsapp_inbound_events; duplicado = ya visto, se ignora)
  → 200 a Meta YA (no se deja la conexión abierta mientras la IA piensa)
  → (async, mismo proceso) identityResolver.resolve(phoneNumberId, from)
      -> sin vínculo: mensaje fijo, ninguna tool se toca
      -> con vínculo: rateLimiter (por teléfono, no por IP) -> AiContext
         -> confirmationIntent.tryHandle() (¿es un "sí"/"no" de algo pendiente?)
         -> si no, chatService.handleChatMessage() — el MISMO que usa /api/ai/chat
  → adapter.toWhatsAppText() + splitMessage() -> adapter.sendMessage() (Graph API)
```

## Identidad: número de teléfono → tenant/usuario

`whatsapp_identities(tenant_id, user_id, phone_number, phone_number_id, status)` — la única fuente de identidad. El tenant_id **nunca** sale del mensaje: `identityResolver.resolve({phoneNumberId, from})` solo mira esta tabla. Un número sin vínculo activo recibe siempre el mismo mensaje fijo y ninguna tool se ejecuta.

Vincular un número requiere probar que se puede recibir mensajes ahí:
1. El tenant_admin, ya autenticado en RubroOS, pide vincular un número (`POST /api/whatsapp-identity/link`).
2. Se genera un código de 6 dígitos y se manda por WhatsApp real a ese número (nunca en la respuesta HTTP).
3. El admin lo ingresa de vuelta (`POST /api/whatsapp-identity/verify`) — recién ahí el vínculo queda `active`.

Un índice único parcial (`whatsapp_identities(phone_number) WHERE status='active'`) garantiza a nivel de base de datos que el mismo número real nunca puede estar activo en dos tenants a la vez.

## Piezas

- **`signature.js`** — HMAC-SHA256 + `crypto.timingSafeEqual` sobre el body crudo (`req.rawBody`, capturado en `server/src/index.js`).
- **`adapter.js`** — traduce el JSON de Meta a `WhatsAppIncomingMessage` (el orchestrator nunca ve el formato de Meta); manda mensajes vía Graph API (`fetch`, sin SDK); adapta markdown a texto de WhatsApp (`**negrita**` → `*negrita*`, tablas markdown → líneas planas, porque WhatsApp no las renderiza); parte mensajes largos en el límite real de 4096 caracteres sin cortar una frase a la mitad si se puede evitar.
- **`identityResolver.js`** — `phone_number_id + from` → `{tenantId, userId, role, businessType}` o `null`.
- **`identityService.js`** — genera/envía/verifica el código de vinculación, y el alta/baja.
- **`confirmationIntent.js`** — reconoce un "sí"/"no"/"1"/"2"/"cancelar 2" exacto (nunca por coincidencia parcial en una frase larga) cuando hay una acción `pending_confirmation` en la conversación, y delega en `chatService.confirmAndReply`/`cancelAndReply` — nunca decide nada por sí mismo. Con 2+ acciones pendientes, no adivina: pregunta cuál.
- **`rateLimiter.js`** — límite por número de teléfono resuelto, en memoria. Deliberadamente NO por IP: todo el tráfico de Meta comparte su propia infraestructura.

## Endpoints

- `GET /api/whatsapp/webhook` — verificación oficial de Meta (`hub.mode`/`hub.verify_token`/`hub.challenge`).
- `POST /api/whatsapp/webhook` — mensajes entrantes (requiere firma válida).
- `GET/POST /api/whatsapp-identity/{status,link,verify,unlink}` — vinculación (requiere sesión normal de RubroOS; `link`/`verify`/`unlink` solo `tenant_admin`).

## Configurar el webhook en Meta for Developers

1. **Callback URL**: `https://<tu-dominio-público>/api/whatsapp/webhook` (Meta exige HTTPS y una URL alcanzable desde internet — en desarrollo local hace falta un túnel tipo ngrok/cloudflared, `localhost` no sirve).
2. **Verify token**: cualquier string que definas en `WHATSAPP_VERIFY_TOKEN` — es el que Meta te pide al configurar el webhook.
3. **Webhook fields**: suscribirse a `messages` (no hace falta ninguno más para esta fase).

Los valores reales de `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_BUSINESS_ACCOUNT_ID`/`WHATSAPP_APP_SECRET` viven solo en `server/.env`, nunca en este README ni en ningún archivo versionado.

## Qué falta / fuera de alcance por ahora

Audio e imágenes — un mensaje que no sea de texto recibe una respuesta fija ("por ahora solo puedo leer texto") sin tocar la IA. Es una fase separada, según lo pedido.

## Pruebas

`server/tests/whatsapp.js` — 46 checks de integración HTTP real (webhook, firma, idempotencia, identidad, seguridad, conversación, tool round-trip, confirmación, cancelación, ambigüedad, errores, vinculación). Corre contra el servidor real con:

```
AI_FAKE_PROVIDER=1 WHATSAPP_FAKE_TRANSPORT=1 WHATSAPP_APP_SECRET=testsecret WHATSAPP_VERIFY_TOKEN=testverify WHATSAPP_PHONE_NUMBER_ID=PNID_TEST_SUITE node src/index.js
node tests/whatsapp.js
```

`WHATSAPP_FAKE_TRANSPORT=1` reemplaza el envío real a la Graph API por un outbox en memoria (mismo espíritu que `AI_FAKE_PROVIDER`) — nunca se activa salvo que se ponga explícitamente en el entorno. Con esa bandera puesta, el servidor expone `GET /api/whatsapp/_debug/outbox` y `POST /api/whatsapp/_debug/outbox/clear` (no existen si la bandera no está).
