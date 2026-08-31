const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');

const router = express.Router();

router.use('/categorias', simpleCrud('inversiones_categorias', ['nombre']));

router.get('/oportunidades', (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*, c.nombre AS categoria_nombre FROM inversiones_oportunidades o
       LEFT JOIN inversiones_categorias c ON c.id = o.categoria_id
       WHERE o.tenant_id = ? ORDER BY o.id DESC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/oportunidades', (req, res) => {
  const { categoria_id, nombre, descripcion, monto_minimo, retorno_pct, plazo_meses, riesgo, cupos_totales } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const cupos = Number(cupos_totales || 0);
  const info = db
    .prepare(
      `INSERT INTO inversiones_oportunidades
       (tenant_id, categoria_id, nombre, descripcion, monto_minimo, retorno_pct, plazo_meses, riesgo, cupos_totales, cupos_disponibles, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'abierta')`
    )
    .run(req.user.tenant_id, categoria_id || null, nombre, descripcion || '', Number(monto_minimo || 0), Number(retorno_pct || 0), Number(plazo_meses || 12), riesgo || 'medio', cupos, cupos);
  res.status(201).json(db.prepare('SELECT * FROM inversiones_oportunidades WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/oportunidades/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM inversiones_oportunidades WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!existing) return res.status(404).json({ error: 'No encontrada' });
  const b = req.body || {};
  db.prepare(
    `UPDATE inversiones_oportunidades SET categoria_id=?, nombre=?, descripcion=?, monto_minimo=?, retorno_pct=?, plazo_meses=?, riesgo=?, cupos_totales=?, cupos_disponibles=?, estado=? WHERE id=? AND tenant_id=?`
  ).run(
    b.categoria_id ?? existing.categoria_id,
    b.nombre ?? existing.nombre,
    b.descripcion ?? existing.descripcion,
    b.monto_minimo ?? existing.monto_minimo,
    b.retorno_pct ?? existing.retorno_pct,
    b.plazo_meses ?? existing.plazo_meses,
    b.riesgo ?? existing.riesgo,
    b.cupos_totales ?? existing.cupos_totales,
    b.cupos_disponibles ?? existing.cupos_disponibles,
    b.estado ?? existing.estado,
    req.params.id,
    req.user.tenant_id
  );
  res.json(db.prepare('SELECT * FROM inversiones_oportunidades WHERE id = ?').get(req.params.id));
});

router.delete('/oportunidades/:id', (req, res) => {
  const info = db.prepare('DELETE FROM inversiones_oportunidades WHERE id = ? AND tenant_id = ?').run(req.params.id, req.user.tenant_id);
  if (info.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  res.status(204).end();
});

router.get('/interesados', (req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*, o.nombre AS oportunidad_nombre FROM inversiones_interesados i
       LEFT JOIN inversiones_oportunidades o ON o.id = i.oportunidad_id
       WHERE i.tenant_id = ? ORDER BY i.id DESC`
    )
    .all(req.user.tenant_id);
  res.json(rows);
});

router.post('/interesados', (req, res) => {
  const { oportunidad_id, nombre, telefono, email, monto_interes } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const info = db
    .prepare(
      `INSERT INTO inversiones_interesados (tenant_id, oportunidad_id, nombre, telefono, email, monto_interes, estado)
       VALUES (?, ?, ?, ?, ?, ?, 'nuevo')`
    )
    .run(req.user.tenant_id, oportunidad_id || null, nombre, telefono || '', email || '', Number(monto_interes || 0));
  res.status(201).json(db.prepare('SELECT * FROM inversiones_interesados WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/interesados/:id/estado', (req, res) => {
  const row = db.prepare('SELECT * FROM inversiones_interesados WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  const estado = req.body?.estado || row.estado;
  db.prepare('UPDATE inversiones_interesados SET estado = ? WHERE id = ?').run(estado, row.id);
  if (estado === 'confirmado' && row.estado !== 'confirmado' && row.oportunidad_id) {
    db.prepare('UPDATE inversiones_oportunidades SET cupos_disponibles = MAX(cupos_disponibles - 1, 0) WHERE id = ?').run(row.oportunidad_id);
  }
  res.json(db.prepare('SELECT * FROM inversiones_interesados WHERE id = ?').get(row.id));
});

module.exports = router;
