const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const dbAccess = require('../security/dbAccess');
const { text } = require('../services/validation');
const availability = require('../services/barberiaAvailability');
const appointments = require('../services/barberiaAppointments');

const router = express.Router();

// Página/flujo pública para que un CLIENTE (sin cuenta) agende una cita —
// ver docs del plan de WhatsApp para clientes en whatsapp/clientBooking.js.
// Sin requireAuth por diseño: cualquiera con el link del negocio (su slug)
// puede leer servicios/barberos/disponibilidad y crear una cita 'pendiente'.
// Nunca expone ni modifica nada fuera de ESE tenant (resolveTenantBySlug deja
// el resto del request bajo el contexto normal de ese tenant para RLS).
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Inténtalo más tarde.' } }));

async function resolveTenantBySlug(req, res, next) {
  try {
    const tenant = await dbAccess.asSystem(() => db.prepare('SELECT id, business_type, nombre_empresa, status FROM tenants WHERE slug = ?').get(req.params.slug));
    if (!tenant || !['activo', 'trial'].includes(tenant.status)) return res.status(404).json({ error: 'Negocio no encontrado' });
    req.publicTenant = tenant;
    return dbAccess.asTenant(tenant.id, next);
  } catch (err) {
    next(err);
  }
}

function requireBarberia(req, res, next) {
  if (req.publicTenant.business_type !== 'barberia') return res.status(404).json({ error: 'Este negocio no tiene agenda pública todavía' });
  next();
}

router.get('/:slug', resolveTenantBySlug, (req, res) => {
  res.json({ nombre_empresa: req.publicTenant.nombre_empresa, business_type: req.publicTenant.business_type });
});

router.get('/:slug/barberia/servicios', resolveTenantBySlug, requireBarberia, async (req, res, next) => {
  try {
    res.json(await db.prepare('SELECT id, nombre, precio, duracion_min FROM barberia_servicios WHERE tenant_id = ? ORDER BY nombre').all(req.publicTenant.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/barberia/barberos', resolveTenantBySlug, requireBarberia, async (req, res, next) => {
  try {
    res.json(await db.prepare('SELECT id, nombre, especialidad FROM barberia_barberos WHERE tenant_id = ? AND activo = 1 ORDER BY nombre').all(req.publicTenant.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/barberia/disponibilidad', resolveTenantBySlug, requireBarberia, async (req, res, next) => {
  try {
    const barberoId = Number(req.query.barbero_id);
    const servicioId = Number(req.query.servicio_id);
    const fecha = String(req.query.fecha || '');
    const slots = await availability.freeSlots(req.publicTenant.id, barberoId, fecha, servicioId);
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/barberia/citas', resolveTenantBySlug, requireBarberia, async (req, res, next) => {
  try {
    const tenantId = req.publicTenant.id;
    const nombre = text(req.body?.nombre_cliente, 'Nombre', 120);
    const telefono = req.body?.telefono ? text(req.body.telefono, 'Teléfono', 30) : null;
    const barberoId = Number(req.body?.barbero_id);
    const servicioId = Number(req.body?.servicio_id);
    const { fecha, hora } = req.body || {};

    const cliente = await db.transaction(async () => {
      const existing = telefono ? await db.prepare('SELECT id FROM barberia_clientes WHERE tenant_id = ? AND telefono = ?').get(tenantId, telefono) : null;
      if (existing) return existing;
      const info = await db.prepare('INSERT INTO barberia_clientes (tenant_id, nombre, telefono) VALUES (?, ?, ?)').run(tenantId, nombre, telefono);
      return { id: info.lastInsertRowid };
    }).immediate();

    const cita = await appointments.save(tenantId, {
      cliente_id: cliente.id,
      barbero_id: barberoId,
      servicio_id: servicioId,
      fecha,
      hora,
      estado: 'pendiente',
    });
    res.status(201).json(cita);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
