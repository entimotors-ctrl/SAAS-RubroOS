const WINDOW_MS = 5 * 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

/**
 * Limiter propio, en memoria, por número de teléfono resuelto — NO por IP.
 * Todo el tráfico del webhook llega desde la infraestructura de Meta, así
 * que un limiter por IP penalizaría a Meta entero, no al número abusivo.
 * Sin Redis: un solo proceso Node es lo que hay hoy (mismo criterio que ya
 * usan authLimiter/aiLimiter en las rutas HTTP normales, solo que acá la
 * unidad es "mensaje ya parseado", no "request HTTP", porque un solo POST
 * de Meta puede traer varios mensajes.
 */
const hits = new Map(); // phoneNumber -> timestamps[]

function isRateLimited(phoneNumber) {
  const now = Date.now();
  const timestamps = (hits.get(phoneNumber) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(phoneNumber, timestamps);
  return timestamps.length > MAX_MESSAGES_PER_WINDOW;
}

module.exports = { isRateLimited, WINDOW_MS, MAX_MESSAGES_PER_WINDOW };
