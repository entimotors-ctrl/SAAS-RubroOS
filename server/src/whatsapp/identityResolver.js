const db = require('../db');

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
function resolve({ phoneNumberId, from }) {
  const phoneNumber = normalizePhoneNumber(from);
  if (!phoneNumberId || !phoneNumber) return null;

  const row = db
    .prepare(
      `SELECT wi.tenant_id AS tenantId, wi.user_id AS userId, u.role AS role, u.business_type AS businessType
       FROM whatsapp_identities wi
       JOIN users u ON u.id = wi.user_id
       WHERE wi.phone_number_id = ? AND wi.phone_number = ? AND wi.status = 'active'`
    )
    .get(phoneNumberId, phoneNumber);

  return row || null;
}

module.exports = { resolve, normalizePhoneNumber, UNKNOWN_NUMBER_MESSAGE };
