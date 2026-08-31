const crypto = require('crypto');
const db = require('../db');
const { ServiceError } = require('../services/errors');
const { sendMessage } = require('./adapter');
const { normalizePhoneNumber } = require('./identityResolver');

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/** Estado del vínculo del tenant — nunca incluye el código de verificación. */
function getStatus(tenantId) {
  const row = db
    .prepare(
      `SELECT wi.phone_number AS phoneNumber, wi.status AS status, wi.updated_at AS updatedAt, u.nombre AS linkedUserName
       FROM whatsapp_identities wi JOIN users u ON u.id = wi.user_id
       WHERE wi.tenant_id = ? AND wi.status IN ('active','pending')
       ORDER BY wi.id DESC LIMIT 1`
    )
    .get(tenantId);
  if (!row) return { linked: false, pending: false };
  return {
    linked: row.status === 'active',
    pending: row.status === 'pending',
    phoneNumber: row.phoneNumber,
    linkedUserName: row.status === 'active' ? row.linkedUserName : undefined,
    updatedAt: row.updatedAt,
  };
}

/**
 * Genera un código de 6 dígitos y lo manda por WhatsApp real al número
 * indicado — el código NUNCA se devuelve en la respuesta HTTP, solo llega
 * por WhatsApp, así se prueba que quien está vinculando de verdad puede
 * recibir mensajes en ese número (y no está vinculando el número de otra
 * persona solo porque ya está autenticado en RubroOS).
 */
async function initiateLink({ tenantId, userId, phoneNumberRaw }) {
  const phoneNumber = normalizePhoneNumber(phoneNumberRaw);
  if (!phoneNumber || phoneNumber.length < 8) throw new ServiceError('Número de teléfono inválido', 400);

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new ServiceError('WhatsApp no está configurado en este servidor todavía', 503);

  const activeElsewhere = db
    .prepare("SELECT id FROM whatsapp_identities WHERE phone_number = ? AND status = 'active' AND tenant_id != ?")
    .get(phoneNumber, tenantId);
  if (activeElsewhere) throw new ServiceError('Este número ya está vinculado a otro negocio de RubroOS', 409);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const existing = db.prepare('SELECT id FROM whatsapp_identities WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId);
  if (existing) {
    db.prepare(
      `UPDATE whatsapp_identities
       SET phone_number = ?, phone_number_id = ?, status = 'pending', verification_code = ?, verification_expires_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(phoneNumber, phoneNumberId, code, expiresAt, existing.id);
  } else {
    db.prepare(
      `INSERT INTO whatsapp_identities (tenant_id, user_id, phone_number, phone_number_id, status, verification_code, verification_expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).run(tenantId, userId, phoneNumber, phoneNumberId, code, expiresAt);
  }

  try {
    await sendMessage({ to: phoneNumber, text: `Tu código de vinculación con RubroOS es: ${code}. Vence en 10 minutos.` });
  } catch (err) {
    throw new ServiceError('No se pudo enviar el código por WhatsApp. Verifica el número e intenta de nuevo.', 502);
  }

  return { status: 'pending_verification' };
}

function verifyLink({ tenantId, userId, code }) {
  const row = db.prepare("SELECT * FROM whatsapp_identities WHERE tenant_id = ? AND user_id = ? AND status = 'pending'").get(tenantId, userId);
  if (!row) throw new ServiceError('No hay una vinculación pendiente de verificar', 404);
  if (!row.verification_code || row.verification_code !== String(code || '').trim()) {
    throw new ServiceError('Código incorrecto', 400);
  }
  if (new Date(row.verification_expires_at) < new Date()) {
    throw new ServiceError('El código expiró, solicita uno nuevo', 400);
  }

  try {
    db.prepare(
      `UPDATE whatsapp_identities SET status = 'active', verification_code = NULL, verification_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(row.id);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ServiceError('Este número quedó vinculado a otro negocio justo antes de confirmar. Intenta con otro número.', 409);
    }
    throw err;
  }

  return { status: 'active', phoneNumber: row.phone_number };
}

function unlink({ tenantId, userId }) {
  const row = db.prepare("SELECT id FROM whatsapp_identities WHERE tenant_id = ? AND user_id = ? AND status = 'active'").get(tenantId, userId);
  if (!row) throw new ServiceError('No hay ningún número vinculado', 404);
  db.prepare("UPDATE whatsapp_identities SET status = 'revoked', updated_at = datetime('now') WHERE id = ?").run(row.id);
  return { status: 'revoked' };
}

module.exports = { getStatus, initiateLink, verifyLink, unlink };
