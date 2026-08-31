const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');

const router = express.Router();

router.use('/servicios', simpleCrud('carwash_servicios', ['nombre', 'precio', 'duracion_min']));
router.use('/clientes', simpleCrud('carwash_clientes', ['nombre', 'telefono']));
router.use('/vehiculos', simpleCrud('carwash_vehiculos', ['cliente_id', 'placa', 'tipo']));

// ---- Membresías (ingreso recurrente) ----
router.get('/membresias', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, c.nombre AS cliente_nombre FROM carwash_membresias m
       LEFT JOIN carwash_clientes c ON c.id = m.cliente_id
       WHERE m.tenant_id = ? ORDER BY m.id DESC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/membresias', (req, res) => {
  const { cliente_id, plan, precio_mensual } = req.body || {};
  if (!cliente_id || !plan) return res.status(400).json({ error: 'Faltan campos: cliente_id, plan' });
  const info = db
    .prepare(
      `INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado)
       VALUES (?, ?, ?, ?, date('now'), date('now', '+1 month'), 'activa')`
    )
    .run(req.user.tenant_id, cliente_id, plan, Number(precio_mensual || 0));
  res.status(201).json(db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/membresias/:id/renovar', (req, res) => {
  const m = db.prepare('SELECT * FROM carwash_membresias WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!m) return res.status(404).json({ error: 'No encontrada' });
  db.prepare("UPDATE carwash_membresias SET fecha_renovacion = date(fecha_renovacion, '+1 month'), estado = 'activa' WHERE id = ?").run(m.id);
  res.json(db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(m.id));
});

router.put('/membresias/:id/cancelar', (req, res) => {
  const m = db.prepare('SELECT * FROM carwash_membresias WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!m) return res.status(404).json({ error: 'No encontrada' });
  db.prepare("UPDATE carwash_membresias SET estado = 'cancelada' WHERE id = ?").run(m.id);
  res.json(db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(m.id));
});

// ---- Turnos / cola ----
router.get('/turnos', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, c.nombre AS cliente_nombre, v.placa, s.nombre AS servicio_nombre FROM carwash_turnos t
       LEFT JOIN carwash_clientes c ON c.id = t.cliente_id
       LEFT JOIN carwash_vehiculos v ON v.id = t.vehiculo_id
       LEFT JOIN carwash_servicios s ON s.id = t.servicio_id
       WHERE t.tenant_id = ? ORDER BY t.id DESC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/turnos', (req, res) => {
  const { cliente_id, vehiculo_id, servicio_id, usa_membresia } = req.body || {};
  const servicio = servicio_id ? db.prepare('SELECT * FROM carwash_servicios WHERE id = ? AND tenant_id = ?').get(servicio_id, req.user.tenant_id) : null;
  let precio = servicio ? servicio.precio : 0;
  let usaMembresiaFinal = 0;

  if (usa_membresia && cliente_id) {
    const membresia = db
      .prepare("SELECT * FROM carwash_membresias WHERE cliente_id = ? AND tenant_id = ? AND estado = 'activa' AND fecha_renovacion >= date('now')")
      .get(cliente_id, req.user.tenant_id);
    if (membresia) {
      precio = 0;
      usaMembresiaFinal = 1;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO carwash_turnos (tenant_id, cliente_id, vehiculo_id, servicio_id, estado, usa_membresia, precio)
       VALUES (?, ?, ?, ?, 'en_cola', ?, ?)`
    )
    .run(req.user.tenant_id, cliente_id || null, vehiculo_id || null, servicio_id || null, usaMembresiaFinal, precio);
  res.status(201).json(db.prepare('SELECT * FROM carwash_turnos WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/turnos/:id/estado', (req, res) => {
  const turno = db.prepare('SELECT * FROM carwash_turnos WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
  const estado = req.body?.estado;
  if (!['en_cola', 'lavando', 'listo', 'entregado'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
  db.prepare('UPDATE carwash_turnos SET estado = ? WHERE id = ?').run(estado, turno.id);
  res.json(db.prepare('SELECT * FROM carwash_turnos WHERE id = ?').get(turno.id));
});

router.get('/resumen', (req, res) => {
  const tenantId = req.user.tenant_id;
  const hoy = db
    .prepare("SELECT COALESCE(SUM(precio),0) AS total, COUNT(*) AS n FROM carwash_turnos WHERE tenant_id = ? AND date(created_at) = date('now')")
    .get(tenantId);
  const enCola = db.prepare("SELECT COUNT(*) AS n FROM carwash_turnos WHERE tenant_id = ? AND estado IN ('en_cola','lavando')").get(tenantId).n;
  const membresiasActivas = db.prepare("SELECT COUNT(*) AS n FROM carwash_membresias WHERE tenant_id = ? AND estado = 'activa'").get(tenantId).n;
  res.json({ ingresosHoy: hoy.total, lavadosHoy: hoy.n, enCola, membresiasActivas });
});

module.exports = router;
