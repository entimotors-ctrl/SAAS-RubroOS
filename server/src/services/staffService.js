const db = require('../db');
const crypto = require('node:crypto');
const {ServiceError} = require('./errors');
const {text,date} = require('./validation');
const {hashPassword} = require('./passwords');
const {activeTenant} = require('../security/access');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const clean = (value,label,max=500) => text(value,label,max);
function event(tid,actor,type,id,action,detail) {
  db.prepare('INSERT INTO staff_events(tenant_id,user_id,entity_type,entity_id,action,detail) VALUES(?,?,?,?,?,?)').run(tid,actor,type,id,action,JSON.stringify(detail));
}
function member(tid,id) {
  const u=db.prepare("SELECT id,nombre,email,access_status FROM users WHERE id=? AND tenant_id=? AND role='tenant_staff'").get(id,tid);
  if(!u)throw new ServiceError('Colaborador no encontrado',404);return u;
}
function barber(tid,id) {
  if(id==null||id==='')return null;
  if(!Number.isInteger(Number(id))||!db.prepare('SELECT id FROM barberia_barberos WHERE id=? AND tenant_id=? AND activo=1').get(Number(id),tid))throw new ServiceError('Selecciona un barbero activo de este negocio');
  return Number(id);
}
function people(tid) {return db.prepare(`SELECT u.id,u.nombre,u.email,u.access_status,p.barbero_id,b.nombre barbero_nombre FROM users u LEFT JOIN staff_profiles p ON p.user_id=u.id AND p.tenant_id=u.tenant_id LEFT JOIN barberia_barberos b ON b.id=p.barbero_id AND b.tenant_id=u.tenant_id WHERE u.tenant_id=? AND u.role='tenant_staff' ORDER BY u.nombre`).all(tid);}
function issue(tid,uid,actor) {
  const u=member(tid,uid);if(u.access_status!=='invitado')throw new ServiceError('Solo puedes renovar invitaciones pendientes',409);
  const token=crypto.randomBytes(32).toString('hex'),expires=Date.now()+48*3600000;
  db.prepare('DELETE FROM staff_invitations WHERE user_id=?').run(uid);
  db.prepare('INSERT INTO staff_invitations(token_hash,user_id,tenant_id,created_by,expires_at) VALUES(?,?,?,?,?)').run(digest(token),uid,tid,actor,expires);
  event(tid,actor,'colaborador',uid,'invitacion.generada',{});
  return {user:u,token,expires_at:expires};
}
function invite(context,data) {
  const name=clean(data.nombre,'Nombre',120),email=clean(data.email,'Correo',254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ServiceError('Correo inválido');
  const tid=context.tenant_id,barberId=context.business_type==='barberia'?barber(tid,data.barbero_id):null;
  return db.transaction(()=>{
    if(db.prepare('SELECT id FROM users WHERE business_type=? AND lower(email)=?').get(context.business_type,email))throw new ServiceError('Ese correo ya tiene una cuenta en este rubro',409);
    const id=db.prepare("INSERT INTO users(tenant_id,business_type,email,password_hash,nombre,role,access_status) VALUES(?,?,?,?,?,'tenant_staff','invitado')").run(tid,context.business_type,email,'!not-activated',name).lastInsertRowid;
    db.prepare('INSERT INTO staff_profiles(user_id,tenant_id,barbero_id) VALUES(?,?,?)').run(id,tid,barberId);
    return issue(tid,id,context.sub);
  }).immediate();
}
function renew(tid,id,actor){return db.transaction(()=>issue(tid,id,actor)).immediate();}
function invitation(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new ServiceError('Invitación inválida, utilizada o vencida',400);
  const row=db.prepare(`SELECT i.*,u.nombre,u.email,u.business_type,u.access_status,t.nombre_empresa FROM staff_invitations i JOIN users u ON u.id=i.user_id AND u.tenant_id=i.tenant_id JOIN tenants t ON t.id=i.tenant_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>? AND u.role='tenant_staff' AND u.access_status='invitado'`).get(digest(token),Date.now());
  if(!row||!activeTenant(row.tenant_id,row.business_type))throw new ServiceError('Invitación inválida, utilizada o vencida',400);return row;
}
function preview(token){const r=invitation(token);return {nombre:r.nombre,negocio:r.nombre_empresa,business_type:r.business_type,expires_at:r.expires_at};}
function activate(token,password){
  invitation(token);const hash=hashPassword(password);
  return db.transaction(()=>{const r=invitation(token);
    db.prepare("UPDATE users SET password_hash=?,access_status='activo',session_version=session_version+1 WHERE id=?").run(hash,r.user_id);
    db.prepare('UPDATE staff_invitations SET used_at=? WHERE user_id=?').run(Date.now(),r.user_id);
    event(r.tenant_id,r.user_id,'colaborador',r.user_id,'invitacion.aceptada',{});
    return db.prepare('SELECT id,nombre,email,tenant_id,business_type,role FROM users WHERE id=?').get(r.user_id);
  }).immediate();
}
function updateMember(context,id,data){return db.transaction(()=>{
  const tid=context.tenant_id,u=member(tid,id),changes={};
  if(Object.hasOwn(data,'access_status')){
    if(!['activo','suspendido'].includes(data.access_status)||u.access_status==='invitado'&&data.access_status==='activo')throw new ServiceError('El colaborador debe crear su contraseña desde la invitación');
    const status=data.access_status==='activo'&&db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash==='!not-activated'?'invitado':data.access_status;
    db.prepare('UPDATE users SET access_status=?,session_version=session_version+1 WHERE id=?').run(status,id);changes.access_status=status;
    if(data.access_status==='suspendido')db.prepare('DELETE FROM staff_invitations WHERE user_id=?').run(id);
  }
  if(Object.hasOwn(data,'barbero_id')){
    if(context.business_type!=='barberia')throw new ServiceError('Este negocio no es una barbería');
    const value=barber(tid,data.barbero_id);
    db.prepare('INSERT INTO staff_profiles(user_id,tenant_id,barbero_id) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET barbero_id=excluded.barbero_id').run(id,tid,value);changes.barbero_id=value;
  }
  event(tid,context.sub,'colaborador',Number(id),'colaborador.actualizado',changes);return member(tid,id);
}).immediate();}
function listTasks(context){
  const admin=context.role==='tenant_admin';
  return db.prepare(`SELECT t.*,u.nombre assigned_name FROM staff_tasks t JOIN users u ON u.id=t.assigned_to AND u.tenant_id=t.tenant_id WHERE t.tenant_id=? ${admin?'':'AND t.assigned_to=?'} ORDER BY CASE WHEN t.status IN ('completada','cancelada') THEN 1 ELSE 0 END,t.due_date IS NULL,t.due_date,t.id DESC LIMIT 250`).all(...(admin?[context.tenant_id]:[context.tenant_id,context.sub]));
}
function createTask(context,data){
  const title=clean(data.title,'Título',160),description=data.description?clean(data.description,'Instrucciones',2000):'';
  const due=data.due_date?date(data.due_date):null,priority=data.priority||'normal';if(!['normal','alta'].includes(priority))throw new ServiceError('Prioridad inválida');
  return db.transaction(()=>{const u=member(context.tenant_id,data.assigned_to);if(u.access_status==='suspendido')throw new ServiceError('El colaborador está suspendido');
    const id=db.prepare('INSERT INTO staff_tasks(tenant_id,assigned_to,title,description,due_date,priority,created_by) VALUES(?,?,?,?,?,?,?)').run(context.tenant_id,u.id,title,description,due,priority,context.sub).lastInsertRowid;
    event(context.tenant_id,context.sub,'tarea',id,'tarea.asignada',{assigned_to:u.id,title});return db.prepare('SELECT * FROM staff_tasks WHERE id=?').get(id);
  }).immediate();
}
function taskAction(context,id,data){return db.transaction(()=>{
  const admin=context.role==='tenant_admin',tid=context.tenant_id;
  const row=db.prepare(`SELECT * FROM staff_tasks WHERE id=? AND tenant_id=? ${admin?'':'AND assigned_to=?'}`).get(...(admin?[id,tid]:[id,tid,context.sub]));
  if(!row)throw new ServiceError('Tarea no encontrada',404);
  const next=data.status;
  if(!['confirmada','en_proceso','completada','cancelada'].includes(next))throw new ServiceError('Estado inválido');
  if(row.status===next)return row;
  if(Number(data.version)!==row.version)throw new ServiceError('La tarea cambió. Actualiza antes de continuar.',409);
  const transitions={pendiente:['confirmada'],confirmada:['en_proceso'],en_proceso:['completada']};
  if(!(admin&&next==='cancelada'&&!['completada','cancelada'].includes(row.status))&&!(transitions[row.status]||[]).includes(next))throw new ServiceError('No puedes realizar ese cambio',409);
  db.prepare("UPDATE staff_tasks SET status=?,version=version+1,updated_at=datetime('now') WHERE id=?").run(next,id);
  event(tid,context.sub,'tarea',Number(id),'tarea.estado',{antes:row.status,despues:next});return db.prepare('SELECT * FROM staff_tasks WHERE id=?').get(id);
}).immediate();}
function reassign(context,id,data){return db.transaction(()=>{
  const tid=context.tenant_id,row=db.prepare('SELECT * FROM staff_tasks WHERE id=? AND tenant_id=?').get(id,tid);if(!row)throw new ServiceError('Tarea no encontrada',404);
  if(Number(data.version)!==row.version||['completada','cancelada'].includes(row.status))throw new ServiceError('La tarea cambió o está cerrada',409);
  const u=member(tid,data.assigned_to);if(u.access_status==='suspendido')throw new ServiceError('Colaborador suspendido');
  db.prepare("UPDATE staff_tasks SET assigned_to=?,status='pendiente',version=version+1,updated_at=datetime('now') WHERE id=?").run(u.id,id);
  event(tid,context.sub,'tarea',Number(id),'tarea.reasignada',{antes:row.assigned_to,despues:u.id});return db.prepare('SELECT * FROM staff_tasks WHERE id=?').get(id);
}).immediate();}
module.exports={people,invite,renew,preview,activate,updateMember,listTasks,createTask,taskAction,reassign,event};
