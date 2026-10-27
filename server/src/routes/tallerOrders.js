const express = require('express');
const service = require('../services/tallerOrders');
const { requireAdmin } = require('../security/access');
const router = express.Router();
const handle = fn => (req, res, next) => { try { fn(req, res); } catch (e) { next(e); } };
router.get('/', handle((req, res) => res.json(service.list(req.user.tenant_id))));
router.get('/:id', handle((req, res) => res.json(service.get(req.user.tenant_id, req.params.id))));
router.use(requireAdmin);
router.post('/', handle((req, res) => res.status(201).json(service.create(req.user.tenant_id, req.user.sub, req.body || {}))));
for (const [path, method] of [['presupuesto', 'quote'], ['estado', 'transition'], ['entregar', 'deliver']]) {
  router.post(`/:id/${path}`, handle((req, res) => res.json(service[method](req.user.tenant_id, req.user.sub, req.params.id, req.body || {}))));
}
module.exports = router;
