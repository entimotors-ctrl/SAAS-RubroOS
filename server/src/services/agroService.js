const db = require('../db');
const { ServiceError } = require('./errors');

const TARIFAS_DRON = { fumigacion: 350, fertilizacion: 300, mapeo: 250 };
const MINIMO_SERVICIO_DRON = 500;
const COSTO_MATERIAL_POR_METRO_POR_HILO = 15;
const COSTO_MANO_OBRA_POR_METRO = 8;

function crearPedido(tenantId, { cliente_id, items } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ServiceError('El pedido necesita al menos un ítem');
  }
  if (cliente_id) {
    const cliente = db.prepare('SELECT 1 FROM agro_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
    if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');
  }
  const productoIds = items.map((it) => it.producto_id).filter((id) => id !== undefined && id !== null);
  if (productoIds.length > 0) {
    const placeholders = productoIds.map(() => '?').join(', ');
    const encontrados = db.prepare(`SELECT id FROM agro_productos WHERE tenant_id = ? AND id IN (${placeholders})`).all(tenantId, ...productoIds);
    if (encontrados.length !== new Set(productoIds).size) {
      throw new ServiceError('Uno de los productos indicados no existe o no pertenece a tu negocio');
    }
  }

  const total = items.reduce((sum, it) => sum + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0);
  const info = db
    .prepare("INSERT INTO agro_pedidos (tenant_id, cliente_id, estado, total) VALUES (?, ?, 'pendiente', ?)")
    .run(tenantId, cliente_id || null, total);
  const insertItem = db.prepare(
    'INSERT INTO agro_pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Number(it.cantidad || 1) * Number(it.precio_unitario || 0);
    insertItem.run(info.lastInsertRowid, it.producto_id || null, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }
  const pedido = db.prepare('SELECT * FROM agro_pedidos WHERE id = ?').get(info.lastInsertRowid);
  pedido.items = db.prepare('SELECT * FROM agro_pedido_items WHERE pedido_id = ?').all(pedido.id);
  return pedido;
}

function actualizarEstadoPedido(tenantId, pedidoId, estado) {
  const pedido = db.prepare('SELECT * FROM agro_pedidos WHERE id = ? AND tenant_id = ?').get(pedidoId, tenantId);
  if (!pedido) throw new ServiceError('Pedido no encontrado', 404);
  db.prepare('UPDATE agro_pedidos SET estado = ? WHERE id = ?').run(estado || pedido.estado, pedido.id);
  return db.prepare('SELECT * FROM agro_pedidos WHERE id = ?').get(pedido.id);
}

function cotizarDron(tenantId, { cliente_nombre, hectareas, tipo_servicio } = {}) {
  const tarifa = TARIFAS_DRON[tipo_servicio];
  if (!tarifa) throw new ServiceError('tipo_servicio debe ser fumigacion, fertilizacion o mapeo');
  const has = Number(hectareas);
  if (!has || has <= 0) throw new ServiceError('Hectáreas inválidas');
  const precio_estimado = Math.max(has * tarifa, MINIMO_SERVICIO_DRON);
  const info = db
    .prepare('INSERT INTO agro_cotizaciones_dron (tenant_id, cliente_nombre, hectareas, tipo_servicio, precio_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, cliente_nombre || null, has, tipo_servicio, precio_estimado);
  return db.prepare('SELECT * FROM agro_cotizaciones_dron WHERE id = ?').get(info.lastInsertRowid);
}

function cotizarCerca(tenantId, { cliente_nombre, metros, hilos } = {}) {
  const m = Number(metros);
  const h = Number(hilos) || 4;
  if (!m || m <= 0) throw new ServiceError('Metros inválidos');
  const precio_estimado = m * h * COSTO_MATERIAL_POR_METRO_POR_HILO + m * COSTO_MANO_OBRA_POR_METRO;
  const info = db
    .prepare('INSERT INTO agro_cotizaciones_cerca (tenant_id, cliente_nombre, metros, hilos, precio_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, cliente_nombre || null, m, h, precio_estimado);
  return db.prepare('SELECT * FROM agro_cotizaciones_cerca WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { crearPedido, actualizarEstadoPedido, cotizarDron, cotizarCerca };
