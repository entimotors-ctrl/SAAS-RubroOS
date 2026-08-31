const crypto = require('crypto');

/**
 * Verifica la firma X-Hub-Signature-256 que Meta manda en cada POST del
 * webhook (HMAC-SHA256 del body crudo, con WHATSAPP_APP_SECRET). Se compara
 * con crypto.timingSafeEqual para no filtrar información por temporización
 * — una comparación de strings normal (===) es vulnerable a timing attacks.
 *
 * rawBody debe ser el Buffer de los bytes EXACTOS que llegaron (ver
 * server/src/index.js: express.json({ verify }) los guarda en req.rawBody),
 * nunca una re-serialización de req.body ya parseado.
 */
function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!rawBody || !signatureHeader || !appSecret) return false;
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.slice(prefix.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

module.exports = { verifySignature };
