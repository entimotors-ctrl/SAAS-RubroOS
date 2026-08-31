const express = require('express');
const db = require('../db');
const { BUSINESS_TYPES } = require('../business-types');

const router = express.Router();

const PLAN_PRECIOS = { trial: 0, starter: 590, pro: 990, business: 1590 };

router.get('/overview', (req, res) => {
  const tenants = db.prepare('SELECT * FROM tenants').all();
  const totalTenants = tenants.length;
  const mrr = tenants.reduce((sum, t) => sum + (t.status === 'activo' ? PLAN_PRECIOS[t.plan] || 0 : 0), 0);

  const porRubro = BUSINESS_TYPES.map((bt) => ({
    business_type: bt.id,
    label: bt.label,
    total: tenants.filter((t) => t.business_type === bt.id).length,
  }));

  const porEstado = ['trial', 'activo', 'suspendido'].map((estado) => ({
    estado,
    total: tenants.filter((t) => t.status === estado).length,
  }));

  const recientes = [...tenants].sort((a, b) => b.id - a.id).slice(0, 8);

  res.json({ totalTenants, mrr, porRubro, porEstado, recientes });
});

router.get('/tenants', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS usuarios,
              (SELECT email FROM users u WHERE u.tenant_id = t.id ORDER BY u.id LIMIT 1) AS admin_email
       FROM tenants t ORDER BY t.id DESC`
    )
    .all();
  res.json(rows);
});

router.put('/tenants/:id', (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'No encontrado' });
  const plan = req.body?.plan ?? tenant.plan;
  const status = req.body?.status ?? tenant.status;
  db.prepare('UPDATE tenants SET plan = ?, status = ? WHERE id = ?').run(plan, status, tenant.id);
  res.json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id));
});

router.get('/business-types', (req, res) => {
  res.json(BUSINESS_TYPES);
});

module.exports = router;
