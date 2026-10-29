const jwt = require('jsonwebtoken');
const db = require('../db');
const { activeTenant } = require('../security/access');

if (!process.env.JWT_SECRET) {
  throw new Error(
    'Falta la variable de entorno JWT_SECRET. Defínela en server/.env (copia server/.env.example) antes de iniciar el servidor. ' +
      'Genera un valor con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}
const JWT_SECRET = process.env.JWT_SECRET;

async function signToken(payload) {
  const user=await db.prepare('SELECT session_version FROM users WHERE id=?').get(payload.sub);
  return jwt.sign({...payload,sv:user?.session_version||0}, JWT_SECRET, { expiresIn: '12h' });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    const user = await db.prepare('SELECT id, tenant_id, business_type, role, nombre, email, session_version, access_status FROM users WHERE id = ?').get(claims.sub);
    if (!user || user.access_status!=='activo' || (claims.sv||0)!==user.session_version || (user.tenant_id || null) !== (claims.tenant_id || null)
      || (user.business_type || null) !== (claims.business_type || null)) {
      return res.status(401).json({ error: 'La sesión ya no es válida. Inicia sesión de nuevo.' });
    }
    if (user.role !== 'owner' && !(await activeTenant(user.tenant_id, user.business_type))) {
      return res.status(403).json({ error: 'El negocio no está activo. Contacta al administrador.' });
    }
    req.user = { ...claims, role: user.role, nombre: user.nombre, email: user.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Solo el dueño del SaaS puede hacer esto' });
  next();
}

async function requireTenant(req, res, next) {
  if (!req.user?.tenant_id || !req.user?.business_type) {
    return res.status(403).json({ error: 'Esta cuenta no pertenece a un negocio' });
  }
  if (!(await activeTenant(req.user.tenant_id, req.user.business_type))) {
    return res.status(403).json({ error: 'El negocio no está activo' });
  }
  next();
}

function requireBusinessType(type) {
  return (req, res, next) => {
    if (req.user?.business_type !== type) {
      return res.status(403).json({ error: 'Esta cuenta no tiene acceso a este módulo' });
    }
    next();
  };
}

module.exports = { JWT_SECRET, signToken, requireAuth, requireOwner, requireTenant, requireBusinessType };
