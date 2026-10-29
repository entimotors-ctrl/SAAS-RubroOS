const db = require('../db');
const { number, money } = require('./validation');
const { ServiceError } = require('./errors');
const { listRows } = require('../utils/crud');

const settings=require('./settings');
const TARIFAS_DRON = { fumigacion: 350, fertilizacion: 300, mapeo: 250 };

async function crearPedido(tenantId, { cliente_id, items } = {}) {
  return db.transaction(async () => {
    if (!Array.isArray(items) || !items.length || items.length > 100) throw new ServiceError('Incluye entre 1 y 100 productos');
    if (cliente_id && !(await db.prepare('SELECT id FROM agro_clientes WHERE id=? AND tenant_id=?').get(cliente_id,tenantId))) throw new ServiceError('Cliente no encontrado');
    const normalized = [];
    for (const it of items) {
      if (!it || !(await db.prepare('SELECT id FROM agro_productos WHERE id=? AND tenant_id=?').get(it.producto_id || null,tenantId))) throw new ServiceError('Producto no encontrado en este negocio');
      const cantidad=number(it.cantidad ?? 1,'Cantidad',0.001);
      const cents=money(it.precio_unitario ?? 0,'Precio');
      normalized.push({...it,cantidad,precio:cents/100,subtotal:Math.round(cantidad*cents)/100});
    }
    const total=normalized.reduce((sum,it)=>sum+Math.round(it.subtotal*100),0)/100;
    const id=(await db.prepare("INSERT INTO agro_pedidos(tenant_id,cliente_id,estado,total) VALUES(?,?,'pendiente',?)").run(tenantId,cliente_id||null,total)).lastInsertRowid;
    for(const it of normalized) await db.prepare('INSERT INTO agro_pedido_items(pedido_id,producto_id,cantidad,precio_unitario,subtotal) VALUES(?,?,?,?,?)').run(id,it.producto_id,it.cantidad,it.precio,it.subtotal);
    return {...(await db.prepare('SELECT * FROM agro_pedidos WHERE id=?').get(id)),items:await db.prepare('SELECT * FROM agro_pedido_items WHERE pedido_id=?').all(id)};
  }).immediate();
}
async function actualizarEstadoPedido(tenantId,pedidoId,estado) {
  return db.transaction(async ()=>{
    const p=await db.prepare('SELECT * FROM agro_pedidos WHERE id=? AND tenant_id=?').get(pedidoId,tenantId);
    if(!p) throw new ServiceError('Pedido no encontrado',404);
    if(!['pendiente','preparando','entregado','cancelado'].includes(estado)) throw new ServiceError('Estado inválido');
    if(p.estado===estado) return p;
    if(['entregado','cancelado','devuelto'].includes(p.estado) || estado==='pendiente') throw new ServiceError('El pedido no permite ese cambio',409);
    if(estado==='entregado') {
      const items=await db.prepare('SELECT producto_id,SUM(cantidad) cantidad FROM agro_pedido_items WHERE pedido_id=? GROUP BY producto_id').all(p.id);
      for(const it of items) {
        const result=await db.prepare('UPDATE agro_productos SET stock=stock-? WHERE id=? AND tenant_id=? AND stock>=?').run(it.cantidad,it.producto_id,tenantId,it.cantidad);
        if(!result.changes) throw new ServiceError('Stock insuficiente o producto no disponible. No se entregó el pedido.',409);
      }
    }
    await db.prepare('UPDATE agro_pedidos SET estado=? WHERE id=?').run(estado,p.id);
    await db.prepare('INSERT INTO business_events(tenant_id,event,entity_id,detail) VALUES(?,?,?,?)').run(tenantId,'agro.pedido.estado',p.id,JSON.stringify({anterior:p.estado,estado}));
    return db.prepare('SELECT * FROM agro_pedidos WHERE id=?').get(p.id);
  }).immediate();
}

async function cotizarDron(tenantId, { cliente_nombre, hectareas, tipo_servicio } = {}) {
  const rates=await settings.get(tenantId);
  const tarifa = Object.hasOwn(TARIFAS_DRON,tipo_servicio)?rates[tipo_servicio]:undefined;
  if (tarifa===undefined) throw new ServiceError('tipo_servicio debe ser fumigacion, fertilizacion o mapeo');
  const has = number(hectareas, 'Hectáreas', 0.001);
  if (!has || has <= 0) throw new ServiceError('Hectáreas inválidas');
  const precio_estimado = Math.round(Math.max(has * tarifa, rates.minimo_dron)*100)/100;
  const info = await db
    .prepare('INSERT INTO agro_cotizaciones_dron (tenant_id, cliente_nombre, hectareas, tipo_servicio, precio_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, cliente_nombre || null, has, tipo_servicio, precio_estimado);
  return db.prepare('SELECT * FROM agro_cotizaciones_dron WHERE id = ?').get(info.lastInsertRowid);
}

async function cotizarCerca(tenantId, { cliente_nombre, metros, hilos } = {}) {
  const m = number(metros, 'Metros', 0.001);
  const h = number(hilos ?? 4, 'Hilos', 1);
  if (!Number.isInteger(h) || h > 20) throw new ServiceError('Hilos debe ser un entero entre 1 y 20');
  if (!m || m <= 0) throw new ServiceError('Metros inválidos');
  const rates=await settings.get(tenantId);
  const precio_estimado = Math.round((m*h*rates.material_cerca+m*rates.mano_obra_cerca)*100)/100;
  const info = await db
    .prepare('INSERT INTO agro_cotizaciones_cerca (tenant_id, cliente_nombre, metros, hilos, precio_estimado) VALUES (?, ?, ?, ?, ?)')
    .run(tenantId, cliente_nombre || null, m, h, precio_estimado);
  return db.prepare('SELECT * FROM agro_cotizaciones_cerca WHERE id = ?').get(info.lastInsertRowid);
}

// ---- Lecturas (reutilizadas por la API REST y por las tools de IA) ----

async function consultarInventario(tenantId) {
  return listRows('agro_productos', tenantId, 'nombre ASC');
}

async function buscarCliente(tenantId, { nombre } = {}) {
  if (!nombre || !nombre.trim()) throw new ServiceError('Indica un nombre para buscar');
  return db.prepare('SELECT * FROM agro_clientes WHERE tenant_id = ? AND nombre LIKE ? ORDER BY nombre LIMIT 20').all(tenantId, `%${nombre.trim()}%`);
}

module.exports = { crearPedido, actualizarEstadoPedido, cotizarDron, cotizarCerca, consultarInventario, buscarCliente };
