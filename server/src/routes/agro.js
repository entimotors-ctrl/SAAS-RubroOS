const express = require('express');
const db = require('../db');
const { simpleCrud } = require('../utils/crud');

const router = express.Router();

router.use('/productos', simpleCrud('agro_productos', ['nombre', 'categoria', 'precio', 'stock', 'unidad']));
router.use('/clientes', simpleCrud('agro_clientes', ['nombre', 'finca', 'telefono']));

// ---- Pedidos ----
router.get('/pedidos', (req, res) => {
  const pedidos = db
    .prepare(
      `SELECT p.*, c.nombre AS cliente_nombre FROM agro_pedidos p
       LEFT JOIN agro_clientes c ON c.id = p.cliente_id
       WHERE p.tenant_id = ? ORDER BY p.id DESC`
    )
    .all(req.user.tenant_id);
  const itemsStmt = db.prepare('SELECT * FROM agro_pedido_items WHERE pedido_id = ?');
  for (const p of pedidos) p.items = itemsStmt.all(p.id);
  res.json(pedidos);
});

router.post('/pedidos', (req, res) => {
  const { cliente_id, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'El pedido necesita al menos un ítem' });
  const total = items.reduce((sum, it) => sum + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0);
  const info = db
    .prepare("INSERT INTO agro_pedidos (tenant_id, cliente_id, estado, total) VALUES (?, ?, 'pendiente', ?)")
    .run(req.user.tenant_id, cliente_id || null, total);
  const insertItem = db.prepare(
    'INSERT INTO agro_pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Number(it.cantidad || 1) * Number(it.precio_unitario || 0);
    insertItem.run(info.lastInsertRowid, it.producto_id || null, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }
  const pedido = db.prepare('SELECT * FROM agro_pedidos WHERE id = ?').get(info.lastInsertRowid);
  pedido.items = db.prepare('SELECT * FROM agro_pedido_items WHERE pedido_id = ?').all(pedido.id);
  res.status(201).json(pedido);
});

router.put('/pedidos/:id/estado', (req, res) => {
  const pedido = db.prepare('SELECT * FROM agro_pedidos WHERE id = ? AND tenant_id = ?').get(req.params.id, req.user.tenant_id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  db.prepare('UPDATE agro_pedidos SET estado = ? WHERE id = ?').run(req.body?.estado || pedido.estado, pedido.id);
  res.json(db.prepare('SELECT * FROM agro_pedidos WHERE id = ?').get(pedido.id));
});

// ---- Cotizador de dron (fumigación / fertilización / mapeo) ----
const TARIFAS_DRON = { fumigacion: 350, fertilizacion: 300, mapeo: 250 };
const MINIMO_SERVICIO_DRON = 500;

router.get('/cotizaciones-dron', (req, res) => {
  res.json(db.prepare('SELECT * FROM agro_cotizaciones_dron WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id));
});

router.post('/cotizaciones-dron', (req, res) => {
  const { cliente_nombre, hectareas, tipo_servicio } = req.body || {};
  const tarifa = TARIFAS_DRON[tipo_servicio];
  if (!tarifa) return res.status(400).json({ error: 'tipo_servicio debe ser fumigacion, fertilizacion o mapeo' });
  const has = Number(hectareas);
  if (!has || has <= 0) return res.status(400).json({ error: 'Hectáreas inválidas' });
  const precio_estimado = Math.max(has * tarifa, MINIMO_SERVICIO_DRON);
  const info = db
    .prepare('INSERT INTO agro_cotizaciones_dron (tenant_id, cliente_nombre, hectareas, tipo_servicio, precio_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.tenant_id, cliente_nombre || null, has, tipo_servicio, precio_estimado);
  res.status(201).json(db.prepare('SELECT * FROM agro_cotizaciones_dron WHERE id = ?').get(info.lastInsertRowid));
});

// ---- Cotizador de cercas eléctricas ----
const COSTO_MATERIAL_POR_METRO_POR_HILO = 15;
const COSTO_MANO_OBRA_POR_METRO = 8;

router.get('/cotizaciones-cerca', (req, res) => {
  res.json(db.prepare('SELECT * FROM agro_cotizaciones_cerca WHERE tenant_id = ? ORDER BY id DESC').all(req.user.tenant_id));
});

router.post('/cotizaciones-cerca', (req, res) => {
  const { cliente_nombre, metros, hilos } = req.body || {};
  const m = Number(metros);
  const h = Number(hilos) || 4;
  if (!m || m <= 0) return res.status(400).json({ error: 'Metros inválidos' });
  const precio_estimado = m * h * COSTO_MATERIAL_POR_METRO_POR_HILO + m * COSTO_MANO_OBRA_POR_METRO;
  const info = db
    .prepare('INSERT INTO agro_cotizaciones_cerca (tenant_id, cliente_nombre, metros, hilos, precio_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.tenant_id, cliente_nombre || null, m, h, precio_estimado);
  res.status(201).json(db.prepare('SELECT * FROM agro_cotizaciones_cerca WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
