const express = require('express');
const db = require('../db');
const {text}=require('../services/validation');
const {ServiceError}=require('../services/errors');
const { BUSINESS_TYPES } = require('../business-types');

const router = express.Router();

const PLAN_PRECIOS = { trial: 0, starter: 590, pro: 990, business: 1590 };

router.get('/system',(req,res)=>res.json({backups:req.app.locals.backups.status(),mode:process.env.NODE_ENV||'development',ai_simulada:process.env.AI_FAKE_PROVIDER==='1',whatsapp_simulado:process.env.WHATSAPP_FAKE_TRANSPORT==='1'}));
router.get('/overview', async (req, res) => {
  const tenants = await db.prepare('SELECT * FROM tenants').all();
  const totalTenants = tenants.length;
  const mrr = tenants.reduce((sum, t) => sum + (t.status === 'activo' ? PLAN_PRECIOS[t.plan] || 0 : 0), 0);

  const porRubro = BUSINESS_TYPES.map((bt) => ({
    business_type: bt.id,
    label: bt.label,
    total: tenants.filter((t) => t.business_type === bt.id).length,
  }));

  const porEstado = ['trial', 'activo', 'suspendido'].map((estado) => ({
    estado,
    total: tenants.filter((t) => t.status === estado).length,
  }));

  const recientes = [...tenants].sort((a, b) => b.id - a.id).slice(0, 8);

  res.json({ totalTenants, mrr, porRubro, porEstado, recientes });
});

router.get('/tenants', async (req, res) => {
  const rows = await db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS usuarios,
              (SELECT email FROM users u WHERE u.tenant_id = t.id ORDER BY u.id LIMIT 1) AS admin_email
       FROM tenants t ORDER BY t.id DESC`
    )
    .all();
  res.json(rows);
});

router.put('/tenants/:id', async (req, res) => {
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'No encontrado' });
  const plan = req.body?.plan ?? tenant.plan;
  const status = req.body?.status ?? tenant.status;
  if (!Object.hasOwn(PLAN_PRECIOS, plan) || !['activo', 'trial', 'suspendido'].includes(status)) {
    return res.status(400).json({ error: 'Plan o estado inválido' });
  }
  await db.transaction(async ()=>{
    await db.prepare('UPDATE tenants SET plan = ?, status = ? WHERE id = ?').run(plan, status, tenant.id);
    await audit(req,'negocio.actualizado',tenant.id,{antes:{plan:tenant.plan,status:tenant.status},despues:{plan,status}});
  })();
  res.json(await db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id));
});

router.get('/business-types', (req, res) => {
  res.json(BUSINESS_TYPES);
});

async function audit(req,event,tenantId,detail) {
  await db.prepare('INSERT INTO owner_events(user_id,tenant_id,event,detail) VALUES(?,?,?,?)').run(req.user.sub,tenantId,event,JSON.stringify(detail));
}
function credentials(body) {
  const nombre=text(body.nombre,'Nombre',100);
  const email=text(body.email,'Correo',200).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ServiceError('Correo inválido');
  if(typeof body.password!=='string'||body.password.length<12||Buffer.byteLength(body.password,'utf8')>72) throw new ServiceError('La contraseña debe tener entre 12 y 72 caracteres');
  return {nombre,email,hash:require('../services/passwords').hashPassword(body.password)};
}
router.post('/tenants',async (req,res)=>{
  const data=req.body||{};
  if(!BUSINESS_TYPES.some(b=>b.id===data.business_type)) throw new ServiceError('Rubro inválido');
  const empresa=text(data.nombre_empresa,'Nombre del negocio',120);
  const c=credentials(data);
  const result=await db.transaction(async ()=>{
    if(await db.prepare('SELECT id FROM users WHERE email=? AND business_type=?').get(c.email,data.business_type)) throw new ServiceError('El correo ya tiene una cuenta en ese rubro',409);
    const slug='negocio-'+require('crypto').randomUUID();
    const id=(await db.prepare("INSERT INTO tenants(business_type,nombre_empresa,slug,plan,status) VALUES(?,?,?,'trial','trial')").run(data.business_type,empresa,slug)).lastInsertRowid;
    await db.prepare("INSERT INTO users(tenant_id,business_type,nombre,email,password_hash,role) VALUES(?,?,?,?,?,'tenant_admin')").run(id,data.business_type,c.nombre,c.email,c.hash);
    await audit(req,'negocio.creado',id,{nombre_empresa:empresa,business_type:data.business_type});
    return db.prepare('SELECT * FROM tenants WHERE id=?').get(id);
  }).immediate();
  res.status(201).json(result);
});
router.get('/tenants/:id/users',async (req,res)=>res.json(await db.prepare('SELECT id,nombre,email,role FROM users WHERE tenant_id=? ORDER BY id').all(req.params.id)));
router.post('/tenants/:id/users',async (req,res)=>{
  const t=await db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id);
  if(!t) throw new ServiceError('Negocio no encontrado',404);
  const c=credentials(req.body||{}), role=req.body?.role||'tenant_staff';
  if(!['tenant_admin','tenant_staff'].includes(role)) throw new ServiceError('Rol inválido');
  const id=await db.transaction(async ()=>{
    const id=(await db.prepare('INSERT INTO users(tenant_id,business_type,nombre,email,password_hash,role) VALUES(?,?,?,?,?,?)').run(t.id,t.business_type,c.nombre,c.email,c.hash,role)).lastInsertRowid;
    await audit(req,'usuario.creado',t.id,{id,email:c.email,role});return id;
  }).immediate();
  res.status(201).json({id,nombre:c.nombre,email:c.email,role});
});
router.put('/tenants/:id/users/:userId',async (req,res)=>{
  const role=req.body?.role;
  if(!['tenant_admin','tenant_staff'].includes(role)) throw new ServiceError('Rol inválido');
  const u=await db.transaction(async ()=>{
    const u=await db.prepare('SELECT id,role FROM users WHERE id=? AND tenant_id=?').get(req.params.userId,req.params.id);
    if(!u) throw new ServiceError('Usuario no encontrado',404);
    if(u.role==='tenant_admin'&&role==='tenant_staff'&&(await db.prepare("SELECT COUNT(*) n FROM users WHERE tenant_id=? AND role='tenant_admin'").get(req.params.id)).n<=1) throw new ServiceError('Debe quedar al menos un administrador',409);
    await db.prepare('UPDATE users SET role=? WHERE id=?').run(role,u.id);
    await audit(req,'usuario.rol',Number(req.params.id),{id:u.id,antes:u.role,role});return {id:u.id,role};
  }).immediate();res.json(u);
});
router.get('/events',async (req,res)=>res.json(await db.prepare('SELECT e.*,u.nombre AS actor,t.nombre_empresa FROM owner_events e JOIN users u ON u.id=e.user_id LEFT JOIN tenants t ON t.id=e.tenant_id ORDER BY e.id DESC LIMIT 100').all()));
router.post('/tenants/:id/users/:userId/reset-link',async (req,res)=>res.json(await require('../services/passwords').issue(req.user.sub,Number(req.params.id),Number(req.params.userId))));
module.exports = router;
