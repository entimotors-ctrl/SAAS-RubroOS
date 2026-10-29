// Isolated regression suite: never reads .env or the business database.
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'release-foundation-tests-only';
const assert = require('node:assert/strict');
const db = require('../src/db');
const sales = require('../src/services/tallerSales');
const orders = require('../src/services/tallerOrders');
const appointments = require('../src/services/barberiaAppointments');
const availability = require('../src/services/barberiaAvailability');
const { requireAuth, signToken } = require('../src/middleware/auth');
const { requireAdmin } = require('../src/security/access');
const identity = require('../src/whatsapp/identityResolver');
const history = require('../src/ai/core/history');
const { buildContext } = require('../src/ai/core/context');
const orchestrator = require('../src/ai/core/orchestrator');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('OK', name); }
function invoke(mw, token, user) {
  const req={headers:{authorization:'Bearer '+token},user};
  const result={status:200,next:false};
  const res={status(n){result.status=n;return this;},json(body){result.body=body;return this;}};
  return Promise.resolve(mw(req,res,()=>{result.next=true;})).then(()=>({...result,user:req.user}));
}
(async () => {
const tid = Number((await db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,status) VALUES ('taller','Test','test','activo')").run()).lastInsertRowid);
const other = Number((await db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,status) VALUES ('taller','Other','other','activo')").run()).lastInsertRowid);
const uid = Number((await db.prepare("INSERT INTO users(tenant_id,business_type,email,password_hash,nombre,role) VALUES (?,'taller','test@local','x','Test','tenant_admin')").run(tid)).lastInsertRowid);
const client = Number((await db.prepare('INSERT INTO taller_clientes(tenant_id,nombre) VALUES (?,?)').run(tid,'Client')).lastInsertRowid);
const vehicle = Number((await db.prepare('INSERT INTO taller_vehiculos(tenant_id,cliente_id,placa) VALUES (?,?,?)').run(tid,client,'TEST')).lastInsertRowid);
const product = Number((await db.prepare('INSERT INTO taller_inventario(tenant_id,nombre,precio,stock) VALUES (?,?,?,?)').run(tid,'Filtro',10,10)).lastInsertRowid);
const foreignProduct = Number((await db.prepare('INSERT INTO taller_inventario(tenant_id,nombre,precio,stock) VALUES (?,?,?,?)').run(other,'Ajeno',10,10)).lastInsertRowid);
const item = { descripcion: 'Filtro', cantidad: 2, precio_unitario: 10, producto_id: product };
const stock = async () => (await db.prepare('SELECT stock FROM taller_inventario WHERE id=?').get(product)).stock;
const snapshot = async () => JSON.stringify(await Promise.all(['taller_ventas','taller_venta_items','taller_stock_movimientos','taller_abonos','taller_ordenes','taller_orden_eventos'].map(t => db.prepare(`SELECT * FROM ${t}`).all())));
// fn puede ser todavía síncrona (servicios no convertidos: lanza directo) o
// ya async (orchestrator.confirmToolCall: devuelve una promesa rechazada) —
// se soportan ambas formas sin necesitar saber de antemano cuál es.
async function throwsOrRejects(fn) {
  let result;
  try { result = fn(); } catch { return; }
  if (result && typeof result.then === 'function') {
    try { await result; } catch { return; }
  }
  throw new Error('Se esperaba que la función lanzara o rechazara, pero no lo hizo');
}
async function failsAtomically(fn) { const before=await snapshot(), beforeStock=await stock(); await throwsOrRejects(fn); assert.equal(await snapshot(),before); assert.equal(await stock(),beforeStock); }
try {
  await test('Production refuses test transports and weak configuration',()=>{
    const {validateEnvironment}=require('../src/config/environment');
    assert.throws(()=>validateEnvironment({NODE_ENV:'production'}));
    const env={NODE_ENV:'production',JWT_SECRET:'x'.repeat(48),CORS_ORIGIN:'https://app.example.com',DATABASE_PATH:'/tmp/production-test.db',BACKUP_DIR:'/tmp/production-backups'};
    assert.throws(()=>validateEnvironment({...env,AI_FAKE_PROVIDER:'1'}));
    assert.throws(()=>validateEnvironment({...env,WHATSAPP_FAKE_TRANSPORT:'1'}));
    assert.throws(()=>validateEnvironment({...env,CORS_ORIGIN:'http://localhost'}));
    assert.doesNotThrow(()=>validateEnvironment(env));
  });
  await test('Sale links inventory, records stock movement and actor',async ()=>{
    const sale=await sales.registrarVenta(tid,{items:[item],request_key:'sale-test-0001'},uid);
    assert.equal(await stock(),8); assert.equal(sale.items[0].producto_id,product);
    assert.equal((await db.prepare('SELECT user_id FROM taller_stock_movimientos').get()).user_id,uid);
  });
  await test('Network retry does not create a sale or discount stock twice',async ()=>{
    const before=await snapshot(); await sales.registrarVenta(tid,{items:[item],request_key:'sale-test-0001'},uid); assert.equal(await snapshot(),before); assert.equal(await stock(),8);
  });
  await test('Same request key with changed payload rejected',()=>failsAtomically(()=>sales.registrarVenta(tid,{items:[{...item,cantidad:3}],request_key:'sale-test-0001'})));
  await test('Cross-tenant product rejected atomically',()=>failsAtomically(()=>sales.registrarVenta(tid,{items:[item,{...item,producto_id:foreignProduct}]})));
  await test('Repeated product lines cannot oversell stock',()=>failsAtomically(()=>sales.registrarVenta(tid,{items:[{...item,cantidad:5},{...item,cantidad:5}]})));
  await test('Free-form service does not change stock',async ()=>{await sales.registrarVenta(tid,{items:[{descripcion:'Mano de obra',cantidad:1,precio_unitario:12.34}]});assert.equal(await stock(),8);});
  for(const value of [-1,Infinity,'NaN',true]) await test('Invalid initial payment rejected: '+value,()=>failsAtomically(()=>sales.registrarVenta(tid,{tipo:'credito',pagado_inicial:value,items:[item]})));
  await test('Overpayment rejected',()=>failsAtomically(()=>sales.registrarVenta(tid,{tipo:'credito',pagado_inicial:30,items:[item]})));
  await test('Money rounded per line and credit balances match',async ()=>{
    const sale=await sales.registrarVenta(tid,{tipo:'credito',pagado_inicial:0.1,items:[{descripcion:'Servicio',cantidad:3,precio_unitario:0.1}]});
    assert.equal(sale.total,0.3);assert.equal(sale.saldo,0.2);
    assert.equal((await sales.registrarAbono(tid,sale.id,0.2)).saldo,0);
    await failsAtomically(()=>sales.registrarAbono(tid,sale.id,0.01));
  });
  await test('Failure writing line rolls back sale and stock',async ()=>{
    const prepare=db.prepare.bind(db);
    db.prepare=(sql)=>{const stmt=prepare(sql);if(sql.includes('INSERT INTO taller_venta_items'))stmt.run=()=>{throw new Error('Injected failure');};return stmt;};
    try{await failsAtomically(()=>sales.registrarVenta(tid,{items:[item]}));}finally{db.prepare=prepare;}
  });
  await test('AI confirmation rolls back business writes if action audit fails',async ()=>{
    const context=buildContext({userId:uid,tenantId:tid,businessType:'taller',role:'tenant_admin'});
    const conversation=await history.createConversation({tenantId:tid,userId:uid});
    const action=await orchestrator.proposeToolCall({conversationId:conversation.id,context,toolName:'taller.registrarVenta',args:{items:[item]}});
    const original=history.updateActionStatus;
    history.updateActionStatus=()=>{throw new Error('Injected audit failure');};
    try { await failsAtomically(()=>orchestrator.confirmToolCall({context,actionId:action.actionId})); }
    finally { history.updateActionStatus=original; }
    assert.equal((await history.getAction(action.actionId,tid)).status,'pending_confirmation');
  });
  const token=await signToken({sub:uid,tenant_id:tid,business_type:'taller',role:'tenant_admin'});
  await test('Active token accepted',async ()=>assert.equal((await invoke(requireAuth,token)).next,true));
  await db.prepare("INSERT INTO whatsapp_identities(tenant_id,user_id,phone_number,phone_number_id,status) VALUES (?,?, '50400000001','TEST','active')").run(tid,uid);
  const ctx=buildContext({userId:uid,tenantId:tid,businessType:'taller',role:'tenant_admin'});
  const conv=await history.createConversation({tenantId:tid,userId:uid});
  const action=await orchestrator.proposeToolCall({conversationId:conv.id,context:ctx,toolName:'taller.registrarVenta',args:{items:[item]}});
  await db.prepare("UPDATE tenants SET status='suspendido' WHERE id=?").run(tid);
  await test('Suspension blocks an already-issued JWT',async ()=>assert.equal((await invoke(requireAuth,token)).status,403));
  await test('Suspension blocks linked WhatsApp identity',async ()=>assert.equal(await identity.resolve({phoneNumberId:'TEST',from:'50400000001'}),null));
  await test('Suspension during pending confirmation blocks execution',async ()=>{const before=await stock();assert.equal((await orchestrator.confirmToolCall({context:ctx,actionId:action.actionId})).code,'TENANT_INACTIVE');assert.equal(await stock(),before);});
  await db.prepare("UPDATE tenants SET status='activo' WHERE id=?").run(tid);
  await test('Reactivation restores access',async ()=>assert.equal((await invoke(requireAuth,token)).next,true));
  await db.prepare("UPDATE users SET role='tenant_staff' WHERE id=?").run(uid);
  await test('Role change is effective with an existing token',async ()=>assert.equal((await invoke(requireAuth,token)).user.role,'tenant_staff'));
  await test('Staff cannot use admin operations',async ()=>assert.equal((await invoke(requireAdmin,null,{role:'tenant_staff'})).status,403));
  await db.prepare("UPDATE users SET role='tenant_admin' WHERE id=?").run(uid);
  let order;
  await test('Create repair order with matching client and vehicle',async ()=>{order=await orders.create(tid,uid,{cliente_id:client,vehiculo_id:vehicle,motivo:'Ruido',kilometraje:500});assert.equal(order.estado,'recibida');});
  await test('Foreign tenant cannot read repair order',()=>assert.rejects(()=>orders.get(other,order.id)));
  await test('Delivery cannot skip approval and workshop states',()=>failsAtomically(()=>orders.deliver(tid,uid,order.id,{version:order.version})));
  await test('Quote records diagnosis and version',async ()=>{order=await orders.quote(tid,uid,order.id,{version:order.version,diagnostico:'Cambiar filtro',items:[item]});assert.equal(order.estado,'presupuestada');});
  await test('Stale update cannot overwrite quote',()=>failsAtomically(()=>orders.quote(tid,uid,order.id,{version:1,diagnostico:'Viejo',items:[item]})));
  await test('Approval requires recorded evidence note',()=>failsAtomically(()=>orders.transition(tid,uid,order.id,{version:order.version,estado:'aprobada'})));
  order=await orders.transition(tid,uid,order.id,{version:order.version,estado:'aprobada',nota:'Cliente aprobó por teléfono; registrado por Test'});
  await test('Approved quote is immutable',()=>failsAtomically(()=>orders.quote(tid,uid,order.id,{version:order.version,diagnostico:'Cambio',items:[item]})));
  order=await orders.transition(tid,uid,order.id,{version:order.version,estado:'en_trabajo'});
  order=await orders.transition(tid,uid,order.id,{version:order.version,estado:'lista'});
  await test('Delivery creates one sale, stock movement and audit event',async ()=>{const before=await stock();order=await orders.deliver(tid,uid,order.id,{version:order.version,tipo:'credito',pagado_inicial:5});assert.equal(order.estado,'entregada');assert.equal(await stock(),before-2);assert.equal((await sales.getSale(tid,order.venta_id)).saldo,15);assert.equal(order.eventos.at(-1).evento,'entrega');});
  await test('Repeated delivery cannot charge twice',async ()=>{const before=await snapshot();await orders.deliver(tid,uid,order.id,{version:1});assert.equal(await snapshot(),before);});
  const barberTenant = Number((await db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,status) VALUES ('barberia','Barber test','barber-test','activo')").run()).lastInsertRowid);
  const barber = Number((await db.prepare('INSERT INTO barberia_barberos(tenant_id,nombre,activo) VALUES (?,?,1)').run(barberTenant,'Daniel')).lastInsertRowid);
  const barberService = Number((await db.prepare('INSERT INTO barberia_servicios(tenant_id,nombre,precio,duracion_min) VALUES (?,?,?,?)').run(barberTenant,'Corte',200,30)).lastInsertRowid);
  await test('New barbers receive a weekly schedule by default',async ()=>{
    const schedule=await db.prepare('SELECT * FROM barberia_horarios WHERE tenant_id=? AND barbero_id=? ORDER BY dia_semana').all(barberTenant,barber);
    assert.equal(schedule.length,7);assert.equal(schedule.filter(row=>row.activo).length,6);assert.equal(schedule[1].hora_inicio,'09:00');
  });
  await test('Appointments respect weekly hours and one-off availability blocks',async ()=>{
    const base={barbero_id:barber,servicio_id:barberService,fecha:'2027-01-18',hora:'09:00'};
    assert.equal((await appointments.save(barberTenant,base)).estado,'pendiente');
    await assert.rejects(()=>appointments.save(barberTenant,{...base,hora:'08:45'}),/horario/);
    const block=await availability.createBlock(barberTenant,{barbero_id:barber,fecha:'2027-01-18',hora_inicio:'10:00',hora_fin:'11:00',motivo:'Capacitación'});
    await assert.rejects(()=>appointments.save(barberTenant,{...base,hora:'10:00'}),/Capacitación/);
    await availability.removeBlock(barberTenant,block.id);
    assert.equal((await appointments.save(barberTenant,{...base,hora:'10:00'})).estado,'pendiente');
  });
  await test('Availability rejects incomplete or invalid hours',async ()=>{
    await assert.rejects(()=>availability.createBlock(barberTenant,{barbero_id:barber,fecha:'2027-01-19',hora_inicio:'10:00'}),/ambas horas/);
    const schedule=(await availability.list(barberTenant)).horarios.filter(row=>row.barbero_id===barber);
    schedule[1]={...schedule[1],hora_inicio:'18:00',hora_fin:'09:00',activo:1};
    await assert.rejects(()=>availability.setSchedule(barberTenant,barber,schedule),/cierre/);
  });
  // migrations.js (db.exec/db.pragma) es la herramienta de actualización de
  // esquema propia de better-sqlite3, sin equivalente ni necesidad bajo
  // Postgres (el esquema ahí lo aplica ensureSchema() desde supabase/migrations/).
  if (!process.env.DATABASE_URL) await test('Migration is repeatable',async ()=>{require('../src/db/migrations').migrate(db,':memory:');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).n,7);});
  console.log(`\n${passed}/${passed} checks OK`);
} finally { db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
