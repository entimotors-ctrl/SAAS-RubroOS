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
function test(name, fn) { fn(); passed++; console.log('OK', name); }
const tid = Number(db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,status) VALUES ('taller','Test','test','activo')").run().lastInsertRowid);
const other = Number(db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,status) VALUES ('taller','Other','other','activo')").run().lastInsertRowid);
const uid = Number(db.prepare("INSERT INTO users(tenant_id,business_type,email,password_hash,nombre,role) VALUES (?,'taller','test@local','x','Test','tenant_admin')").run(tid).lastInsertRowid);
const client = Number(db.prepare('INSERT INTO taller_clientes(tenant_id,nombre) VALUES (?,?)').run(tid,'Client').lastInsertRowid);
const vehicle = Number(db.prepare('INSERT INTO taller_vehiculos(tenant_id,cliente_id,placa) VALUES (?,?,?)').run(tid,client,'TEST').lastInsertRowid);
const product = Number(db.prepare('INSERT INTO taller_inventario(tenant_id,nombre,precio,stock) VALUES (?,?,?,?)').run(tid,'Filtro',10,10).lastInsertRowid);
const foreignProduct = Number(db.prepare('INSERT INTO taller_inventario(tenant_id,nombre,precio,stock) VALUES (?,?,?,?)').run(other,'Ajeno',10,10).lastInsertRowid);
const item = { descripcion: 'Filtro', cantidad: 2, precio_unitario: 10, producto_id: product };
const stock = () => db.prepare('SELECT stock FROM taller_inventario WHERE id=?').get(product).stock;
const snapshot = () => JSON.stringify(['taller_ventas','taller_venta_items','taller_stock_movimientos','taller_abonos','taller_ordenes','taller_orden_eventos'].map(t => db.prepare(`SELECT * FROM ${t}`).all()));
function failsAtomically(fn) { const before=snapshot(), beforeStock=stock(); assert.throws(fn); assert.equal(snapshot(),before); assert.equal(stock(),beforeStock); }
function invoke(mw, token, user) {
  const req={headers:{authorization:'Bearer '+token},user};
  const result={status:200,next:false};
  const res={status(n){result.status=n;return this;},json(body){result.body=body;return this;}};
  mw(req,res,()=>{result.next=true;}); return {...result,user:req.user};
}
try {
  test('Production refuses test transports and weak configuration',()=>{
    const {validateEnvironment}=require('../src/config/environment');
    assert.throws(()=>validateEnvironment({NODE_ENV:'production'}));
    const env={NODE_ENV:'production',JWT_SECRET:'x'.repeat(48),CORS_ORIGIN:'https://app.example.com',DATABASE_PATH:'/tmp/production-test.db',BACKUP_DIR:'/tmp/production-backups'};
    assert.throws(()=>validateEnvironment({...env,AI_FAKE_PROVIDER:'1'}));
    assert.throws(()=>validateEnvironment({...env,WHATSAPP_FAKE_TRANSPORT:'1'}));
    assert.throws(()=>validateEnvironment({...env,CORS_ORIGIN:'http://localhost'}));
    assert.doesNotThrow(()=>validateEnvironment(env));
  });
  test('Sale links inventory, records stock movement and actor',()=>{
    const sale=sales.registrarVenta(tid,{items:[item],request_key:'sale-test-0001'},uid);
    assert.equal(stock(),8); assert.equal(sale.items[0].producto_id,product);
    assert.equal(db.prepare('SELECT user_id FROM taller_stock_movimientos').get().user_id,uid);
  });
  test('Network retry does not create a sale or discount stock twice',()=>{
    const before=snapshot(); sales.registrarVenta(tid,{items:[item],request_key:'sale-test-0001'},uid); assert.equal(snapshot(),before); assert.equal(stock(),8);
  });
  test('Same request key with changed payload rejected',()=>failsAtomically(()=>sales.registrarVenta(tid,{items:[{...item,cantidad:3}],request_key:'sale-test-0001'})));
  test('Cross-tenant product rejected atomically',()=>failsAtomically(()=>sales.registrarVenta(tid,{items:[item,{...item,producto_id:foreignProduct}]})));
  test('Repeated product lines cannot oversell stock',()=>failsAtomically(()=>sales.registrarVenta(tid,{items:[{...item,cantidad:5},{...item,cantidad:5}]})));
  test('Free-form service does not change stock',()=>{sales.registrarVenta(tid,{items:[{descripcion:'Mano de obra',cantidad:1,precio_unitario:12.34}]});assert.equal(stock(),8);});
  for(const value of [-1,Infinity,'NaN',true]) test('Invalid initial payment rejected: '+value,()=>failsAtomically(()=>sales.registrarVenta(tid,{tipo:'credito',pagado_inicial:value,items:[item]})));
  test('Overpayment rejected',()=>failsAtomically(()=>sales.registrarVenta(tid,{tipo:'credito',pagado_inicial:30,items:[item]})));
  test('Money rounded per line and credit balances match',()=>{
    const sale=sales.registrarVenta(tid,{tipo:'credito',pagado_inicial:0.1,items:[{descripcion:'Servicio',cantidad:3,precio_unitario:0.1}]});
    assert.equal(sale.total,0.3);assert.equal(sale.saldo,0.2);
    assert.equal(sales.registrarAbono(tid,sale.id,0.2).saldo,0);
    failsAtomically(()=>sales.registrarAbono(tid,sale.id,0.01));
  });
  test('Failure writing line rolls back sale and stock',()=>{
    const prepare=db.prepare.bind(db);
    db.prepare=(sql)=>{const stmt=prepare(sql);if(sql.includes('INSERT INTO taller_venta_items'))stmt.run=()=>{throw new Error('Injected failure');};return stmt;};
    try{failsAtomically(()=>sales.registrarVenta(tid,{items:[item]}));}finally{db.prepare=prepare;}
  });
  test('AI confirmation rolls back business writes if action audit fails',()=>{
    const context=buildContext({userId:uid,tenantId:tid,businessType:'taller',role:'tenant_admin'});
    const conversation=history.createConversation({tenantId:tid,userId:uid});
    const action=orchestrator.proposeToolCall({conversationId:conversation.id,context,toolName:'taller.registrarVenta',args:{items:[item]}});
    const original=history.updateActionStatus;
    history.updateActionStatus=()=>{throw new Error('Injected audit failure');};
    try { failsAtomically(()=>orchestrator.confirmToolCall({context,actionId:action.actionId})); }
    finally { history.updateActionStatus=original; }
    assert.equal(history.getAction(action.actionId,tid).status,'pending_confirmation');
  });
  const token=signToken({sub:uid,tenant_id:tid,business_type:'taller',role:'tenant_admin'});
  test('Active token accepted',()=>assert.equal(invoke(requireAuth,token).next,true));
  db.prepare("INSERT INTO whatsapp_identities(tenant_id,user_id,phone_number,phone_number_id,status) VALUES (?,?, '50400000001','TEST','active')").run(tid,uid);
  const ctx=buildContext({userId:uid,tenantId:tid,businessType:'taller',role:'tenant_admin'});
  const conv=history.createConversation({tenantId:tid,userId:uid});
  const action=orchestrator.proposeToolCall({conversationId:conv.id,context:ctx,toolName:'taller.registrarVenta',args:{items:[item]}});
  db.prepare("UPDATE tenants SET status='suspendido' WHERE id=?").run(tid);
  test('Suspension blocks an already-issued JWT',()=>assert.equal(invoke(requireAuth,token).status,403));
  test('Suspension blocks linked WhatsApp identity',()=>assert.equal(identity.resolve({phoneNumberId:'TEST',from:'50400000001'}),null));
  test('Suspension during pending confirmation blocks execution',()=>{const before=stock();assert.equal(orchestrator.confirmToolCall({context:ctx,actionId:action.actionId}).code,'TENANT_INACTIVE');assert.equal(stock(),before);});
  db.prepare("UPDATE tenants SET status='activo' WHERE id=?").run(tid);
  test('Reactivation restores access',()=>assert.equal(invoke(requireAuth,token).next,true));
  db.prepare("UPDATE users SET role='tenant_staff' WHERE id=?").run(uid);
  test('Role change is effective with an existing token',()=>assert.equal(invoke(requireAuth,token).user.role,'tenant_staff'));
  test('Staff cannot use admin operations',()=>assert.equal(invoke(requireAdmin,null,{role:'tenant_staff'}).status,403));
  db.prepare("UPDATE users SET role='tenant_admin' WHERE id=?").run(uid);
  let order;
  test('Create repair order with matching client and vehicle',()=>{order=orders.create(tid,uid,{cliente_id:client,vehiculo_id:vehicle,motivo:'Ruido',kilometraje:500});assert.equal(order.estado,'recibida');});
  test('Foreign tenant cannot read repair order',()=>assert.throws(()=>orders.get(other,order.id)));
  test('Delivery cannot skip approval and workshop states',()=>failsAtomically(()=>orders.deliver(tid,uid,order.id,{version:order.version})));
  test('Quote records diagnosis and version',()=>{order=orders.quote(tid,uid,order.id,{version:order.version,diagnostico:'Cambiar filtro',items:[item]});assert.equal(order.estado,'presupuestada');});
  test('Stale update cannot overwrite quote',()=>failsAtomically(()=>orders.quote(tid,uid,order.id,{version:1,diagnostico:'Viejo',items:[item]})));
  test('Approval requires recorded evidence note',()=>failsAtomically(()=>orders.transition(tid,uid,order.id,{version:order.version,estado:'aprobada'})));
  order=orders.transition(tid,uid,order.id,{version:order.version,estado:'aprobada',nota:'Cliente aprobó por teléfono; registrado por Test'});
  test('Approved quote is immutable',()=>failsAtomically(()=>orders.quote(tid,uid,order.id,{version:order.version,diagnostico:'Cambio',items:[item]})));
  order=orders.transition(tid,uid,order.id,{version:order.version,estado:'en_trabajo'});
  order=orders.transition(tid,uid,order.id,{version:order.version,estado:'lista'});
  test('Delivery creates one sale, stock movement and audit event',()=>{const before=stock();order=orders.deliver(tid,uid,order.id,{version:order.version,tipo:'credito',pagado_inicial:5});assert.equal(order.estado,'entregada');assert.equal(stock(),before-2);assert.equal(sales.getSale(tid,order.venta_id).saldo,15);assert.equal(order.eventos.at(-1).evento,'entrega');});
  test('Repeated delivery cannot charge twice',()=>{const before=snapshot();orders.deliver(tid,uid,order.id,{version:1});assert.equal(snapshot(),before);});
  const barberTenant = Number(db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,status) VALUES ('barberia','Barber test','barber-test','activo')").run().lastInsertRowid);
  const barber = Number(db.prepare('INSERT INTO barberia_barberos(tenant_id,nombre,activo) VALUES (?,?,1)').run(barberTenant,'Daniel').lastInsertRowid);
  const barberService = Number(db.prepare('INSERT INTO barberia_servicios(tenant_id,nombre,precio,duracion_min) VALUES (?,?,?,?)').run(barberTenant,'Corte',200,30).lastInsertRowid);
  test('New barbers receive a weekly schedule by default',()=>{
    const schedule=db.prepare('SELECT * FROM barberia_horarios WHERE tenant_id=? AND barbero_id=? ORDER BY dia_semana').all(barberTenant,barber);
    assert.equal(schedule.length,7);assert.equal(schedule.filter(row=>row.activo).length,6);assert.equal(schedule[1].hora_inicio,'09:00');
  });
  test('Appointments respect weekly hours and one-off availability blocks',()=>{
    const base={barbero_id:barber,servicio_id:barberService,fecha:'2027-01-18',hora:'09:00'};
    assert.equal(appointments.save(barberTenant,base).estado,'pendiente');
    assert.throws(()=>appointments.save(barberTenant,{...base,hora:'08:45'}),/horario/);
    const block=availability.createBlock(barberTenant,{barbero_id:barber,fecha:'2027-01-18',hora_inicio:'10:00',hora_fin:'11:00',motivo:'Capacitación'});
    assert.throws(()=>appointments.save(barberTenant,{...base,hora:'10:00'}),/Capacitación/);
    availability.removeBlock(barberTenant,block.id);
    assert.equal(appointments.save(barberTenant,{...base,hora:'10:00'}).estado,'pendiente');
  });
  test('Availability rejects incomplete or invalid hours',()=>{
    assert.throws(()=>availability.createBlock(barberTenant,{barbero_id:barber,fecha:'2027-01-19',hora_inicio:'10:00'}),/ambas horas/);
    const schedule=availability.list(barberTenant).horarios.filter(row=>row.barbero_id===barber);
    schedule[1]={...schedule[1],hora_inicio:'18:00',hora_fin:'09:00',activo:1};
    assert.throws(()=>availability.setSchedule(barberTenant,barber,schedule),/cierre/);
  });
  test('Migration is repeatable',()=>{require('../src/db/migrations').migrate(db,':memory:');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n,7);});
  console.log(`\n${passed}/${passed} checks OK`);
} finally { db.close(); }
