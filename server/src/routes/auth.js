const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { BUSINESS_TYPE_IDS } = require('../business-types');

const router = express.Router();

// Protección contra fuerza bruta: solo en los endpoints de autenticación,
// no en el resto de la API.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'negocio';
}

async function uniqueSlug(base) {
  let slug = base;
  let i = 1;
  const exists = db.prepare('SELECT 1 FROM tenants WHERE slug = ?');
  while (await exists.get(slug)) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

router.post('/registro', authLimiter, async (req, res) => {
  if(process.env.NODE_ENV==='production'&&process.env.PUBLIC_REGISTRATION!=='1')return res.status(403).json({error:'Solicita el alta al administrador de RubroOS'});
  const { business_type, empresa_nombre, nombre, email, password } = req.body || {};
  if (!BUSINESS_TYPE_IDS.includes(business_type)) {
    return res.status(400).json({ error: 'Rubro inválido' });
  }
  if (![empresa_nombre,nombre,email,password].every(v=>typeof v==='string'&&v.trim()) || empresa_nombre.length>160 || nombre.length>160 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if (password.length < (process.env.NODE_ENV==='production'?12:6) || Buffer.byteLength(password,'utf8')>72) {
    return res.status(400).json({ error: 'Contraseña inválida: mínimo 12 caracteres en producción, máximo 72 bytes' });
  }

  const yaExiste = await db.prepare('SELECT 1 FROM users WHERE email = ? AND business_type = ?').get(email, business_type);
  if (yaExiste) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo para este rubro' });
  }

  const created=await db.transaction(async ()=>{
  const slug = await uniqueSlug(slugify(empresa_nombre));
  const tenantInsert = db.prepare(
    `INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES (?, ?, ?, 'trial', 'trial')`
  );
  const tenantResult = await tenantInsert.run(business_type, empresa_nombre, slug);
  const tenantId = tenantResult.lastInsertRowid;

  const passwordHash = bcrypt.hashSync(password, 10);
  const userInsert = db.prepare(
    `INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, ?, ?, ?, ?, 'tenant_admin')`
  );
  const userResult = await userInsert.run(tenantId, business_type, email, passwordHash, nombre);

  return {slug,tenantId,userId:userResult.lastInsertRowid};
  }).immediate();
  const {slug,tenantId,userId}=created;
  const token = await signToken({
    sub: userId,
    tenant_id: tenantId,
    business_type,
    role: 'tenant_admin',
    nombre,
    email,
  });

  res.status(201).json({
    token,
    user: { id: userId, nombre, email, role: 'tenant_admin', business_type },
    tenant: { id: tenantId, nombre_empresa: empresa_nombre, slug, business_type, plan: 'trial', status: 'trial' },
  });
});

router.post('/login', authLimiter, async (req, res) => {
  const { business_type, email, password } = req.body || {};
  if (!BUSINESS_TYPE_IDS.includes(business_type)) {
    return res.status(400).json({ error: 'Rubro inválido' });
  }
  if(typeof email!=='string'||typeof password!=='string')return res.status(400).json({error:'Correo y contraseña requeridos'});
  const user = await db.prepare('SELECT * FROM users WHERE email = ? AND business_type = ? AND role != ?').get(email, business_type, 'owner');
  if (!user || user.access_status!=='activo' || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
  if (tenant?.status === 'suspendido') {
    return res.status(403).json({ error: 'Esta cuenta fue suspendida. Contacta soporte.' });
  }

  const token = await signToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    business_type,
    role: user.role,
    nombre: user.nombre,
    email: user.email,
  });

  res.json({
    token,
    user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role, business_type },
    tenant,
  });
});

router.post('/owner-login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if(typeof email!=='string'||typeof password!=='string')return res.status(400).json({error:'Correo y contraseña requeridos'});
  const user = await db.prepare("SELECT * FROM users WHERE email = ? AND role = 'owner'").get(email);
  if (!user || user.access_status!=='activo' || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const token = await signToken({ sub: user.id, role: 'owner', nombre: user.nombre, email: user.email });
  res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, role: 'owner' } });
});

router.get('/me', requireAuth, async (req, res) => {
  if (req.user.role === 'owner') {
    return res.json({ user: req.user });
  }
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenant_id);
  res.json({ user: req.user, tenant });
});

router.post('/change-password',authLimiter,requireAuth,async(req,res)=>res.json(await require('../services/passwords').change(req.user.sub,req.body?.current_password,req.body?.password)));
router.post('/reset-password',authLimiter,async(req,res)=>res.json(await require('../services/passwords').reset(req.body?.token,req.body?.password)));
module.exports = router;
