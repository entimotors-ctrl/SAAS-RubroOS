const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { BUSINESS_TYPE_IDS } = require('../business-types');

const router = express.Router();

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'negocio';
}

function uniqueSlug(base) {
  let slug = base;
  let i = 1;
  const exists = db.prepare('SELECT 1 FROM tenants WHERE slug = ?');
  while (exists.get(slug)) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

router.post('/registro', (req, res) => {
  const { business_type, empresa_nombre, nombre, email, password } = req.body || {};
  if (!BUSINESS_TYPE_IDS.includes(business_type)) {
    return res.status(400).json({ error: 'Rubro inválido' });
  }
  if (!empresa_nombre || !nombre || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const yaExiste = db.prepare('SELECT 1 FROM users WHERE email = ? AND business_type = ?').get(email, business_type);
  if (yaExiste) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo para este rubro' });
  }

  const slug = uniqueSlug(slugify(empresa_nombre));
  const tenantInsert = db.prepare(
    `INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES (?, ?, ?, 'trial', 'trial')`
  );
  const tenantResult = tenantInsert.run(business_type, empresa_nombre, slug);
  const tenantId = tenantResult.lastInsertRowid;

  const passwordHash = bcrypt.hashSync(password, 10);
  const userInsert = db.prepare(
    `INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, ?, ?, ?, ?, 'tenant_admin')`
  );
  const userResult = userInsert.run(tenantId, business_type, email, passwordHash, nombre);

  const token = signToken({
    sub: userResult.lastInsertRowid,
    tenant_id: tenantId,
    business_type,
    role: 'tenant_admin',
    nombre,
    email,
  });

  res.status(201).json({
    token,
    user: { id: userResult.lastInsertRowid, nombre, email, role: 'tenant_admin', business_type },
    tenant: { id: tenantId, nombre_empresa: empresa_nombre, slug, business_type, plan: 'trial', status: 'trial' },
  });
});

router.post('/login', (req, res) => {
  const { business_type, email, password } = req.body || {};
  if (!BUSINESS_TYPE_IDS.includes(business_type)) {
    return res.status(400).json({ error: 'Rubro inválido' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND business_type = ? AND role != ?').get(email, business_type, 'owner');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
  if (tenant?.status === 'suspendido') {
    return res.status(403).json({ error: 'Esta cuenta fue suspendida. Contacta soporte.' });
  }

  const token = signToken({
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

router.post('/owner-login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'owner'").get(email);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const token = signToken({ sub: user.id, role: 'owner', nombre: user.nombre, email: user.email });
  res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, role: 'owner' } });
});

router.get('/me', requireAuth, (req, res) => {
  if (req.user.role === 'owner') {
    return res.json({ user: req.user });
  }
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenant_id);
  res.json({ user: req.user, tenant });
});

module.exports = router;
