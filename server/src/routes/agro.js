const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');
const agroService = require('../services/agroService');

const router = express.Router();

router.use('/productos', simpleCrud('agro_productos', ['nombre', 'categoria', 'precio', 'stock', 'unidad'], { required: ['nombre'] }));
router.use('/clientes', simpleCrud('agro_clientes', ['nombre', 'finca', 'telefono'], { required: ['nombre'] }));

// ---- Pedidos ----
router.get('/pedidos', async (req, res) => {
  const pedidos = await db
    .prepare(
      `SELECT p.*, c.nombre AS cliente_nombre FROM agro_pedidos p
       LEFT JOIN agro_clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
       WHERE p.tenant_id = ? ORDER BY p.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM agro_pedido_items WHERE pedido_id = ?');
  for (const p of pedidos) p.items = await itemsStmt.all(p.id);
  res.json(pedidos);
});

router.post('/pedidos', async (req, res, next) => {
  try {
    const pedido = await agroService.crearPedido(req.user.tenant_id, req.body || {});
    res.status(201).json(pedido);
  } catch (err) {
    next(err);
  }
});

router.put('/pedidos/:id/estado', async (req, res, next) => {
  try {
    const pedido = await agroService.actualizarEstadoPedido(req.user.tenant_id, req.params.id, req.body?.estado);
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

// ---- Cotizador de dron (fumigación / fertilización / mapeo) ----
router.get('/cotizaciones-dron', async (req, res) => {
  res.json(await db.prepare('SELECT * FROM agro_cotizaciones_dron WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id));
});

router.post('/cotizaciones-dron', async (req, res, next) => {
  try {
    const cotizacion = await agroService.cotizarDron(req.user.tenant_id, req.body || {});
    res.status(201).json(cotizacion);
  } catch (err) {
    next(err);
  }
});

// ---- Cotizador de cercas eléctricas ----
router.get('/cotizaciones-cerca', async (req, res) => {
  res.json(await db.prepare('SELECT * FROM agro_cotizaciones_cerca WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id));
});

router.post('/cotizaciones-cerca', async (req, res, next) => {
  try {
    const cotizacion = await agroService.cotizarCerca(req.user.tenant_id, req.body || {});
    res.status(201).json(cotizacion);
  } catch (err) {
    next(err);
  }
});

const {requireAdmin}=require('../security/access');
router.post('/pedidos/:id/cobrar',requireAdmin,async (req,res)=>res.json(await require('../services/agroPayments').collect(req.user.tenant_id,req.params.id,req.body?.metodo_pago,req.user.sub)));
router.post('/pedidos/:id/devolver',requireAdmin,async (req,res)=>res.json(await require('../services/agroPayments').refund(req.user.tenant_id,req.params.id,req.body?.motivo,req.user.sub)));
module.exports = router;
