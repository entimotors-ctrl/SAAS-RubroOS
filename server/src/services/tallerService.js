const db = require('../db');
const { ServiceError } = require('./errors');
const { listRows } = require('../utils/crud');

/**
 * Lógica de negocio del Taller, reutilizable desde la API REST y, más
 * adelante, desde herramientas de IA / WhatsApp. Siempre recibe tenantId ya
 * resuelto por el llamador (JWT en la web, sesión vinculada en WhatsApp) —
 * nunca confía en un tenant_id que venga en el body.
 */

function registrarVenta(tenantId, { cliente_id, tipo, items, pagado_inicial } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ServiceError('La venta necesita al menos un ítem');
  }
  for (const it of items) {
    if (!it.descripcion || !String(it.descripcion).trim()) throw new ServiceError('Cada ítem necesita una descripción');
    const cantidad = Number(it.cantidad ?? 1);
    const precio = Number(it.precio_unitario ?? 0);
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ServiceError(`Cantidad inválida para "${it.descripcion}": debe ser mayor que 0`);
    if (!Number.isFinite(precio) || precio < 0) throw new ServiceError(`Precio inválido para "${it.descripcion}": no puede ser negativo`);
  }
  if (cliente_id) {
    const cliente = db.prepare('SELECT 1 FROM taller_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
    if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');
  }

  const total = items.reduce((sum, it) => sum + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0);
  const esContado = tipo !== 'credito';
  const pagado = esContado ? total : Number(pagado_inicial || 0);
  const saldo = Math.max(total - pagado, 0);
  const estado = saldo <= 0 ? 'pagada' : 'credito_abierto';

  const info = db
    .prepare('INSERT INTO taller_ventas (tenant_id, cliente_id, tipo, total, pagado, saldo, estado) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenantId, cliente_id || null, esContado ? 'contado' : 'credito', total, pagado, saldo, estado);

  const insertItem = db.prepare(
    'INSERT INTO taller_venta_items (venta_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Number(it.cantidad || 1) * Number(it.precio_unitario || 0);
    insertItem.run(info.lastInsertRowid, it.descripcion, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }

  const venta = db.prepare('SELECT * FROM taller_ventas WHERE id = ?').get(info.lastInsertRowid);
  venta.items = db.prepare('SELECT * FROM taller_venta_items WHERE venta_id = ?').all(venta.id);
  return venta;
}

function registrarAbono(tenantId, ventaId, monto) {
  const venta = db.prepare('SELECT * FROM taller_ventas WHERE id = ? AND tenant_id = ?').get(ventaId, tenantId);
  if (!venta) throw new ServiceError('Venta no encontrada', 404);
  const montoNum = Number(monto || 0);
  if (montoNum <= 0) throw new ServiceError('Monto inválido');

  db.prepare('INSERT INTO taller_abonos (tenant_id, venta_id, monto) VALUES (?, ?, ?)').run(tenantId, venta.id, montoNum);
  const pagado = venta.pagado + montoNum;
  const saldo = Math.max(venta.total - pagado, 0);
  const estado = saldo <= 0 ? 'pagada' : 'credito_abierto';
  db.prepare('UPDATE taller_ventas SET pagado = ?, saldo = ?, estado = ? WHERE id = ?').run(pagado, saldo, estado, venta.id);

  return db.prepare('SELECT * FROM taller_ventas WHERE id = ?').get(venta.id);
}

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

function consultarInventario(tenantId) {
  return listRows('taller_inventario', tenantId, 'nombre ASC');
}

function buscarCliente(tenantId, { nombre } = {}) {
  if (!nombre || !nombre.trim()) throw new ServiceError('Indica un nombre para buscar');
  return db.prepare('SELECT * FROM taller_clientes WHERE tenant_id = ? AND nombre LIKE ? ORDER BY nombre LIMIT 20').all(tenantId, `%${nombre.trim()}%`);
}

module.exports = { registrarVenta, registrarAbono, consultarInventario, buscarCliente };
