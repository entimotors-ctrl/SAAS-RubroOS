const assert=require('node:assert/strict'),db=require('../src/db'),{signToken}=require('../src/middleware/auth'),crypto=require('node:crypto'),dbAccess=require('../src/security/dbAccess');
if(process.env.NODE_ENV!=='test'||!process.env.API_URL)throw Error('Use isolated runner');
let n=0;function check(a,b){assert.deepEqual(a,b);n++;}
const users={},tokens={};
async function req(who,path,method='GET',body){const r=await fetch(process.env.API_URL+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(tokens[who]||'')},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();return {status:r.status,body:value};}
async function invite(type,suffix,barbero_id){const r=await req(type,'/staff/members','POST',{nombre:'QA '+suffix,email:suffix+'@staff.test',barbero_id,role:'tenant_admin',tenant_id:users.agro.tenant_id});check(r.status,201);return r.body;}
async function activate(i,key){const r=await req('', '/staff-public/activate','POST',{token:i.token,password:'Staff-test-2026!'});check(r.status,200);check(r.body.user.role,'tenant_staff');tokens[key]=r.body.token;return r.body;}
dbAccess.asSystem(async()=>{
 for(const type of ['taller','barberia','agro','ganaderia','carwash']){const u=await db.prepare('SELECT * FROM users WHERE business_type=? AND email=?').get(type,'maestro@rubroos.test');users[type]=u;tokens[type]=await signToken({sub:u.id,tenant_id:u.tenant_id,business_type:type,role:u.role});}
 for(const type of Object.keys(users)){
  const i=await invite(type,type);check((await db.prepare('SELECT tenant_id FROM users WHERE id=?').get(i.user.id)).tenant_id,users[type].tenant_id);
  const hash=(await db.prepare('SELECT token_hash FROM staff_invitations WHERE user_id=?').get(i.user.id)).token_hash;check(hash===i.token,false);check(hash,crypto.createHash('sha256').update(i.token).digest('hex'));
  check((await req('', '/staff-public/invitation','POST',{token:i.token})).status,200);
  await activate(i,type+'staff');check((await req('', '/staff-public/activate','POST',{token:i.token,password:'Staff-test-2026!'})).status,400);
  const task=await req(type,'/staff/tasks','POST',{title:'Trabajo '+type,assigned_to:i.user.id,description:'Instrucciones privadas'});check(task.status,201);
  check((await req(type+'staff','/staff/tasks')).body.length,1);
  check((await req(type+'staff','/staff/members')).status,403);
  check((await req(type+'staff','/operations/settings')).status,403);
  check((await req(type+'staff',`/${type}/resumen`)).status,403);
  check((await req(type+'staff','/ai/chat','POST',{message:'lista clientes'})).status,403);
  check((await req(type+'staff','/staff/tasks','POST',{title:'Inventada',assigned_to:i.user.id})).status,403);
  check((await req(type+'staff',`/staff/tasks/${task.body.id}/status`,'PUT',{status:'completada',version:1})).status,409);
  for(const [index,status] of ['confirmada','en_proceso','completada'].entries())check((await req(type+'staff',`/staff/tasks/${task.body.id}/status`,'PUT',{status,version:index+1})).status,200);
  check((await req(type+'staff',`/staff/tasks/${task.body.id}/status`,'PUT',{status:'completada',version:1})).status,200);
  check((await db.prepare("SELECT count(*) n FROM staff_events WHERE entity_type='tarea' AND entity_id=? AND action='tarea.estado'").get(task.body.id)).n,3);
 }
 const a=await invite('barberia','second'),b=await invite('barberia','third');await activate(a,'a');await activate(b,'b');
 const task=(await req('barberia','/staff/tasks','POST',{title:'Solo A',assigned_to:a.user.id})).body;
 check((await req('b','/staff/tasks?assigned_to='+a.user.id)).body.length,0);
 check((await req('b',`/staff/tasks/${task.id}/status`,'PUT',{status:'confirmada',version:1})).status,404);
 check((await req('agrostaff',`/staff/tasks/${task.id}/status`,'PUT',{status:'confirmada',version:1})).status,404);
 check((await req('agro','/staff/tasks','POST',{title:'Ajena',assigned_to:a.user.id})).status,404);
 check((await req('barberia','/staff/tasks','POST',{title:'Admin',assigned_to:users.barberia.id})).status,404);
 check((await req('a',`/staff/tasks/${task.id}/assign`,'PUT',{assigned_to:b.user.id,version:1})).status,403);
 check((await req('barberia',`/staff/tasks/${task.id}/assign`,'PUT',{assigned_to:b.user.id,version:1})).status,200);
 check((await req('a','/staff/tasks')).body.length,0);
 check((await req('b',`/staff/tasks/${task.id}/status`,'PUT',{status:'confirmada',version:1})).status,409);
 check((await req('b',`/staff/tasks/${task.id}/status`,'PUT',{status:'cancelada',version:2})).status,409);
 check((await req('barberia',`/staff/tasks/${task.id}/status`,'PUT',{status:'cancelada',version:2})).status,200);
 const pending=await invite('taller','renew');const renewed=await req('taller',`/staff/members/${pending.user.id}/invite`,'POST',{});check(renewed.status,200);check((await req('','/staff-public/invitation','POST',{token:pending.token})).status,400);
 await db.prepare('UPDATE staff_invitations SET expires_at=0 WHERE user_id=?').run(pending.user.id);check((await req('','/staff-public/invitation','POST',{token:renewed.body.token})).status,400);
 const tid=users.barberia.tenant_id,barbers=await db.prepare('SELECT * FROM barberia_barberos WHERE tenant_id=? AND activo=1').all(tid);assert(barbers.length>=2);
 check((await req('barberia',`/staff/members/${a.user.id}`,'PUT',{barbero_id:barbers[0].id})).status,200);
 check((await req('barberia',`/staff/members/${b.user.id}`,'PUT',{barbero_id:barbers[1].id})).status,200);
 const day=await require('../src/services/settings').day(tid),service=await db.prepare('SELECT * FROM barberia_servicios WHERE tenant_id=?').get(tid),client=await db.prepare('SELECT * FROM barberia_clientes WHERE tenant_id=?').get(tid);
 await db.prepare('DELETE FROM barberia_citas WHERE tenant_id=?').run(tid);
 const add=async(barber,hour,date=day)=>Number((await db.prepare("INSERT INTO barberia_citas(tenant_id,barbero_id,servicio_id,cliente_id,fecha,hora,estado,duracion_min) VALUES(?,?,?,?,?,?,'confirmada',30)").run(tid,barber,service.id,client.id,date,hour)).lastInsertRowid);
 const first=await add(barbers[0].id,'09:00'),second=await add(barbers[0].id,'10:00'),other=await add(barbers[1].id,'09:00'),future=await add(barbers[0].id,'09:00','2099-01-01');
 const agenda=await req('a','/staff/appointments?barbero_id='+barbers[1].id);check(agenda.status,200);check(agenda.body.appointments.map(c=>c.id),[first,second]);check('telefono' in agenda.body.appointments[0],false);check('precio' in agenda.body.appointments[0],false);
 check((await req('a',`/staff/appointments/${other}/action`,'POST',{action:'iniciar',version:1,barbero_id:barbers[1].id})).status,404);
 check((await req('a',`/staff/appointments/${future}/action`,'POST',{action:'iniciar',version:1})).status,409);
 check((await req('a','/staff/appointments/next','POST',{})).body.id,first);
 check((await req('a','/staff/appointments/next','POST',{})).status,409);
 check((await req('a',`/staff/appointments/${first}/action`,'POST',{action:'iniciar',version:1})).status,409);
 check((await req('a',`/staff/appointments/${first}/action`,'POST',{action:'iniciar',version:2})).status,200);
 check((await req('a',`/staff/appointments/${first}/action`,'POST',{action:'finalizar',version:3})).status,200);
 check((await req('a',`/staff/appointments/${first}/action`,'POST',{action:'finalizar',version:3})).status,200);
 check((await req('a',`/staff/appointments/${second}/action`,'POST',{action:'no_asistio',version:1})).status,200);
 check((await req('a',`/staff/appointments/${second}/action`,'POST',{action:'iniciar',version:2})).status,409);
 check((await req('barberia',`/staff/members/${a.user.id}`,'PUT',{access_status:'suspendido'})).status,200);
 check((await req('a','/staff/tasks')).status,401);
 check((await req('','/auth/login','POST',{business_type:'barberia',email:a.user.email,password:'Staff-test-2026!'})).status,401);
 check((await req('agro',`/staff/members/${b.user.id}`,'PUT',{access_status:'suspendido'})).status,404);
 check((await req('barberia','/staff/events')).body.some(e=>e.detail.includes(a.token)),false);
 console.log(n+' checks OK');
}).catch(e=>{console.error(e);process.exitCode=1;});
