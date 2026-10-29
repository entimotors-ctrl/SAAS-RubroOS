const db = require('../db');
const {money,number}=require('./validation');
const { ServiceError } = require('./errors');

async function crearCuenta(tenantId, data = {}) {
  let { cliente_id, barbero_id, cita_id: citaId, items } = data;
  let cita = null;
  if (citaId !== undefined && citaId !== null && citaId !== '') {
    cita = await db.prepare(`SELECT c.id,c.cliente_id,c.barbero_id,c.servicio_id,c.estado,
      s.nombre servicio_nombre,s.precio servicio_precio
      FROM barberia_citas c JOIN barberia_servicios s ON s.id=c.servicio_id AND s.tenant_id=c.tenant_id
      WHERE c.id=? AND c.tenant_id=?`).get(citaId,tenantId);
    if (!cita) throw new ServiceError('La cita no existe o no pertenece a tu negocio',404);
    if (cita.estado !== 'completada') throw new ServiceError('Solo puedes cobrar una cita terminada',409);
    if (await db.prepare('SELECT id FROM barberia_cuentas WHERE tenant_id=? AND cita_id=?').get(tenantId,cita.id)) {
      throw new ServiceError('Esta cita ya tiene una cuenta asociada',409);
    }
    cliente_id=cita.cliente_id;
    barbero_id=cita.barbero_id;
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ServiceError('La cuenta necesita al menos un ítem');
  }
  for (const it of items) {
    if (!it.descripcion || !String(it.descripcion).trim()) throw new ServiceError('Cada ítem necesita una descripción');
    const cantidad = number(it.cantidad ?? 1,'Cantidad',0.001);
    const precio = money(it.precio_unitario ?? 0,'Precio')/100;
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ServiceError(`Cantidad inválida para "${it.descripcion}": debe ser mayor que 0`);
    if (!Number.isFinite(precio) || precio < 0) throw new ServiceError(`Precio inválido para "${it.descripcion}": no puede ser negativo`);
  }
  if (cita) {
    const precioServicio=money(cita.servicio_precio,'Precio')/100;
    const incluyeServicio=items.some(it=>it.tipo==='servicio' && String(it.descripcion).trim()===cita.servicio_nombre && Number(it.cantidad??1)===1 && money(it.precio_unitario??0,'Precio')/100===precioServicio);
    if (!incluyeServicio) throw new ServiceError('La cuenta debe incluir el servicio programado en la cita',409);
  }
  if (cliente_id) {
    const cliente = await db.prepare('SELECT 1 FROM barberia_clientes WHERE id = ? AND tenant_id = ?').get(cliente_id, tenantId);
    if (!cliente) throw new ServiceError('El cliente indicado no existe o no pertenece a tu negocio');
  }
  if (barbero_id) {
    const barbero = await db.prepare('SELECT 1 FROM barberia_barberos WHERE id = ? AND tenant_id = ?').get(barbero_id, tenantId);
    if (!barbero) throw new ServiceError('El barbero indicado no existe o no pertenece a tu negocio');
  }

  return db.transaction(async () => {
  const total = items.reduce((sum, it) => sum + Math.round(Number(it.cantidad || 1) * money(it.precio_unitario ?? 0,'Precio'))/100, 0);
  const info = await db
    .prepare('INSERT INTO barberia_cuentas (tenant_id, cliente_id, barbero_id, cita_id, estado, total) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tenantId, cliente_id || null, barbero_id || null, cita?.id || null, 'abierta', total);
  const insertItem = db.prepare(
    'INSERT INTO barberia_cuenta_items (cuenta_id, tipo, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    const subtotal = Math.round(Number(it.cantidad || 1)*money(it.precio_unitario ?? 0,'Precio'))/100;
    await insertItem.run(info.lastInsertRowid, it.tipo || 'servicio', it.descripcion, it.cantidad || 1, it.precio_unitario || 0, subtotal);
  }
  const cuenta = await db.prepare('SELECT * FROM barberia_cuentas WHERE id = ?').get(info.lastInsertRowid);
  cuenta.items = await db.prepare('SELECT * FROM barberia_cuenta_items WHERE cuenta_id = ?').all(cuenta.id);
  return cuenta;
  }).immediate();
}

async function cobrarCuenta(tenantId, cuentaId, metodoPago) {
  const metodo=metodoPago||'efectivo';
  if(!['efectivo','tarjeta','transferencia'].includes(metodo))throw new ServiceError('Método de pago inválido');
  return db.transaction(async ()=>{
    const cuenta=await db.prepare('SELECT * FROM barberia_cuentas WHERE id=? AND tenant_id=?').get(cuentaId,tenantId);
    if(!cuenta)throw new ServiceError('Cuenta no encontrada',404);
    if(cuenta.estado==='pagada')return cuenta;
    const barber=await db.prepare('SELECT comision_porcentaje FROM barberia_barberos WHERE id=? AND tenant_id=?').get(cuenta.barbero_id,tenantId);
    const services=(await db.prepare("SELECT COALESCE(SUM(subtotal),0) AS total FROM barberia_cuenta_items WHERE cuenta_id=? AND tipo='servicio'").get(cuentaId)).total;
    const commission=Math.round(services*(barber?.comision_porcentaje||0))/100;
    await db.prepare("UPDATE barberia_cuentas SET estado='pagada',metodo_pago=?,comision_total=?,cobrada_at=datetime('now') WHERE id=? AND tenant_id=?").run(metodo,commission,cuentaId,tenantId);
    return db.prepare('SELECT * FROM barberia_cuentas WHERE id=? AND tenant_id=?').get(cuentaId,tenantId);
  }).immediate();
}

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

async function consultarCitas(tenantId, { desde } = {}) {
  const fechaDesde = desde || new Date().toISOString().slice(0, 10);
  return db
    .prepare(
      `SELECT c.*, cl.nombre AS cliente_nombre, b.nombre AS barbero_nombre, s.nombre AS servicio_nombre
       FROM barberia_citas c
       LEFT JOIN barberia_clientes cl ON cl.id = c.cliente_id AND cl.tenant_id = c.tenant_id
       LEFT JOIN barberia_barberos b ON b.id = c.barbero_id AND b.tenant_id = c.tenant_id
       LEFT JOIN barberia_servicios s ON s.id = c.servicio_id AND s.tenant_id = c.tenant_id
       WHERE c.tenant_id = ? AND c.fecha >= ? ORDER BY c.fecha ASC, c.hora ASC LIMIT 50`
    )
    .all(tenantId, fechaDesde);
}

async function buscarCliente(tenantId, { nombre } = {}) {
  if (!nombre || !nombre.trim()) throw new ServiceError('Indica un nombre para buscar');
  return db.prepare('SELECT * FROM barberia_clientes WHERE tenant_id = ? AND nombre LIKE ? ORDER BY nombre LIMIT 20').all(tenantId, `%${nombre.trim()}%`);
}

async function cerrarCuenta(tenantId,body) {
 const {request_key,...data}=body;
 if(typeof request_key!=='string'||request_key.length<8||request_key.length>100)throw new ServiceError('Clave de operación inválida');
 const payload=JSON.stringify(data);
 return db.transaction(async ()=>{
  const old=await db.prepare("SELECT * FROM operation_requests WHERE tenant_id=? AND scope='barberia.cobro' AND request_key=?").get(tenantId,request_key);
  if(old){if(old.payload!==payload)throw new ServiceError('La operación ya se procesó con otros datos',409);return db.prepare('SELECT * FROM barberia_cuentas WHERE id=? AND tenant_id=?').get(old.result_id,tenantId);}
  const created=await crearCuenta(tenantId,data);
  const paid=await cobrarCuenta(tenantId,created.id,data.metodo_pago);
  await db.prepare("INSERT INTO operation_requests(tenant_id,scope,request_key,payload,result_id) VALUES(?,'barberia.cobro',?,?,?)").run(tenantId,request_key,payload,paid.id);
  return paid;
 }).immediate();
}
module.exports = { cerrarCuenta, crearCuenta, cobrarCuenta, consultarCitas, buscarCliente };
