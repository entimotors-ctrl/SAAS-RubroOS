const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../security/access');
const { validateRecord } = require('./recordValidation');

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
/**
 * Lista las filas de una tabla aislada por tenant_id. Extraído de simpleCrud
 * para que las tools de lectura de la IA (server/src/ai) puedan reutilizar
 * exactamente la misma consulta que ya usa la API REST, en vez de
 * duplicarla.
 */
function listRows(table, tenantId, orderBy = 'id DESC') {
  return db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ? ORDER BY ${orderBy}`).all(tenantId);
}

function simpleCrud(table, fields, { orderBy = 'id DESC', required = [], refs = {} } = {}) {
  const router = express.Router();


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
    res.json(listRows(table, req.user.tenant_id, orderBy));
  });

  router.post('/', (req, res) => {
    const missing = findMissingField(req.body);
    if (missing) return res.status(400).json({ error: `El campo "${missing}" es obligatorio` });
    const invalidRef = findInvalidRef(req.body, req.user.tenant_id);
    if (invalidRef) return res.status(400).json({ error: `El campo "${invalidRef}" no existe o no pertenece a tu negocio` });

    const issue = validateRecord(table, req.body || {});
    if (issue) return res.status(400).json({ error: issue });
    const supplied = fields.filter(f => req.body?.[f] !== undefined);
    const cols = supplied.join(', ');
    const placeholders = supplied.map(() => '?').join(', ');
    const values = supplied.map(f => req.body[f]);
    const info = db
      .prepare(`INSERT INTO ${table} (tenant_id${cols ? ", " + cols : ""}) VALUES (?${placeholders ? ", " + placeholders : ""})`)
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

    const issue = validateRecord(table, { ...existing, ...req.body });
    if (issue) return res.status(400).json({ error: issue });
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => (req.body?.[f] ?? existing[f]));
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ? AND tenant_id = ?`).run(...values, req.params.id, req.user.tenant_id);
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json(row);
  });

  router.delete('/:id', requireAdmin, (req, res) => {
    const orderRef = { taller_clientes: 'cliente_id', taller_vehiculos: 'vehiculo_id' }[table];
    if (orderRef && db.prepare(`SELECT id FROM taller_ordenes WHERE tenant_id = ? AND ${orderRef} = ? LIMIT 1`).get(req.user.tenant_id, req.params.id)) {
      return res.status(409).json({ error: 'Este registro tiene órdenes de reparación. Conserva su historial.' });
    }
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`).run(req.params.id, req.user.tenant_id);
    if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
    res.status(204).end();
  });

  return router;
}

module.exports = { simpleCrud, listRows };
