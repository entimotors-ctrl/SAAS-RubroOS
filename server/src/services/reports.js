const db=require('../db'),settings=require('./settings'),{date}=require('./validation');
const definitions={
 taller:{sql:'SELECT id,created_at,cliente_id,tipo,total,pagado,saldo,estado FROM taller_ventas WHERE tenant_id=?',stamp:'created_at',amount:'total',label:'Ventas registradas'},
 barberia:{sql:"SELECT id,cobrada_at,barbero_id,total,metodo_pago,comision_total FROM barberia_cuentas WHERE tenant_id=? AND estado='pagada'",stamp:'cobrada_at',amount:'total',label:'Cuentas cobradas'},
 agro:{sql:'SELECT id,created_at,estado,total,pagado,reembolsado,metodo_pago FROM agro_pedidos WHERE tenant_id=?',stamp:'created_at',amount:'total',label:'Pedidos creados'},
 ganaderia:{sql:'SELECT p.id,p.fecha,p.turno,a.arete,p.litros,p.version FROM ganaderia_produccion_leche p JOIN ganaderia_animales a ON a.id=p.animal_id AND a.tenant_id=p.tenant_id WHERE p.tenant_id=?',stamp:'fecha',amount:'litros',label:'Litros registrados'},
 carwash:{sql:"SELECT id,entregado_at,cliente_id,servicio_id,precio,metodo_pago,usa_membresia FROM carwash_turnos WHERE tenant_id=? AND estado='entregado'",stamp:'entregado_at',amount:'precio',label:'Lavados entregados'}
};
function rows(tid,type,from,to){date(from);date(to);const {ServiceError}=require('./errors');if(from>to)throw new ServiceError('Rango de fechas inválido');const d=definitions[type];if(!d)throw new ServiceError('Rubro inválido');const stamp=type==='ganaderia'?'p.fecha':d.stamp;const id=type==='ganaderia'?'p.tenant_id':'tenant_id';const result=db.prepare(d.sql+` AND business_day(${stamp},${id}) BETWEEN ? AND ? ORDER BY ${stamp},${type==='ganaderia'?'p.id':'id'} LIMIT 10001`).all(tid,from,to);if(result.length>10000)throw new ServiceError('El reporte supera 10 000 registros. Selecciona un período menor.');return result;}

function report(tid,type,from,to){const r=rows(tid,type,from,to),d=definitions[type];return {desde:from,hasta:to,zona_horaria:settings.get(tid).timezone,etiqueta:d.label,unidad:type==='ganaderia'?'litros':'L',cantidad:r.length,total:Math.round(r.reduce((a,v)=>a+Number(v[d.amount]),0)*100)/100,rows:r};}
function csv(r){if(!r.length)return '\uFEFFSin registros\r\n';const fields=Object.keys(r[0]);const cell=v=>{let t=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';};return '\uFEFF'+[fields.map(cell).join(','),...r.map(v=>fields.map(k=>cell(v[k])).join(','))].join('\r\n');}
module.exports={report,csv};
