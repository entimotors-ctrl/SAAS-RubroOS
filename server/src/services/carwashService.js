const db = require('../db');
const { money } = require('./validation');
const { ServiceError } = require('./errors');

async function crearTurno(tenantId, { cliente_id, vehiculo_id, servicio_id, usa_membresia } = {}) {
  if (cliente_id) {
    const cliente = await db.prepare('SELECT 1 FROM carwash_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
    if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');
  }
  if (vehiculo_id) {
    const vehiculo = await db.prepare('SELECT * FROM carwash_vehiculos WHERE id = ? AND tenant_id = ?').get(vehiculo_id, tenantId);
    if (vehiculo && Number(vehiculo.cliente_id) !== Number(cliente_id)) throw new ServiceError('El vehículo no pertenece al cliente seleccionado');
    if (!vehiculo) throw new ServiceError('El vehículo indicado no existe o no pertenece a tu negocio');
  }
  const servicio = servicio_id ? await db.prepare('SELECT * FROM carwash_servicios WHERE id = ? AND tenant_id = ?').get(servicio_id, tenantId) : null;
  if (!servicio) throw new ServiceError('El servicio indicado no existe o no pertenece a tu negocio');

  let precio = servicio ? servicio.precio : 0;
  let usaMembresiaFinal = 0;
  if (usa_membresia && !cliente_id) throw new ServiceError('Selecciona el cliente de la membresía');
  if (usa_membresia && cliente_id) {
    // NOTA Fase 2 (Postgres): business_today() es una función SQL registrada
    // con db.function() (ver services/businessClock.js), solo existe en
    // better-sqlite3. Ver docs/ESTADO-FASE-2-ADAPTADOR-PG.md.
    const membresia = await db
      .prepare("SELECT * FROM carwash_membresias WHERE cliente_id = ? AND tenant_id = ? AND estado = 'activa' AND fecha_renovacion >= business_today(tenant_id)")
      .get(cliente_id, tenantId);
    if (!membresia) throw new ServiceError('El cliente no tiene una membresía vigente');
    if (membresia) {
      precio = 0;
      usaMembresiaFinal = 1;
    }
  }

  const info = await db
    .prepare(
      `INSERT INTO carwash_turnos (tenant_id, cliente_id, vehiculo_id, servicio_id, estado, usa_membresia, precio)
       VALUES (?, ?, ?, ?, 'en_cola', ?, ?)`
    )
    .run(tenantId, cliente_id || null, vehiculo_id || null, servicio_id || null, usaMembresiaFinal, precio);
  return db.prepare('SELECT * FROM carwash_turnos WHERE id = ?').get(info.lastInsertRowid);
}

async function actualizarEstadoTurno(tenantId, turnoId, estado, metodo_pago='efectivo') {
  return db.transaction(async ()=>{
    const turno=await db.prepare('SELECT * FROM carwash_turnos WHERE id=? AND tenant_id=?').get(turnoId,tenantId);
    if(!turno) throw new ServiceError('Turno no encontrado',404);
    const states=['en_cola','lavando','listo','entregado'];
    if(!states.includes(estado)) throw new ServiceError('Estado inválido');
    if(turno.estado===estado) return turno;
    if(states.indexOf(estado)!==states.indexOf(turno.estado)+1) throw new ServiceError('Avanza el lavado en orden: cola, lavando, listo y entrega',409);
    if(estado==='entregado' && !['efectivo','tarjeta','transferencia'].includes(metodo_pago)) throw new ServiceError('Método de pago inválido');
    await db.prepare("UPDATE carwash_turnos SET estado=?, entregado_at=CASE WHEN ?='entregado' THEN datetime('now') ELSE entregado_at END, metodo_pago=CASE WHEN ?='entregado' THEN ? ELSE metodo_pago END WHERE id=?").run(estado,estado,estado,turno.usa_membresia?'membresia':metodo_pago,turno.id);
    return db.prepare('SELECT * FROM carwash_turnos WHERE id=?').get(turno.id);
  }).immediate();
}

async function crearMembresia(tenantId, { cliente_id, plan, precio_mensual } = {}) {
  if (!cliente_id || !plan) throw new ServiceError('Faltan campos: cliente_id, plan');
  const cliente = await db.prepare('SELECT 1 FROM carwash_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
  if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');

  // NOTA Fase 2 (Postgres): business_today() + date(x,'+1 month') — ver nota arriba.
  const info = await db
    .prepare(
      `INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado)
       VALUES (?, ?, ?, ?, business_today(?), date(business_today(?), '+1 month'), 'activa')`
    )
    .run(tenantId, cliente_id, plan, money(precio_mensual ?? 0, 'Precio mensual') / 100,tenantId,tenantId);
  return db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(info.lastInsertRowid);
}

async function renovarMembresia(tenantId, membresiaId) {
  const m = await db.prepare('SELECT * FROM carwash_membresias WHERE id = ? AND tenant_id = ?').get(membresiaId, tenantId);
  if (!m) throw new ServiceError('No encontrada', 404);
  await db.prepare("UPDATE carwash_membresias SET fecha_renovacion = date(MAX(fecha_renovacion,business_today(tenant_id)), '+1 month'), estado = 'activa' WHERE id = ?").run(m.id);
  return db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(m.id);
}

async function cancelarMembresia(tenantId, membresiaId) {
  const m = await db.prepare('SELECT * FROM carwash_membresias WHERE id = ? AND tenant_id = ?').get(membresiaId, tenantId);
  if (!m) throw new ServiceError('No encontrada', 404);
  await db.prepare("UPDATE carwash_membresias SET estado = 'cancelada' WHERE id = ?").run(m.id);
  return db.prepare('SELECT * FROM carwash_membresias WHERE id = ?').get(m.id);
}

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

async function consultarTurnos(tenantId) {
  return db
    .prepare(
      `SELECT t.*, c.nombre AS cliente_nombre, v.placa, s.nombre AS servicio_nombre FROM carwash_turnos t
       LEFT JOIN carwash_clientes c ON c.id = t.cliente_id AND c.tenant_id = t.tenant_id
       LEFT JOIN carwash_vehiculos v ON v.id = t.vehiculo_id AND v.tenant_id = t.tenant_id
       LEFT JOIN carwash_servicios s ON s.id = t.servicio_id AND s.tenant_id = t.tenant_id
       WHERE t.tenant_id = ? AND t.estado IN ('en_cola', 'lavando') ORDER BY t.id ASC`
    )
    .all(tenantId);
}

async function buscarCliente(tenantId, { nombre } = {}) {
  if (!nombre || !nombre.trim()) throw new ServiceError('Indica un nombre para buscar');
  return db.prepare('SELECT * FROM carwash_clientes WHERE tenant_id = ? AND nombre LIKE ? ORDER BY nombre LIMIT 20').all(tenantId, `%${nombre.trim()}%`);
}

module.exports = { crearTurno, actualizarEstadoTurno, crearMembresia, renovarMembresia, cancelarMembresia, consultarTurnos, buscarCliente };
