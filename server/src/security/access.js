const db = require('../db');

function activeTenant(tenantId, businessType) {
  return db.prepare("SELECT id FROM tenants WHERE id = ? AND business_type = ? AND status IN ('activo', 'trial')").get(tenantId, businessType);
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'tenant_admin') return res.status(403).json({ error: 'Solo el administrador del negocio puede realizar esta acción' });
  next();
}

module.exports = { activeTenant, requireAdmin };
