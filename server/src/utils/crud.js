const express = require('express');
const db = require('../db');

/**
 * Genera un router REST simple (list/create/update/delete) para una tabla
 * aislada por tenant_id. Para tablas con lógica propia (POS, cotizadores,
 * items anidados) se escriben handlers a mano en el router del rubro.
 */
function simpleCrud(table, fields, { orderBy = 'id DESC' } = {}) {
  const router = express.Router();
  const cols = fields.join(', ');
  const placeholders = fields.map(() => '?').join(', ');

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY ${orderBy}`).all(req.user.tenant_id);
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const values = fields.map((f) => (req.body?.[f] ?? null));
    const info = db
      .prepare(`INSERT INTO ${table} (tenant_id, ${cols}) VALUES (?, ${placeholders})`)
      .run(req.user.tenant_id, ...values);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json(row);
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`).get(req.params.id, req.user.tenant_id);
    if (!existing) return res.status(404).json({ error: 'No encontrado' });
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => (req.body?.[f] ?? existing[f]));
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ? AND tenant_id = ?`).run(...values, req.params.id, req.user.tenant_id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json(row);
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`).run(req.params.id, req.user.tenant_id);
    if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
    res.status(204).end();
  });

  return router;
}

module.exports = { simpleCrud };
