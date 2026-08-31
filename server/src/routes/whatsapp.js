const express = require('express');
const { verifySignature } = require('../whatsapp/signature');

const router = express.Router();

/**
 * Webhook de WhatsApp Cloud API.
 *
 *   WhatsApp → Meta → este webhook → WhatsApp Adapter → Identity Resolver
 *     → AiContext → AI Orchestrator (el mismo que usa el chat web) → tool
 *     → service → SQLite → Adapter → WhatsApp
 *
 * Hasta que exista una vinculación segura número-de-teléfono → usuario/tenant
 * (server/src/whatsapp/identityResolver.js), ningún mensaje entrante ejecuta
 * ninguna acción de negocio real.
 */

// Meta llama a esto una sola vez, al configurar la URL del webhook, para
// verificar que el servidor responde con el challenge esperado.
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/webhook', (req, res) => {
  const signatureHeader = req.headers['x-hub-signature-256'];
  const valid = verifySignature(req.rawBody, signatureHeader, process.env.WHATSAPP_APP_SECRET);
  if (!valid) {
    console.warn('[whatsapp] POST /webhook rechazado: firma X-Hub-Signature-256 inválida o ausente');
    return res.sendStatus(403);
  }

  // El procesamiento real (parseo de eventos, idempotencia, identidad,
  // orquestador de IA, respuesta) se conecta en un commit siguiente — por
  // ahora solo se confirma la firma y se acusa recibo, sin ejecutar tools.
  console.log('[whatsapp] POST /webhook con firma válida (procesamiento del mensaje todavía no conectado)');
  res.sendStatus(200);
});

module.exports = router;
