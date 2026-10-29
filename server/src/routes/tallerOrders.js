const express = require('express');
const service = require('../services/tallerOrders');
const { requireAdmin } = require('../security/access');
const router = express.Router();
const handle = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
router.get('/', handle(async (req, res) => res.json(await service.list(req.user.tenant_id))));
router.get('/:id', handle(async (req, res) => res.json(await service.get(req.user.tenant_id, req.params.id))));
router.use(requireAdmin);
router.post('/', handle(async (req, res) => res.status(201).json(await service.create(req.user.tenant_id, req.user.sub, req.body || {}))));
for (const [path, method] of [['presupuesto', 'quote'], ['estado', 'transition'], ['entregar', 'deliver']]) {
  router.post(`/:id/${path}`, handle(async (req, res) => res.json(await service[method](req.user.tenant_id, req.user.sub, req.params.id, req.body || {}))));
}
module.exports = router;
