const GRAPH_API_VERSION = 'v21.0';
const MAX_MESSAGE_LENGTH = 4096; // límite real de WhatsApp Cloud API para mensajes de texto

/**
 * @typedef {Object} WhatsAppIncomingMessage
 * @property {string} messageId      — wamid.xxx, usado para idempotencia.
 * @property {string} phoneNumberId  — número de WhatsApp Business que recibió el mensaje.
 * @property {string} from           — número del remitente (E.164 sin '+').
 * @property {string} timestamp
 * @property {string} type           — 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | otro.
 * @property {string} [text]         — solo si type === 'text'.
 * @property {Object} [media]        — objeto crudo de Meta si type es un tipo de media (no procesado todavía).
 * @property {string} [displayName]  — nombre de perfil de WhatsApp, informativo, nunca usado para autenticar.
 *
 * El orchestrator/chatService NUNCA ve el JSON de Meta — solo esta forma.
 */

/**
 * Convierte el payload crudo del webhook de Meta a WhatsAppIncomingMessage[].
 * Los eventos de `statuses[]` (acuses de entrega/lectura) no son mensajes
 * entrantes — se ignoran aquí, no llegan al orchestrator.
 */
function parseIncomingEvents(payload) {
  const out = [];
  const entries = payload?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      for (const m of messages) {
        const contact = contacts.find((c) => c.wa_id === m.from);
        const type = m.type || 'unknown';
        out.push({
          messageId: m.id,
          phoneNumberId,
          from: m.from,
          timestamp: m.timestamp,
          type,
          text: type === 'text' ? m.text?.body : undefined,
          media: ['image', 'audio', 'video', 'document', 'sticker', 'location'].includes(type) ? m[type] : undefined,
          displayName: contact?.profile?.name,
        });
      }
      // value.statuses (delivered/read/sent/failed) se ignora intencionalmente.
    }
  }
  return out;
}

// SOLO para pruebas automatizadas (WHATSAPP_FAKE_TRANSPORT=1, nunca en
// producción): en vez de llamar a la Graph API de verdad, guarda lo que se
// hubiera mandado — así los tests pueden verificar la respuesta calculada
// sin depender de red ni de credenciales reales de Meta. Mismo espíritu que
// AI_FAKE_PROVIDER para los proveedores de IA.
const outbox = [];
function getOutbox() {
  return outbox;
}
function clearOutbox() {
  outbox.length = 0;
}

/** Manda un mensaje de texto vía la Graph API. No sabe nada del orchestrator — solo habla el wire de Meta. */
async function sendMessage({ to, text, phoneNumberId, accessToken }) {
  if (process.env.WHATSAPP_FAKE_TRANSPORT === '1') {
    outbox.push({ to, text });
    return { messaging_product: 'whatsapp', fake: true };
  }

  const pnId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  if (!pnId || !token) throw new Error('WhatsApp no está configurado (faltan WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN)');

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pnId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    const err = new Error(`WhatsApp API respondió ${res.status}`);
    err.status = res.status;
    err.body = bodyText; // nunca contiene el access token — solo lo consume el log interno, nunca el usuario.
    throw err;
  }
  return res.json();
}

const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/;

function tableRowCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Reformatea un bloque de tabla markdown (que WhatsApp no renderiza) en líneas planas "Columna: valor". */
function convertMarkdownTables(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i];
    const separator = lines[i + 1];
    if (header?.includes('|') && separator && TABLE_SEPARATOR_RE.test(separator.trim())) {
      const headers = tableRowCells(header);
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        const cells = tableRowCells(lines[j]);
        const row = headers.map((h, idx) => `${h}: ${cells[idx] ?? ''}`).join(' · ');
        out.push(row);
        j += 1;
      }
      i = j - 1;
      continue;
    }
    out.push(header);
  }
  return out.join('\n');
}

/** Adapta el markdown que produce el asistente al formato de texto de WhatsApp (sin HTML, sin tablas). */
function toWhatsAppText(markdown) {
  if (!markdown) return '';
  let text = convertMarkdownTables(markdown);
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*'); // **negrita** -> *negrita*
  text = text.replace(/^#{1,6}\s*/gm, ''); // encabezados markdown -> texto plano
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '$1: $2'); // [texto](url) -> texto: url
  text = text.replace(/<[^>]+>/g, ''); // por si acaso, nunca HTML
  return text.trim();
}

function splitAtBoundary(text, maxLen) {
  const boundaries = ['\n\n', '\n', '. ', ' '];
  for (const b of boundaries) {
    const idx = text.lastIndexOf(b, maxLen);
    if (idx > maxLen * 0.5) return idx + b.length;
  }
  return maxLen; // último recurso: corte duro
}

/** Parte un texto largo en trozos <= maxLen, evitando cortar una frase a la mitad cuando se puede. */
function splitMessage(text, maxLen = MAX_MESSAGE_LENGTH) {
  if (!text) return [''];
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > maxLen) {
    const cut = splitAtBoundary(rest, maxLen);
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

module.exports = { parseIncomingEvents, sendMessage, toWhatsAppText, splitMessage, MAX_MESSAGE_LENGTH, getOutbox, clearOutbox };
