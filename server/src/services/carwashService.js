const db = require('../db');
const { ServiceError } = require('./errors');

function crearTurno(tenantId, { cliente_id, vehiculo_id, servicio_id, usa_membresia } = {}) {
  if (cliente_id) {
    const cliente = db.prepare('SELECT 1 FROM carwash_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
    if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');
  }
  if (vehiculo_id) {
    const vehiculo = db.prepare('SELECT 1 FROM carwash_vehiculos WHERE id = ? AND tenant_id = ?').get(vehiculo_id, tenantId);
    if (!vehiculo) throw new ServiceError('El vehículo indicado no existe o no pertenece a tu negocio');
  }
  const servicio = servicio_id ? db.prepare('SELECT * FROM carwash_servicios WHERE id = ? AND tenant_id = ?').get(servicio_id, tenantId) : null;
  if (servicio_id && !servicio) throw new ServiceError('El servicio indicado no existe o no pertenece a tu negocio');

  let precio = servicio ? servicio.precio : 0;
  let usaMembresiaFinal = 0;
  if (usa_membresia && cliente_id) {
    const membresia = db
      .prepare("SELECT * FROM carwash_membresias WHERE cliente_id = ? AND tenant_id = ? AND estado = 'activa' AND fecha_renovacion >= date('now')")
      .get(cliente_id, tenantId);
    if (membresia) {
      precio = 0;
      usaMembresiaFinal = 1;
    }
  }

  const info = db
    .prepare(
      `INSERT INTO carwash_turnos (tenant_id, cliente_id, vehiculo_id, servicio_id, estado, usa_membresia, precio)
       VALUES (?, ?, ?, ?, 'en_cola', ?, ?)`
    )
    .run(tenantId, cliente_id || null, vehiculo_id || null, servicio_id || null, usaMembresiaFinal, precio);
  return db.prepare('SELECT * FROM carwash_turnos WHERE id = ?').get(info.lastInsertRowid);
}

function actualizarEstadoTurno(tenantId, turnoId, estado) {
  const turno = db.prepare('SELECT * FROM carwash_turnos WHERE id = ? AND tenant_id = ?').get(turnoId, tenantId);
  if (!turno) throw new ServiceError('Turno no encontrado', 404);
  if (!['en_cola', 'lavando', 'listo', 'entregado'].includes(estado)) throw new ServiceError('Estado inválido');
  db.prepare('UPDATE carwash_turnos SET estado = ? WHERE id = ?').run(estado, turno.id);
  return db.prepare('SELECT * FROM carwash_turnos WHERE id = ?').get(turno.id);
}

function crearMembresia(tenantId, { cliente_id, plan, precio_mensual } = {}) {
  if (!cliente_id || !plan) throw new ServiceError('Faltan campos: cliente_id, plan');
  const cliente = db.prepare('SELECT 1 FROM carwash_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
  if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');

  const info = db
    .prepare(
      `INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado)
       VALUES (?, ?, ?, ?, date('now'), date('now', '+1 month'), 'activa')`
    )
    .run(tenantId, cliente_id, plan, Number(precio_mensual || 0));
  return db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(info.lastInsertRowid);
}

function renovarMembresia(tenantId, membresiaId) {
  const m = db.prepare('SELECT * FROM carwash_membresias WHERE id = ? AND tenant_id = ?').get(membresiaId, tenantId);
  if (!m) throw new ServiceError('No encontrada', 404);
  db.prepare("UPDATE carwash_membresias SET fecha_renovacion = date(fecha_renovacion, '+1 month'), estado = 'activa' WHERE id = ?").run(m.id);
  return db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(m.id);
}

function cancelarMembresia(tenantId, membresiaId) {
  const m = db.prepare('SELECT * FROM carwash_membresias WHERE id = ? AND tenant_id = ?').get(membresiaId, tenantId);
  if (!m) throw new ServiceError('No encontrada', 404);
  db.prepare("UPDATE carwash_membresias SET estado = 'cancelada' WHERE id = ?").run(m.id);
  return db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(m.id);
}

module.exports = { crearTurno, actualizarEstadoTurno, crearMembresia, renovarMembresia, cancelarMembresia };
