const db = require('../db');
const { ServiceError } = require('./errors');
const { number, money, registrarVenta } = require('./tallerSales');
const transitions = { presupuestada: ['aprobada', 'cancelada'], aprobada: ['en_trabajo', 'cancelada'], en_trabajo: ['lista'], recibida: ['cancelada'] };
function text(value, label, required = true) {
  if (typeof value !== 'string' || value.length > 4000 || (required && !value.trim())) throw new ServiceError(`${label} inválido`);
  return value.trim();
}
function get(tenantId, id) {
  const order = db.prepare(`SELECT o.*, c.nombre AS cliente_nombre, v.placa FROM taller_ordenes o
    JOIN taller_clientes c ON c.id = o.cliente_id AND c.tenant_id = o.tenant_id
    JOIN taller_vehiculos v ON v.id = o.vehiculo_id AND v.tenant_id = o.tenant_id
    WHERE o.id = ? AND o.tenant_id = ?`).get(id, tenantId);
  if (!order) throw new ServiceError('Orden no encontrada', 404);
  order.presupuesto = JSON.parse(order.presupuesto);
  order.eventos = db.prepare('SELECT * FROM taller_orden_eventos WHERE tenant_id = ? AND orden_id = ? ORDER BY id').all(tenantId, id);
  return order;
}
function event(tid, id, uid, type, detail) {
  db.prepare('INSERT INTO taller_orden_eventos (tenant_id, orden_id, user_id, evento, detalle) VALUES (?, ?, ?, ?, ?)').run(tid, id, uid, type, JSON.stringify(detail));
}
function create(tid, uid, data) {
  return db.transaction(() => {
    const car = db.prepare('SELECT * FROM taller_vehiculos WHERE id = ? AND tenant_id = ? AND cliente_id = ?').get(data.vehiculo_id, tid, data.cliente_id);
    const client = db.prepare('SELECT id FROM taller_clientes WHERE id = ? AND tenant_id = ?').get(data.cliente_id, tid);
    if (!car || !client) throw new ServiceError('Selecciona un vehículo que pertenezca al cliente y a tu negocio');
    const id = db.prepare('INSERT INTO taller_ordenes (tenant_id, cliente_id, vehiculo_id, kilometraje, motivo, responsable) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tid, client.id, car.id, number(data.kilometraje ?? 0, 'Kilometraje'), text(data.motivo, 'Motivo'), text(data.responsable ?? '', 'Responsable', false)).lastInsertRowid;
    event(tid, id, uid, 'recepcion', { motivo: data.motivo, kilometraje: data.kilometraje ?? 0 });
    return get(tid, id);
  }).immediate();
}
function checkVersion(order, version) {
  if (version !== order.version) throw new ServiceError('La orden cambió. Actualiza antes de continuar.', 409);
}
function quote(tid, uid, id, data) {
  return db.transaction(() => {
    const order = get(tid, id);
    checkVersion(order, data.version);
    if (!['recibida', 'presupuestada'].includes(order.estado)) throw new ServiceError('No se puede cambiar un presupuesto aprobado', 409);
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 200) throw new ServiceError('Incluye entre 1 y 200 conceptos');
    const items = data.items.map(item => {
      if (!item || typeof item !== 'object') throw new ServiceError('Concepto inválido');
      if (typeof item.descripcion !== 'string' || item.descripcion.length > 500) throw new ServiceError('Descripción: máximo 500 caracteres');
      const product = item.producto_id == null ? null : db.prepare('SELECT id FROM taller_inventario WHERE id = ? AND tenant_id = ?').get(item.producto_id, tid);
      if (item.producto_id != null && !product) throw new ServiceError('Producto ajeno o inexistente');
      const cantidad = number(item.cantidad, 'Cantidad', 0.001);
      if (Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 0.00001) throw new ServiceError('Cantidad: usa hasta tres decimales');
      return { descripcion: text(item.descripcion, 'Descripción'), cantidad, precio_unitario: money(item.precio_unitario, 'Precio') / 100, ...(product ? { producto_id: product.id } : {}) };
    });
    const cents = items.reduce((sum, it) => sum + Math.round(it.cantidad * it.precio_unitario * 100), 0);
    if (!Number.isSafeInteger(cents) || cents > 1e11) throw new ServiceError('El presupuesto es demasiado grande');
    db.prepare("UPDATE taller_ordenes SET presupuesto = ?, diagnostico = ?, estado = 'presupuestada', version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(JSON.stringify(items), text(data.diagnostico, 'Diagnóstico'), id, tid);
    event(tid, id, uid, 'presupuesto', { version: order.version + 1, items, diagnostico: data.diagnostico });
    return get(tid, id);
  }).immediate();
}
function transition(tid, uid, id, data) {
  return db.transaction(() => {
    const order = get(tid, id);
    checkVersion(order, data.version);
    if (!transitions[order.estado]?.includes(data.estado)) throw new ServiceError('Cambio de estado no permitido', 409);
    const note = text(data.nota ?? '', 'Nota', ['aprobada', 'cancelada'].includes(data.estado));
    db.prepare("UPDATE taller_ordenes SET estado = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(data.estado, id, tid);
    event(tid, id, uid, data.estado, { nota: note, presupuesto_version: order.version });
    return get(tid, id);
  }).immediate();
}
function deliver(tid, uid, id, data) {
  return db.transaction(() => {
    const order = get(tid, id);
    // A retry returns the original delivery and cannot create another sale.
    if (order.estado === 'entregada') return order;
    checkVersion(order, data.version);
    if (order.estado !== 'lista') throw new ServiceError('La orden debe estar lista para entregar', 409);
    const sale = registrarVenta(tid, { cliente_id: order.cliente_id, tipo: data.tipo ?? 'contado', pagado_inicial: data.pagado_inicial ?? 0, items: order.presupuesto, request_key: `repair-order-${id}` }, uid);
    db.prepare("UPDATE taller_ordenes SET estado = 'entregada', venta_id = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(sale.id, id, tid);
    event(tid, id, uid, 'entrega', { venta_id: sale.id, total: sale.total, saldo: sale.saldo });
    return get(tid, id);
  }).immediate();
}
function list(tid) {
  return db.prepare(`SELECT o.id FROM taller_ordenes o WHERE o.tenant_id = ? ORDER BY o.id DESC LIMIT 200`).all(tid).map(o => get(tid, o.id));
}
module.exports = { get, create, quote, transition, deliver, list };
