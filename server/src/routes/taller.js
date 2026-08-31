const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');
const tallerService = require('../services/tallerService');

const router = express.Router();

router.use('/clientes', simpleCrud('taller_clientes', ['nombre', 'telefono', 'direccion'], { required: ['nombre'] }));
router.use(
  '/vehiculos',
  simpleCrud('taller_vehiculos', ['cliente_id', 'placa', 'marca', 'modelo', 'anio', 'notas'], {
    required: ['placa'],
    refs: { cliente_id: 'taller_clientes' },
  })
);
router.use(
  '/citas',
  simpleCrud('taller_citas', ['cliente_id', 'vehiculo_id', 'fecha', 'hora', 'servicio', 'estado', 'notas'], {
    required: ['fecha', 'hora'],
    refs: { cliente_id: 'taller_clientes', vehiculo_id: 'taller_vehiculos' },
  })
);
router.use('/inventario', simpleCrud('taller_inventario', ['nombre', 'sku', 'precio', 'stock'], { required: ['nombre'] }));

// ---- POS / Ventas (contado y crédito) ----
router.get('/ventas', (req, res) => {
  const ventas = db
    .prepare(
      `SELECT v.*, c.nombre AS cliente_nombre FROM taller_ventas v
       LEFT JOIN taller_clientes c ON c.id = v.cliente_id AND c.tenant_id = v.tenant_id
       WHERE v.tenant_id = ? ORDER BY v.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM taller_venta_items WHERE venta_id = ?');
  const abonosStmt = db.prepare('SELECT * FROM taller_abonos WHERE venta_id = ? ORDER BY fecha DESC');
  for (const v of ventas) {
    v.items = itemsStmt.all(v.id);
    v.abonos = abonosStmt.all(v.id);
  }
  res.json(ventas);
});

router.post('/ventas', (req, res, next) => {
  try {
    const venta = tallerService.registrarVenta(req.user.tenant_id, req.body || {});
    res.status(201).json(venta);
  } catch (err) {
    next(err);
  }
});

router.post('/ventas/:id/abonos', (req, res, next) => {
  try {
    const venta = tallerService.registrarAbono(req.user.tenant_id, req.params.id, req.body?.monto);
    res.json(venta);
  } catch (err) {
    next(err);
  }
});

router.get('/finanzas/resumen', (req, res) => {
  const tenantId = req.user.tenant_id;
  const hoy = db
    .prepare("SELECT COALESCE(SUM(total),0) AS total FROM taller_ventas WHERE tenant_id = ? AND date(created_at) = date('now')")
    .get(tenantId).total;
  const semana = db
    .prepare("SELECT date(created_at) AS dia, COALESCE(SUM(total),0) AS total FROM taller_ventas WHERE tenant_id = ? AND created_at >= date('now','-6 day') GROUP BY dia ORDER BY dia")
    .all(tenantId);
  const creditoPendiente = db
    .prepare("SELECT COALESCE(SUM(saldo),0) AS total FROM taller_ventas WHERE tenant_id = ? AND estado = 'credito_abierto'")
    .get(tenantId).total;
  const citasHoy = db
    .prepare("SELECT COUNT(*) AS n FROM taller_citas WHERE tenant_id = ? AND fecha = date('now')")
    .get(tenantId).n;
  res.json({ ventasHoy: hoy, ventasUltimaSemana: semana, creditoPendiente, citasHoy });
});

module.exports = router;
