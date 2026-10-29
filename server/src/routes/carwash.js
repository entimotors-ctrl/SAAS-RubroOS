const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../security/access');
const { simpleCrud } = require('../utils/crud');
const carwashService = require('../services/carwashService');

const router = express.Router();

router.use('/servicios', simpleCrud('carwash_servicios', ['nombre', 'precio', 'duracion_min'], { required: ['nombre'] }));
router.use('/clientes', simpleCrud('carwash_clientes', ['nombre', 'telefono'], { required: ['nombre'] }));
router.use(
  '/vehiculos',
  simpleCrud('carwash_vehiculos', ['cliente_id', 'placa', 'tipo'], { refs: { cliente_id: 'carwash_clientes' } })
);

// ---- Membresías (ingreso recurrente) ----
router.get('/membresias', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT m.*, c.nombre AS cliente_nombre FROM carwash_membresias m
       LEFT JOIN carwash_clientes c ON c.id = m.cliente_id AND c.tenant_id = m.tenant_id
       WHERE m.tenant_id = ? ORDER BY m.id DESC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/membresias', async (req, res, next) => {
  try {
    const membresia = await carwashService.crearMembresia(req.user.tenant_id, req.body || {});
    res.status(201).json(membresia);
  } catch (err) {
    next(err);
  }
});

router.put('/membresias/:id/renovar', async (req, res, next) => {
  try {
    const membresia = await carwashService.renovarMembresia(req.user.tenant_id, req.params.id);
    res.json(membresia);
  } catch (err) {
    next(err);
  }
});

router.put('/membresias/:id/cancelar', requireAdmin, async (req, res, next) => {
  try {
    const membresia = await carwashService.cancelarMembresia(req.user.tenant_id, req.params.id);
    res.json(membresia);
  } catch (err) {
    next(err);
  }
});

// ---- Turnos / cola ----
router.get('/turnos', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT t.*, c.nombre AS cliente_nombre, v.placa, s.nombre AS servicio_nombre FROM carwash_turnos t
       LEFT JOIN carwash_clientes c ON c.id = t.cliente_id AND c.tenant_id = t.tenant_id
       LEFT JOIN carwash_vehiculos v ON v.id = t.vehiculo_id AND v.tenant_id = t.tenant_id
       LEFT JOIN carwash_servicios s ON s.id = t.servicio_id AND s.tenant_id = t.tenant_id
       WHERE t.tenant_id = ? ORDER BY t.id DESC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/turnos', async (req, res, next) => {
  try {
    const turno = await carwashService.crearTurno(req.user.tenant_id, req.body || {});
    res.status(201).json(turno);
  } catch (err) {
    next(err);
  }
});

router.put('/turnos/:id/estado', async (req, res, next) => {
  try {
    const turno = await carwashService.actualizarEstadoTurno(req.user.tenant_id, req.params.id, req.body?.estado, req.body?.metodo_pago);
    res.json(turno);
  } catch (err) {
    next(err);
  }
});

router.get('/resumen', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const hoy = await db
    .prepare("SELECT COALESCE(SUM(precio),0) AS total, COUNT(*) AS n FROM carwash_turnos WHERE tenant_id = ? AND estado = 'entregado' AND business_day(entregado_at,tenant_id) = business_today(tenant_id)")
    .get(tenantId);
  const enCola = (await db.prepare("SELECT COUNT(*) AS n FROM carwash_turnos WHERE tenant_id = ? AND estado IN ('en_cola','lavando')").get(tenantId)).n;
  const membresiasActivas = (await db.prepare("SELECT COUNT(*) AS n FROM carwash_membresias WHERE tenant_id = ? AND estado = 'activa' AND fecha_renovacion >= business_today(tenant_id)").get(tenantId)).n;
  res.json({ ingresosHoy: hoy.total, lavadosHoy: hoy.n, enCola, membresiasActivas });
});

module.exports = router;
