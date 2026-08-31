const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');

const router = express.Router();

router.use('/clientes', simpleCrud('taller_clientes', ['nombre', 'telefono', 'direccion']));
router.use('/vehiculos', simpleCrud('taller_vehiculos', ['cliente_id', 'placa', 'marca', 'modelo', 'anio', 'notas']));
router.use('/citas', simpleCrud('taller_citas', ['cliente_id', 'vehiculo_id', 'fecha', 'hora', 'servicio', 'estado', 'notas']));
router.use('/inventario', simpleCrud('taller_inventario', ['nombre', 'sku', 'precio', 'stock']));

// ---- POS / Ventas (contado y crédito) ----
router.get('/ventas', (req, res) => {
  const ventas = db
    .prepare(
      `SELECT v.*, c.nombre AS cliente_nombre FROM taller_ventas v
       LEFT JOIN taller_clientes c ON c.id = v.cliente_id
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

router.post('/ventas', (req, res) => {
  const { cliente_id, tipo, items, pagado_inicial } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La venta necesita al menos un ítem' });
  }
  const total = items.reduce((sum, it) => sum + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0);
  const esContado = tipo !== 'credito';
  const pagado = esContado ? total : Number(pagado_inicial || 0);
  const saldo = Math.max(total - pagado, 0);
  const estado = saldo <= 0 ? 'pagada' : 'credito_abierto';

  const info = db
    .prepare('INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.tenant_id, cliente_id || null, esContado ? 'contado' : 'credito', total, pagado, saldo, estado);

  const insertItem = db.prepare(
    'INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Number(it.cantidad || 1) * Number(it.precio_unitario || 0);
    insertItem.run(info.lastInsertRowid, it.descripcion, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }

  const venta = db.prepare('SELECT * FROM taller_ventas WHERE id = ?').get(info.lastInsertRowid);
  venta.items = db.prepare('SELECT * FROM taller_venta_items WHERE venta_id = ?').all(venta.id);
  res.status(201).json(venta);
});

router.post('/ventas/:id/abonos', (req, res) => {
  const venta = db.prepare('SELECT * FROM taller_ventas WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  const monto = Number(req.body?.monto || 0);
  if (monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

  db.prepare('INSERT INTO taller_abonos (tenant_id, venta_id, monto) VALUES (?, ?, ?)').run(req.user.tenant_id, venta.id, monto);
  const pagado = venta.pagado + monto;
  const saldo = Math.max(venta.total - pagado, 0);
  const estado = saldo <= 0 ? 'pagada' : 'credito_abierto';
  db.prepare('UPDATE taller_ventas SET pagado = ?, saldo = ?, estado = ? WHERE id = ?').run(pagado, saldo, estado, venta.id);

  const actualizada = db.prepare('SELECT * FROM taller_ventas WHERE id = ?').get(venta.id);
  res.json(actualizada);
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
