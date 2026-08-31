const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'rubroos-dev-secret-cambia-esto-en-produccion';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Solo el dueño del SaaS puede hacer esto' });
  next();
}

function requireTenant(req, res, next) {
  if (!req.user?.tenant_id || !req.user?.business_type) {
    return res.status(403).json({ error: 'Esta cuenta no pertenece a un negocio' });
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
