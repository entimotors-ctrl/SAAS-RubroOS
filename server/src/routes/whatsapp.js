const express = require('express');
const db = require('../db');
const { verifySignature } = require('../whatsapp/signature');
const { parseIncomingEvents, sendMessage, toWhatsAppText, splitMessage, getOutbox, clearOutbox } = require('../whatsapp/adapter');
const identityResolver = require('../whatsapp/identityResolver');
const { isRateLimited } = require('../whatsapp/rateLimiter');
const confirmationIntent = require('../whatsapp/confirmationIntent');
const { buildContext } = require('../ai/core/context');
const chatService = require('../ai/core/chatService');
const history = require('../ai/core/history');

const router = express.Router();

// SOLO existe con WHATSAPP_FAKE_TRANSPORT=1 (pruebas automatizadas). El
// servidor de pruebas corre en otro proceso que el script que lo verifica,
// así que el outbox en memoria de adapter.js no es visible entre procesos
// sin esto — nunca se monta en producción.
if (process.env.WHATSAPP_FAKE_TRANSPORT === '1') {
  router.get('/_debug/outbox', (req, res) => res.json(getOutbox()));
  router.post('/_debug/outbox/clear', (req, res) => {
    clearOutbox();
    res.sendStatus(204);
  });
}

/**
 * Webhook de WhatsApp Cloud API — WhatsApp como un canal más del mismo AI
 * Core que ya usa el chat web:
 *
 *   Meta → firma válida? → parsear eventos → reclamar wamid (idempotencia)
 *     → 200 a Meta YA (no se deja la conexión abierta mientras la IA piensa)
 *     → (async, mismo proceso) identidad → rate limit → AiContext
 *     → ¿es una confirmación/cancelación de algo pendiente? → si no,
 *       chatService.handleChatMessage (el MISMO que usa /api/ai/chat)
 *     → responder por WhatsApp
 */

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/** INSERT que falla por message_id duplicado = ya se vio este wamid, no procesar de nuevo. */
function claimMessage(messageId) {
  try {
    db.prepare('INSERT INTO whatsapp_inbound_events (message_id) VALUES (?)').run(messageId);
    return true;
  } catch {
    return false;
  }
}

function markEvent(messageId, status, tenantId) {
  db.prepare("UPDATE whatsapp_inbound_events SET status = ?, tenant_id = COALESCE(?, tenant_id), updated_at = datetime('now') WHERE message_id = ?").run(
    status,
    tenantId || null,
    messageId
  );
}

async function replyText(to, text) {
  const chunks = splitMessage(toWhatsAppText(text));
  for (const chunk of chunks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendMessage({ to, text: chunk });
    } catch (err) {
      console.error('[whatsapp] error enviando respuesta:', err?.message || err);
    }
  }
}

async function processTextMessage(evt, identity) {
  if (isRateLimited(evt.from)) {
    await replyText(evt.from, 'Estás enviando demasiados mensajes seguidos. Espera un momento e intenta de nuevo.');
    return;
  }

  const context = buildContext({
    userId: identity.userId,
    tenantId: identity.tenantId,
    businessType: identity.businessType,
    role: identity.role,
    channel: 'whatsapp',
  });

  let conversation = history.findConversationByChannel({ tenantId: context.tenantId, channel: 'whatsapp', externalUserId: evt.from });
  if (!conversation) {
    conversation = history.createConversation({ tenantId: context.tenantId, userId: context.userId, channel: 'whatsapp', externalUserId: evt.from });
  }

  const handled = await confirmationIntent.tryHandle({ context, conversation, text: evt.text });
  const result =
    handled ||
    (await chatService.handleChatMessage({
      context,
      conversationId: conversation.id,
      userMessage: evt.text,
      idempotencyKey: evt.messageId,
    }));

  await replyText(evt.from, result.message);
}

async function processEvent(evt) {
  const identity = identityResolver.resolve({ phoneNumberId: evt.phoneNumberId, from: evt.from });

  if (!identity) {
    await replyText(evt.from, identityResolver.UNKNOWN_NUMBER_MESSAGE);
    markEvent(evt.messageId, 'done');
    return;
  }

  if (evt.type !== 'text') {
    await replyText(evt.from, 'Por ahora solo puedo leer mensajes de texto. Escríbeme lo que necesitas y con gusto te ayudo.');
    markEvent(evt.messageId, 'done', identity.tenantId);
    return;
  }

  try {
    await processTextMessage(evt, identity);
    markEvent(evt.messageId, 'done', identity.tenantId);
  } catch (err) {
    console.error('[whatsapp] error procesando mensaje:', err?.message || err);
    markEvent(evt.messageId, 'failed', identity.tenantId);
    await replyText(evt.from, 'No pude procesar tu solicitud en este momento.');
  }
}

router.post('/webhook', (req, res) => {
  const signatureHeader = req.headers['x-hub-signature-256'];
  const valid = verifySignature(req.rawBody, signatureHeader, process.env.WHATSAPP_APP_SECRET);
  if (!valid) {
    console.warn('[whatsapp] POST /webhook rechazado: firma X-Hub-Signature-256 inválida o ausente');
    return res.sendStatus(403);
  }

  const events = parseIncomingEvents(req.body);
  const claimed = events.filter((evt) => claimMessage(evt.messageId));

  // Meta necesita una respuesta rápida — no se deja la conexión abierta
  // mientras el LLM/tools/DB procesan. El resto sigue en el mismo proceso
  // Node de forma asíncrona (sin cola/Redis: si el proceso muere justo
  // entre este ack y terminar de procesar, ese mensaje se pierde — límite
  // aceptado explícitamente para no meter infraestructura nueva).
  res.sendStatus(200);

  for (const evt of claimed) {
    processEvent(evt).catch((err) => console.error('[whatsapp] error no controlado procesando evento:', err?.message || err));
  }
});

module.exports = router;
