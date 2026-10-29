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
router.use('/inventario', require('./tallerInventory'));
router.use('/ordenes', require('./tallerOrders'));

// ---- POS / Ventas (contado y crédito) ----
router.get('/ventas', async (req, res) => {
  const ventas = await db
    .prepare(
      `SELECT v.*, c.nombre AS cliente_nombre FROM taller_ventas v
       LEFT JOIN taller_clientes c ON c.id = v.cliente_id AND c.tenant_id = v.tenant_id
       WHERE v.tenant_id = ? ORDER BY v.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM taller_venta_items WHERE venta_id = ?');
  const abonosStmt = db.prepare('SELECT * FROM taller_abonos WHERE venta_id = ? ORDER BY fecha DESC');
  for (const v of ventas) {
    v.items = await itemsStmt.all(v.id);
    v.abonos = await abonosStmt.all(v.id);
  }
  res.json(ventas);
});

router.post('/ventas', async (req, res, next) => {
  try {
    const venta = await tallerService.registrarVenta(req.user.tenant_id, req.body || {}, req.user.sub);
    res.status(201).json(venta);
  } catch (err) {
    next(err);
  }
});

router.post('/ventas/:id/abonos', async (req, res, next) => {
  try {
    const venta = await tallerService.registrarAbono(req.user.tenant_id, req.params.id, req.body?.monto);
    res.json(venta);
  } catch (err) {
    next(err);
  }
});

router.get('/finanzas/resumen', async (req, res) => {
  const tenantId = req.user.tenant_id;
  const hoy = (await db
    .prepare("SELECT COALESCE(SUM(total),0) AS total FROM taller_ventas WHERE tenant_id = ? AND business_day(created_at,tenant_id) = business_today(tenant_id)")
    .get(tenantId)).total;
  // date(x,'-6 day') (SQLite) -> x - 6 (Postgres: date - integer = date).
  const semanaSql = process.env.DATABASE_URL
    ? "SELECT business_day(created_at,tenant_id) AS dia, COALESCE(SUM(total),0) AS total FROM taller_ventas WHERE tenant_id = ? AND business_day(created_at,tenant_id) >= business_today(tenant_id) - 6 GROUP BY dia ORDER BY dia"
    : "SELECT business_day(created_at,tenant_id) AS dia, COALESCE(SUM(total),0) AS total FROM taller_ventas WHERE tenant_id = ? AND business_day(created_at,tenant_id) >= date(business_today(tenant_id),'-6 day') GROUP BY dia ORDER BY dia";
  const semana = await db.prepare(semanaSql).all(tenantId);
  const creditoPendiente = (await db
    .prepare("SELECT COALESCE(SUM(saldo),0) AS total FROM taller_ventas WHERE tenant_id = ? AND estado = 'credito_abierto'")
    .get(tenantId)).total;
  const citasHoy = (await db
    .prepare("SELECT COUNT(*) AS n FROM taller_citas WHERE tenant_id = ? AND fecha = business_today(tenant_id)")
    .get(tenantId)).n;
  const vehiculosEnTaller = (await db.prepare("SELECT COUNT(DISTINCT vehiculo_id) AS n FROM taller_ordenes WHERE tenant_id = ? AND estado NOT IN ('entregada', 'cancelada')").get(tenantId)).n;
  res.json({ ventasHoy: hoy, ventasUltimaSemana: semana, creditoPendiente, citasHoy, vehiculosEnTaller });
});

module.exports = router;
