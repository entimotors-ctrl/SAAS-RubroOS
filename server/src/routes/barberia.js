const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');
const barberiaService = require('../services/barberiaService');
const availability = require('../services/barberiaAvailability');

const router = express.Router();

router.get('/disponibilidad', async (req, res) => res.json(await availability.list(req.user.tenant_id)));
router.put('/barberos/:id/horarios', async (req, res, next) => {
  try { res.json(await availability.setSchedule(req.user.tenant_id, req.params.id, req.body?.horarios)); } catch (err) { next(err); }
});
router.post('/bloqueos', async (req, res, next) => {
  try { res.status(201).json(await availability.createBlock(req.user.tenant_id, req.body)); } catch (err) { next(err); }
});
router.delete('/bloqueos/:id', async (req, res, next) => {
  try { await availability.removeBlock(req.user.tenant_id, req.params.id); res.status(204).end(); } catch (err) { next(err); }
});

router.use('/barberos', simpleCrud('barberia_barberos', ['nombre', 'especialidad', 'activo', 'comision_porcentaje'], { required: ['nombre'] }));
router.use('/servicios', simpleCrud('barberia_servicios', ['nombre', 'precio', 'duracion_min'], { required: ['nombre'] }));
router.use('/clientes', simpleCrud('barberia_clientes', ['nombre', 'telefono'], { required: ['nombre'] }));
router.get('/citas', async (req,res)=>res.json(await db.prepare('SELECT * FROM barberia_citas WHERE tenant_id=? ORDER BY fecha DESC,hora').all(req.user.tenant_id)));
router.post('/citas',async (req,res,next)=>{try{res.status(201).json(await require('../services/barberiaAppointments').save(req.user.tenant_id,req.body||{}));}catch(e){next(e);}});
router.put('/citas/:id',async (req,res,next)=>{try{res.json(await require('../services/barberiaAppointments').save(req.user.tenant_id,req.body||{},req.params.id));}catch(e){next(e);}});
// NOTA Fase 2 (Postgres): business_day()/business_today() son funciones SQL
// registradas con db.function() (ver services/businessClock.js) — solo
// existen en better-sqlite3. Antes de activar DATABASE_URL hace falta
// crearlas como funciones de PostgreSQL (migración nueva) replicando la
// conversión de zona horaria por tenant_id, o reescribir estas consultas
// para calcular el día de negocio en JavaScript. Ver docs/ESTADO-FASE-2-ADAPTADOR-PG.md.
router.get('/comisiones',async (req,res)=>res.json(await db.prepare(`SELECT b.id,b.nombre,b.comision_porcentaje,COUNT(c.id) AS cuentas,COALESCE(SUM(c.total),0) AS ventas,COALESCE(SUM(c.comision_total),0) AS comision FROM barberia_barberos b LEFT JOIN barberia_cuentas c ON c.barbero_id=b.id AND c.tenant_id=b.tenant_id AND c.estado='pagada' AND business_day(c.cobrada_at,b.tenant_id)=business_today(b.tenant_id) WHERE b.tenant_id=? GROUP BY b.id`).all(req.user.tenant_id)));

router.post('/cobrar',async (req,res)=>res.status(201).json(await barberiaService.cerrarCuenta(req.user.tenant_id,req.body||{})));

// ---- Cuentas (POS por silla) ----
router.get('/cuentas', async (req, res) => {
  const cuentas = await db
    .prepare(
      `SELECT cu.*, cl.nombre AS cliente_nombre, b.nombre AS barbero_nombre FROM barberia_cuentas cu
       LEFT JOIN barberia_clientes cl ON cl.id = cu.cliente_id AND cl.tenant_id = cu.tenant_id
       LEFT JOIN barberia_barberos b ON b.id = cu.barbero_id AND b.tenant_id = cu.tenant_id
       WHERE cu.tenant_id = ? ORDER BY cu.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM barberia_cuenta_items WHERE cuenta_id = ?');
  for (const c of cuentas) c.items = await itemsStmt.all(c.id);
  res.json(cuentas);
});

router.post('/cuentas', async (req, res, next) => {
  try {
    const cuenta = await barberiaService.crearCuenta(req.user.tenant_id, req.body || {});
    res.status(201).json(cuenta);
  } catch (err) {
    next(err);
  }
});

router.post('/cuentas/:id/cobrar', async (req, res, next) => {
  try {
    const cuenta = await barberiaService.cobrarCuenta(req.user.tenant_id, req.params.id, req.body?.metodo_pago);
    res.json(cuenta);
  } catch (err) {
    next(err);
  }
});

router.get('/resumen', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const hoy = await db
    .prepare("SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM barberia_cuentas WHERE tenant_id = ? AND estado='pagada' AND business_day(cobrada_at,tenant_id) = business_today(tenant_id)")
    .get(tenantId);
  const citasHoy = (await db
    .prepare("SELECT COUNT(*) AS n FROM barberia_citas WHERE tenant_id = ? AND fecha = business_today(tenant_id)")
    .get(tenantId)).n;
  res.json({ ingresosHoy: hoy.total, cortesHoy: hoy.n, citasHoy });
});

module.exports = router;
