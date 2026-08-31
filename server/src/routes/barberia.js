const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');

const router = express.Router();

router.use('/barberos', simpleCrud('barberia_barberos', ['nombre', 'especialidad', 'activo']));
router.use('/servicios', simpleCrud('barberia_servicios', ['nombre', 'precio', 'duracion_min']));
router.use('/clientes', simpleCrud('barberia_clientes', ['nombre', 'telefono']));
router.use('/citas', simpleCrud('barberia_citas', ['cliente_id', 'barbero_id', 'servicio_id', 'fecha', 'hora', 'estado']));

// ---- Cuentas (POS por silla) ----
router.get('/cuentas', (req, res) => {
  const cuentas = db
    .prepare(
      `SELECT cu.*, cl.nombre AS cliente_nombre, b.nombre AS barbero_nombre FROM barberia_cuentas cu
       LEFT JOIN barberia_clientes cl ON cl.id = cu.cliente_id
       LEFT JOIN barberia_barberos b ON b.id = cu.barbero_id
       WHERE cu.tenant_id = ? ORDER BY cu.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM barberia_cuenta_items WHERE cuenta_id = ?');
  for (const c of cuentas) c.items = itemsStmt.all(c.id);
  res.json(cuentas);
});

router.post('/cuentas', (req, res) => {
  const { cliente_id, barbero_id, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La cuenta necesita al menos un ítem' });
  }
  const total = items.reduce((sum, it) => sum + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0);
  const info = db
    .prepare('INSERT INTO barberia_cuentas (tenant_id, cliente_id, barbero_id, estado, total) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.tenant_id, cliente_id || null, barbero_id || null, 'abierta', total);
  const insertItem = db.prepare(
    'INSERT INTO barberia_cuenta_items (cuenta_id, tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Number(it.cantidad || 1) * Number(it.precio_unitario || 0);
    insertItem.run(info.lastInsertRowid, it.tipo || 'servicio', it.descripcion, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }
  const cuenta = db.prepare('SELECT * FROM barberia_cuentas WHERE id = ?').get(info.lastInsertRowid);
  cuenta.items = db.prepare('SELECT * FROM barberia_cuenta_items WHERE cuenta_id = ?').all(cuenta.id);
  res.status(201).json(cuenta);
});

router.post('/cuentas/:id/cobrar', (req, res) => {
  const cuenta = db.prepare('SELECT * FROM barberia_cuentas WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const metodo = req.body?.metodo_pago || 'efectivo';
  db.prepare("UPDATE barberia_cuentas SET estado = 'pagada', metodo_pago = ? WHERE id = ?").run(metodo, cuenta.id);
  res.json(db.prepare('SELECT * FROM barberia_cuentas WHERE id = ?').get(cuenta.id));
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
