const express = require('express');
const db = require('../db');

/**
 * Genera un router REST simple (list/create/update/delete) para una tabla
 * aislada por tenant_id. Para tablas con lógica propia (POS, cotizadores,
 * items anidados) se escriben handlers a mano en el router del rubro.
 *
 * options.required: campos que no pueden quedar vacíos (devuelve 400, no 500).
 * options.refs: { campo: 'tabla_referenciada' } — antes de guardar, verifica
 * que el id referenciado exista Y pertenezca al mismo tenant autenticado.
 * Así una petición manipulada no puede enlazar (ni leer indirectamente vía
 * JOIN) un registro de otro negocio.
 */
function simpleCrud(table, fields, { orderBy = 'id DESC', required = [], refs = {} } = {}) {
  const router = express.Router();
  const cols = fields.join(', ');
  const placeholders = fields.map(() => '?').join(', ');

  function findMissingField(body, existing) {
    for (const field of required) {
      const value = body?.[field] ?? existing?.[field];
      if (value === undefined || value === null || value === '') return field;
    }
    return null;
  }

  function findInvalidRef(body, tenantId) {
    for (const [field, refTable] of Object.entries(refs)) {
      const value = body?.[field];
      if (value === undefined || value === null || value === '') continue;
      const row = db.prepare(`SELECT 1 FROM ${refTable} WHERE id = ? AND tenant_id = ?`).get(value, tenantId);
      if (!row) return field;
    }
    return null;
  }

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY ${orderBy}`).all(req.user.tenant_id);
    res.json(rows);
  });

  router.post('/', (req, res) => {
    const missing = findMissingField(req.body);
    if (missing) return res.status(400).json({ error: `El campo "${missing}" es obligatorio` });
    const invalidRef = findInvalidRef(req.body, req.user.tenant_id);
    if (invalidRef) return res.status(400).json({ error: `El campo "${invalidRef}" no existe o no pertenece a tu negocio` });

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

    const missing = findMissingField(req.body, existing);
    if (missing) return res.status(400).json({ error: `El campo "${missing}" es obligatorio` });
    const invalidRef = findInvalidRef(req.body, req.user.tenant_id);
    if (invalidRef) return res.status(400).json({ error: `El campo "${invalidRef}" no existe o no pertenece a tu negocio` });

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
