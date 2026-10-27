const db=require('../db');
const {ServiceError}=require('./errors');
const {date}=require('./validation');
const availability=require('./barberiaAvailability');
function save(tid,data,id=null){return db.transaction(()=>{
 const existing=id?db.prepare('SELECT * FROM barberia_citas WHERE tenant_id=? AND id=?').get(tid,id):null;
 if(id&&!existing)throw new ServiceError('Cita no encontrada',404);
 const d={estado:'pendiente',...existing,...data};date(d.fecha);
 if(typeof d.hora!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora))throw new ServiceError('Hora inválida');
 if(!['pendiente','confirmada','llamada','en_servicio','completada','cancelada','no_asistio'].includes(d.estado))throw new ServiceError('Estado inválido');
 const barber=db.prepare('SELECT * FROM barberia_barberos WHERE id=? AND tenant_id=? AND activo=1').get(d.barbero_id,tid);
 const service=db.prepare('SELECT * FROM barberia_servicios WHERE id=? AND tenant_id=?').get(d.servicio_id,tid);
 if(!barber||!service)throw new ServiceError('Selecciona un barbero activo y un servicio de tu negocio');
 if(d.cliente_id&&!db.prepare('SELECT id FROM barberia_clientes WHERE id=? AND tenant_id=?').get(d.cliente_id,tid))throw new ServiceError('Cliente ajeno o inexistente');
 const duration=existing&&d.servicio_id===existing.servicio_id?(existing.duracion_min||service.duracion_min):service.duracion_min;
 const [h,m]=d.hora.split(':').map(Number);const start=h*60+m;
 if(duration<=0||start+duration>1440)throw new ServiceError('La cita termina fuera del día seleccionado');
 const end=String(Math.floor((start+duration)/60)).padStart(2,'0')+':'+String((start+duration)%60).padStart(2,'0');
 const slotChanged=!existing||d.barbero_id!==existing.barbero_id||d.servicio_id!==existing.servicio_id||d.fecha!==existing.fecha||d.hora!==existing.hora;
 if(!['cancelada','no_asistio'].includes(d.estado)){
  if(slotChanged)availability.assertAvailable(tid,barber.id,d.fecha,d.hora,end);
  const busy=db.prepare("SELECT c.*,COALESCE(c.duracion_min,s.duracion_min,30) AS duration FROM barberia_citas c LEFT JOIN barberia_servicios s ON s.id=c.servicio_id AND s.tenant_id=c.tenant_id WHERE c.tenant_id=? AND c.barbero_id=? AND c.fecha=? AND c.id!=? AND c.estado NOT IN ('cancelada','no_asistio')").all(tid,barber.id,d.fecha,id||0);
  if(busy.some(c=>{const [hh,mm]=c.hora.split(':').map(Number);const at=hh*60+mm;return start<at+c.duration&&start+duration>at;}))throw new ServiceError('El barbero ya tiene una cita que se cruza con ese horario',409);
 }
 if(['llamada','en_servicio'].includes(d.estado)&&db.prepare("SELECT id FROM barberia_citas WHERE tenant_id=? AND barbero_id=? AND fecha=? AND id!=? AND estado IN ('llamada','en_servicio')").get(tid,barber.id,d.fecha,id||0))throw new ServiceError('El barbero ya está atendiendo otra cita',409);
 if(existing)db.prepare('UPDATE barberia_citas SET cliente_id=?,barbero_id=?,servicio_id=?,fecha=?,hora=?,estado=?,duracion_min=?,version=version+1 WHERE id=? AND tenant_id=?').run(d.cliente_id||null,barber.id,service.id,d.fecha,d.hora,d.estado,duration,id,tid);
 else id=db.prepare('INSERT INTO barberia_citas(tenant_id,cliente_id,barbero_id,servicio_id,fecha,hora,estado,duracion_min) VALUES(?,?,?,?,?,?,?,?)').run(tid,d.cliente_id||null,barber.id,service.id,d.fecha,d.hora,d.estado,duration).lastInsertRowid;
 return db.prepare('SELECT * FROM barberia_citas WHERE tenant_id=? AND id=?').get(tid,id);
}).immediate();}
module.exports={save};
