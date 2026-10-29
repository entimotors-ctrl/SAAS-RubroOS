const crypto = require('crypto');
const db = require('../db');
const { ServiceError } = require('./errors');

const { number, money } = require('./validation');
async function getSale(tenantId, id) {
  const sale = await db.prepare('SELECT * FROM taller_ventas WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!sale) throw new ServiceError('Venta no encontrada', 404);
  delete sale.request_hash;
  delete sale.request_key;
  sale.items = await db.prepare('SELECT * FROM taller_venta_items WHERE venta_id = ?').all(id);
  return sale;
}

async function registrarVenta(tenantId, input = {}, userId = null) {
  const { cliente_id, tipo = 'contado', items, pagado_inicial = 0, request_key } = input;
  if (!['contado', 'credito'].includes(tipo)) throw new ServiceError('Tipo de venta inválido');
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new ServiceError('La venta necesita entre 1 y 200 ítems');
  if (request_key != null && (typeof request_key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(request_key))) throw new ServiceError('Identificador de solicitud inválido');
  const normalized = items.map(it => {
    if (!it || typeof it.descripcion !== 'string' || !it.descripcion.trim() || it.descripcion.length > 500) throw new ServiceError('Cada ítem necesita una descripción de hasta 500 caracteres');
    const cantidad = number(it.cantidad ?? 1, 'Cantidad', 0.001);
    if (Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 0.00001) throw new ServiceError('Cantidad: usa como máximo tres decimales');
    const unit = money(it.precio_unitario ?? 0, 'Precio');
    const productId = it.producto_id == null ? null : number(it.producto_id, 'Producto', 1);
    if (productId !== null && !Number.isInteger(productId)) throw new ServiceError('Producto inválido');
    const subtotal = Math.round(cantidad * unit);
    if (!Number.isSafeInteger(subtotal)) throw new ServiceError('El importe es demasiado grande');
    return { descripcion: it.descripcion.trim(), cantidad, precio_unitario: unit / 100, subtotal: subtotal / 100, producto_id: productId };
  });
  const totalCents = normalized.reduce((sum, it) => sum + Math.round(it.subtotal * 100), 0);
  if (!Number.isSafeInteger(totalCents) || totalCents > 1e11) throw new ServiceError('El total es demasiado grande');
  const paidCents = tipo === 'contado' ? totalCents : money(pagado_inicial, 'Pago inicial');
  if (paidCents > totalCents) throw new ServiceError('El pago inicial no puede superar el total');
  const clientId = cliente_id == null || cliente_id === '' ? null : number(cliente_id, 'Cliente', 1);
  if (clientId !== null && !Number.isInteger(clientId)) throw new ServiceError('Cliente inválido');
  const hash = crypto.createHash('sha256').update(JSON.stringify({ clientId, tipo, normalized, paidCents })).digest('hex');

  return db.transaction(async () => {
    if (request_key) {
      const existing = await db.prepare('SELECT id, request_hash FROM taller_ventas WHERE tenant_id = ? AND request_key = ?').get(tenantId, request_key);
      if (existing) {
        if (existing.request_hash !== hash) throw new ServiceError('Esta solicitud ya se utilizó para otra venta', 409);
        return getSale(tenantId, existing.id);
      }
    }
    if (clientId && !(await db.prepare('SELECT id FROM taller_clientes WHERE id = ? AND tenant_id = ?').get(clientId, tenantId))) throw new ServiceError('El cliente no existe o no pertenece a tu negocio');
    const saldo = (totalCents - paidCents) / 100;
    const id = (await db.prepare('INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado, request_key, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(tenantId, clientId, tipo, totalCents / 100, paidCents / 100, saldo, saldo === 0 ? 'pagada' : 'credito_abierto', request_key ?? null, hash)).lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal, producto_id) VALUES (?, ?, ?, ?, ?, ?)');
    for (const it of normalized) {
      if (it.producto_id !== null) {
        const product = await db.prepare('SELECT * FROM taller_inventario WHERE id = ? AND tenant_id = ?').get(it.producto_id, tenantId);
        if (!product) throw new ServiceError('El producto no existe o no pertenece a tu negocio');
        if (product.stock < it.cantidad) throw new ServiceError(`Stock insuficiente para ${product.nombre}`, 409);
        const stock = Math.round((product.stock - it.cantidad) * 1000) / 1000;
        await db.prepare('UPDATE taller_inventario SET stock = ? WHERE id = ? AND tenant_id = ?').run(stock, product.id, tenantId);
        await db.prepare('INSERT INTO taller_stock_movimientos (tenant_id, producto_id, venta_id, cantidad, stock_resultante, motivo, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(tenantId, product.id, id, -it.cantidad, stock, 'venta', userId);
      }
      await insertItem.run(id, it.descripcion, it.cantidad, it.precio_unitario, it.subtotal, it.producto_id);
    }
    return getSale(tenantId, id);
  }).immediate();
}

async function registrarAbono(tenantId, ventaId, monto) {
  const cents = money(monto, 'Monto');
  if (cents <= 0) throw new ServiceError('El abono debe ser mayor que cero');
  return db.transaction(async () => {
    const sale = await getSale(tenantId, ventaId);
    if (cents > Math.round(sale.saldo * 100)) throw new ServiceError('El abono no puede superar el saldo');
    await db.prepare('INSERT INTO taller_abonos (tenant_id, venta_id, monto) VALUES (?, ?, ?)').run(tenantId, ventaId, cents / 100);
    const paid = Math.round(sale.pagado * 100) + cents;
    const balance = Math.round(sale.total * 100) - paid;
    await db.prepare('UPDATE taller_ventas SET pagado = ?, saldo = ?, estado = ? WHERE id = ? AND tenant_id = ?').run(paid / 100, balance / 100, balance === 0 ? 'pagada' : 'credito_abierto', ventaId, tenantId);
    return getSale(tenantId, ventaId);
  }).immediate();
}
module.exports = { registrarVenta, registrarAbono, getSale, number, money };
