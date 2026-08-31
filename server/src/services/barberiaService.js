const db = require('../db');
const { ServiceError } = require('./errors');

function crearCuenta(tenantId, { cliente_id, barbero_id, items } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ServiceError('La cuenta necesita al menos un ítem');
  }
  if (cliente_id) {
    const cliente = db.prepare('SELECT 1 FROM barberia_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
    if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');
  }
  if (barbero_id) {
    const barbero = db.prepare('SELECT 1 FROM barberia_barberos WHERE id = ? AND tenant_id = ?').get(barbero_id, tenantId);
    if (!barbero) throw new ServiceError('El barbero indicado no existe o no pertenece a tu negocio');
  }

  const total = items.reduce((sum, it) => sum + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0);
  const info = db
    .prepare('INSERT INTO barberia_cuentas (tenant_id, cliente_id, barbero_id, estado, total) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, cliente_id || null, barbero_id || null, 'abierta', total);
  const insertItem = db.prepare(
    'INSERT INTO barberia_cuenta_items (cuenta_id, tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Number(it.cantidad || 1) * Number(it.precio_unitario || 0);
    insertItem.run(info.lastInsertRowid, it.tipo || 'servicio', it.descripcion, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }
  const cuenta = db.prepare('SELECT * FROM barberia_cuentas WHERE id = ?').get(info.lastInsertRowid);
  cuenta.items = db.prepare('SELECT * FROM barberia_cuenta_items WHERE cuenta_id = ?').all(cuenta.id);
  return cuenta;
}

function cobrarCuenta(tenantId, cuentaId, metodoPago) {
  const cuenta = db.prepare('SELECT * FROM barberia_cuentas WHERE id = ? AND tenant_id = ?').get(cuentaId, tenantId);
  if (!cuenta) throw new ServiceError('Cuenta no encontrada', 404);
  const metodo = metodoPago || 'efectivo';
  db.prepare("UPDATE barberia_cuentas SET estado = 'pagada', metodo_pago = ? WHERE id = ?").run(metodo, cuenta.id);
  return db.prepare('SELECT * FROM barberia_cuentas WHERE id = ?').get(cuenta.id);
}

module.exports = { crearCuenta, cobrarCuenta };
