const express = require('express');

const router = express.Router();

/**
 * Webhook de WhatsApp Cloud API — todavía NO conectado a un número real ni
 * a la IA. Deja solo el endpoint y el flujo conceptual documentados para
 * cuando se implemente:
 *
 *   WhatsApp phone → user → tenant → role → permissions → AI → tool → business service
 *
 * Hasta que exista una vinculación segura número-de-teléfono → usuario/tenant,
 * ningún mensaje entrante ejecuta ninguna acción de negocio real (punto 15
 * de la auditoría: no permitir acciones desde WhatsApp sin autenticación).
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

// Aquí llegarían los mensajes entrantes. Por ahora solo confirma recepción;
// no resuelve identidad ni despacha a server/src/ai todavía.
router.post('/webhook', (req, res) => {
  console.log('[whatsapp] mensaje entrante recibido (webhook preparado, procesamiento no implementado todavía)');
  res.sendStatus(200);
});

module.exports = router;
