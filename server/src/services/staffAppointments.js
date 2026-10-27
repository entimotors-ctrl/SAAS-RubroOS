const db=require('../db'),{ServiceError}=require('./errors'),{date}=require('./validation'),settings=require('./settings'),{event}=require('./staffService');
function selectedBarber(context,requested){
  if(context.business_type!=='barberia')throw new ServiceError('Este panel es exclusivo de barbería',403);
  const value=context.role==='tenant_admin'?Number(requested):db.prepare('SELECT barbero_id FROM staff_profiles WHERE user_id=? AND tenant_id=?').get(context.sub,context.tenant_id)?.barbero_id;
  if(!value)return null;
  if(!db.prepare('SELECT id FROM barberia_barberos WHERE id=? AND tenant_id=? AND activo=1').get(value,context.tenant_id))throw new ServiceError('Barbero no disponible',403);return value;
}
function list(context,day,requested){
  const tid=context.tenant_id,fecha=date(day||settings.day(tid)),id=selectedBarber(context,requested);
  if(!id)return {fecha,today:settings.day(tid),timezone:settings.get(tid).timezone,appointments:[],barbero_id:null};
  const appointments=db.prepare(`SELECT c.id,c.fecha,c.hora,c.estado,c.version,c.llamada_at,c.iniciada_at,c.finalizada_at,c.duracion_min,COALESCE(cl.nombre,'Sin nombre') cliente_nombre,s.nombre servicio_nombre,b.nombre barbero_nombre FROM barberia_citas c LEFT JOIN barberia_clientes cl ON cl.id=c.cliente_id AND cl.tenant_id=c.tenant_id LEFT JOIN barberia_servicios s ON s.id=c.servicio_id AND s.tenant_id=c.tenant_id JOIN barberia_barberos b ON b.id=c.barbero_id AND b.tenant_id=c.tenant_id WHERE c.tenant_id=? AND c.barbero_id=? AND c.fecha=? ORDER BY c.hora,c.id`).all(tid,id,fecha);
  return {fecha,today:settings.day(tid),timezone:settings.get(tid).timezone,barbero_id:id,appointments};
}
function action(context,id,data){return db.transaction(()=>{
  const tid=context.tenant_id,barber=selectedBarber(context,data.barbero_id);
  const row=db.prepare('SELECT * FROM barberia_citas WHERE id=? AND tenant_id=? AND barbero_id=?').get(id,tid,barber||0);
  if(!row)throw new ServiceError('Cita no encontrada',404);
  const states={llamar:'llamada',iniciar:'en_servicio',finalizar:'completada',no_asistio:'no_asistio'};
  const next=states[data.action];if(!next)throw new ServiceError('Acción inválida');
  if(row.estado===next)return {id:row.id,estado:row.estado,version:row.version};
  if(Number(data.version)!==row.version)throw new ServiceError('La cita cambió. Actualiza el panel.',409);
  if(row.fecha!==settings.day(tid))throw new ServiceError('Solo puedes atender las citas de hoy',409);
  const transitions={pendiente:['llamada','en_servicio','no_asistio'],confirmada:['llamada','en_servicio','no_asistio'],llamada:['en_servicio','no_asistio'],en_servicio:['completada']};
  if(!(transitions[row.estado]||[]).includes(next))throw new ServiceError('La cita no permite esta acción',409);
  if(['llamada','en_servicio'].includes(next)&&db.prepare("SELECT id FROM barberia_citas WHERE tenant_id=? AND barbero_id=? AND fecha=? AND id!=? AND estado IN ('llamada','en_servicio')").get(tid,barber,row.fecha,id))throw new ServiceError('Termina la atención actual antes de llamar al siguiente',409);
  db.prepare("UPDATE barberia_citas SET estado=?,version=version+1,llamada_at=CASE WHEN ?='llamada' THEN datetime('now') ELSE llamada_at END,iniciada_at=CASE WHEN ?='en_servicio' THEN datetime('now') ELSE iniciada_at END,finalizada_at=CASE WHEN ? IN ('completada','no_asistio') THEN datetime('now') ELSE finalizada_at END WHERE id=?").run(next,next,next,next,id);
  event(tid,context.sub,'cita',Number(id),'cita.'+data.action,{antes:row.estado,despues:next});
  return {id:row.id,estado:next,version:row.version+1};
}).immediate();}
function next(context,data){return db.transaction(()=>{
  const id=selectedBarber(context,data.barbero_id),tid=context.tenant_id;
  const row=db.prepare("SELECT id,version FROM barberia_citas WHERE tenant_id=? AND barbero_id=? AND fecha=? AND estado IN ('pendiente','confirmada') ORDER BY hora,id LIMIT 1").get(tid,id||0,settings.day(tid));
  if(!row)throw new ServiceError('No quedan citas pendientes para hoy',409);
  return action(context,row.id,{action:'llamar',version:row.version,barbero_id:id});
}).immediate();}
module.exports={list,action,next};
