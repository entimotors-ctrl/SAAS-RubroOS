const db = require('../db');
const dbAccess = require('../security/dbAccess');

const UNKNOWN_NUMBER_MESSAGE = 'No encuentro este número asociado a un negocio de RubroOS. Contacta al administrador.';

/** Deja solo dígitos — así "+504 9999-0000", "504 9999 0000" y "50499990000" son el mismo número. */
function normalizePhoneNumber(raw) {
  return String(raw || '').replace(/[^0-9]/g, '');
}

/**
 * phoneNumberId + from -> {tenantId, userId, role, businessType}, o null si
 * el número no está vinculado a ningún negocio. Esta es la ÚNICA fuente de
 * identidad para WhatsApp — el tenant_id NUNCA sale del mensaje ni de nada
 * que el remitente pueda escribir ("soy del tenant 5" no tiene ningún
 * efecto, porque este resolver ni siquiera mira el texto del mensaje).
 */
async function resolve({ phoneNumberId, from }) {
  const phoneNumber = normalizePhoneNumber(from);
  if (!phoneNumberId || !phoneNumber) return null;

  // asSystem: por definición esta consulta determina A QUÉ tenant pertenece
  // el número — no hay un tenant_id previo por el cual filtrar.
  const row = await dbAccess.asSystem(() =>
    // Los alias camelCase van entre comillas dobles: sin comillas, Postgres los
    // pliega a minúsculas (tenantid, no tenantId) y el código de arriba que lee
    // identity.tenantId/businessType se rompería en silencio.
    db
      .prepare(
        `SELECT wi.tenant_id AS "tenantId", wi.user_id AS "userId", u.role AS role, u.business_type AS "businessType"
         FROM whatsapp_identities wi
         JOIN users u ON u.id = wi.user_id AND u.tenant_id = wi.tenant_id
         JOIN tenants t ON t.id = wi.tenant_id AND t.business_type = u.business_type
           AND t.status IN ('activo', 'trial')
         WHERE u.role='tenant_admin' AND u.access_status='activo' AND wi.phone_number_id = ? AND wi.phone_number = ? AND wi.status = 'active'`
      )
      .get(phoneNumberId, phoneNumber)
  );

  return row || null;
}

/**
 * ¿El número que ESCRIBE ya está vinculado a algún negocio, sea cual sea su
 * rol o estado? resolve() devuelve null tanto para un desconocido total como
 * para personal real con permiso insuficiente (p. ej. tenant_staff, que
 * resolve() exige tenant_admin) o suspendido — hay que distinguir los dos
 * casos antes de ofrecerle a alguien el flujo de "cliente sin cuenta" (ver
 * resolveBusinessByPhoneNumberId): un colaborador real sin acceso debe seguir
 * viendo el mensaje de siempre, no que lo traten como un cliente nuevo.
 */
async function isKnownNumber({ phoneNumberId, from }) {
  const phoneNumber = normalizePhoneNumber(from);
  if (!phoneNumberId || !phoneNumber) return false;
  const row = await dbAccess.asSystem(() =>
    db.prepare('SELECT 1 FROM whatsapp_identities WHERE phone_number_id = ? AND phone_number = ? AND status = ?').get(phoneNumberId, phoneNumber, 'active')
  );
  return !!row;
}

/**
 * phoneNumberId (el número de WhatsApp Business DEL NEGOCIO, no el del
 * remitente) -> {tenantId, businessType, slug}, o null. A diferencia de
 * resolve(), NO exige que quien escribe sea personal registrado — la usa
 * routes/whatsapp.js para reconocer a un CLIENTE (sin cuenta) que le
 * escribe al número de un negocio que sí existe, y ofrecerle el link para
 * agendar en vez de un simple "número no encontrado". Antes de usar esto,
 * routes/whatsapp.js llama a isKnownNumber() para descartar que quien
 * escribe sea personal real con permiso insuficiente (ver arriba).
 */
async function resolveBusinessByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  return dbAccess.asSystem(() =>
    db
      .prepare(
        `SELECT t.id AS "tenantId", t.business_type AS "businessType", t.slug AS slug
         FROM whatsapp_identities wi
         JOIN tenants t ON t.id = wi.tenant_id AND t.status IN ('activo', 'trial')
         WHERE wi.phone_number_id = ? AND wi.status = 'active'
         ORDER BY wi.id DESC LIMIT 1`
      )
      .get(phoneNumberId)
  );
}

module.exports = { resolve, isKnownNumber, resolveBusinessByPhoneNumberId, normalizePhoneNumber, UNKNOWN_NUMBER_MESSAGE };
