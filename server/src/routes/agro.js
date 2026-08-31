const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');
const agroService = require('../services/agroService');

const router = express.Router();

router.use('/productos', simpleCrud('agro_productos', ['nombre', 'categoria', 'precio', 'stock', 'unidad'], { required: ['nombre'] }));
router.use('/clientes', simpleCrud('agro_clientes', ['nombre', 'finca', 'telefono'], { required: ['nombre'] }));

// ---- Pedidos ----
router.get('/pedidos', (req, res) => {
  const pedidos = db
    .prepare(
      `SELECT p.*, c.nombre AS cliente_nombre FROM agro_pedidos p
       LEFT JOIN agro_clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? ORDER BY p.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM agro_pedido_items WHERE pedido_id = ?');
  for (const p of pedidos) p.items = itemsStmt.all(p.id);
  res.json(pedidos);
});

router.post('/pedidos', (req, res, next) => {
  try {
    const pedido = agroService.crearPedido(req.user.tenant_id, req.body || {});
    res.status(201).json(pedido);
  } catch (err) {
    next(err);
  }
});

router.put('/pedidos/:id/estado', (req, res, next) => {
  try {
    const pedido = agroService.actualizarEstadoPedido(req.user.tenant_id, req.params.id, req.body?.estado);
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

// ---- Cotizador de dron (fumigación / fertilización / mapeo) ----
router.get('/cotizaciones-dron', (req, res) => {
  res.json(db.prepare('SELECT * FROM agro_cotizaciones_dron WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id));
});

router.post('/cotizaciones-dron', (req, res, next) => {
  try {
    const cotizacion = agroService.cotizarDron(req.user.tenant_id, req.body || {});
    res.status(201).json(cotizacion);
  } catch (err) {
    next(err);
  }
});

// ---- Cotizador de cercas eléctricas ----
router.get('/cotizaciones-cerca', (req, res) => {
  res.json(db.prepare('SELECT * FROM agro_cotizaciones_cerca WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id));
});

router.post('/cotizaciones-cerca', (req, res, next) => {
  try {
    const cotizacion = agroService.cotizarCerca(req.user.tenant_id, req.body || {});
    res.status(201).json(cotizacion);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
