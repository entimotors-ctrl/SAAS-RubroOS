const db = require('../db');
const { ServiceError } = require('./errors');
const { listRows } = require('../utils/crud');

/**
 * Lógica de negocio del Taller, reutilizable desde la API REST y, más
 * adelante, desde herramientas de IA / WhatsApp. Siempre recibe tenantId ya
 * resuelto por el llamador (JWT en la web, sesión vinculada en WhatsApp) —
 * nunca confía en un tenant_id que venga en el body.
 */

const { registrarVenta, registrarAbono } = require('./tallerSales');

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

function consultarInventario(tenantId) {
  return listRows('taller_inventario', tenantId, 'nombre ASC');
}

// Solo pliega vocales acentuadas + diéresis — nunca la ñ (es una letra
// distinta de la n, no un acento sobre ella). Mapa explícito en vez de
// Unicode NFD genérico precisamente porque NFD sí trataría la ñ como "n" +
// diacrítico y la rompería.
const ACCENT_FOLD = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
function normalizeForSearch(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[áéíóúü]/g, (c) => ACCENT_FOLD[c]);
}

function buscarCliente(tenantId, { nombre } = {}) {
  if (!nombre || !nombre.trim()) throw new ServiceError('Indica un nombre para buscar');
  const needle = normalizeForSearch(nombre.trim());
  // Búsqueda amplia (ya acotada por tenant_id) + comparación normalizada en
  // memoria: evita LIKE sensible a acentos sin tocar el esquema ni registrar
  // una función SQL global.
  const candidatos = db.prepare('SELECT * FROM taller_clientes WHERE tenant_id = ? ORDER BY nombre').all(tenantId);
  return candidatos.filter((c) => normalizeForSearch(c.nombre).includes(needle)).slice(0, 20);
}

module.exports = { registrarVenta, registrarAbono, consultarInventario, buscarCliente };
