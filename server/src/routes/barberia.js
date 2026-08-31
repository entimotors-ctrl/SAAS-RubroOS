const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');
const barberiaService = require('../services/barberiaService');

const router = express.Router();

router.use('/barberos', simpleCrud('barberia_barberos', ['nombre', 'especialidad', 'activo'], { required: ['nombre'] }));
router.use('/servicios', simpleCrud('barberia_servicios', ['nombre', 'precio', 'duracion_min'], { required: ['nombre'] }));
router.use('/clientes', simpleCrud('barberia_clientes', ['nombre', 'telefono'], { required: ['nombre'] }));
router.use(
  '/citas',
  simpleCrud('barberia_citas', ['cliente_id', 'barbero_id', 'servicio_id', 'fecha', 'hora', 'estado'], {
    required: ['fecha', 'hora'],
    refs: { cliente_id: 'barberia_clientes', barbero_id: 'barberia_barberos', servicio_id: 'barberia_servicios' },
  })
);

// ---- Cuentas (POS por silla) ----
router.get('/cuentas', (req, res) => {
  const cuentas = db
    .prepare(
      `SELECT cu.*, cl.nombre AS cliente_nombre, b.nombre AS barbero_nombre FROM barberia_cuentas cu
       LEFT JOIN barberia_clientes cl ON cl.id = cu.cliente_id AND cl.tenant_id = cu.tenant_id
       LEFT JOIN barberia_barberos b ON b.id = cu.barbero_id AND b.tenant_id = cu.tenant_id
       WHERE cu.tenant_id = ? ORDER BY cu.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM barberia_cuenta_items WHERE cuenta_id = ?');
  for (const c of cuentas) c.items = itemsStmt.all(c.id);
  res.json(cuentas);
});

router.post('/cuentas', (req, res, next) => {
  try {
    const cuenta = barberiaService.crearCuenta(req.user.tenant_id, req.body || {});
    res.status(201).json(cuenta);
  } catch (err) {
    next(err);
  }
});

router.post('/cuentas/:id/cobrar', (req, res, next) => {
  try {
    const cuenta = barberiaService.cobrarCuenta(req.user.tenant_id, req.params.id, req.body?.metodo_pago);
    res.json(cuenta);
  } catch (err) {
    next(err);
  }
});

router.get('/resumen', (req, res) => {
  const tenantId = req.user.tenant_id;
  const hoy = db
    .prepare("SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM barberia_cuentas WHERE tenant_id = ? AND estado='pagada' AND date(created_at) = date('now')")
    .get(tenantId);
  const citasHoy = db
    .prepare("SELECT COUNT(*) AS n FROM barberia_citas WHERE tenant_id = ? AND fecha = date('now')")
    .get(tenantId).n;
  res.json({ ingresosHoy: hoy.total, cortesHoy: hoy.n, citasHoy });
});

module.exports = router;
