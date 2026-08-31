const express = require('express');
const rateLimit = require('express-rate-limit');
const identityService = require('../whatsapp/identityService');

const router = express.Router();

// Pocos intentos: es un código de 6 dígitos, hay que dificultar fuerza bruta.
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

function requireTenantAdmin(req, res, next) {
  if (req.user?.role !== 'tenant_admin') {
    return res.status(403).json({ error: 'Solo un administrador del negocio puede hacer esto' });
  }
  next();
}

router.get('/status', (req, res, next) => {
  try {
    res.json(identityService.getStatus(req.user.tenant_id));
  } catch (err) {
    next(err);
  }
});

router.post('/link', requireTenantAdmin, async (req, res, next) => {
  try {
    const { phone_number } = req.body || {};
    if (!phone_number) return res.status(400).json({ error: 'Falta phone_number' });
    const result = await identityService.initiateLink({ tenantId: req.user.tenant_id, userId: req.user.sub, phoneNumberRaw: phone_number });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/verify', requireTenantAdmin, verifyLimiter, (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Falta code' });
    const result = identityService.verifyLink({ tenantId: req.user.tenant_id, userId: req.user.sub, code });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/unlink', requireTenantAdmin, (req, res, next) => {
  try {
    const result = identityService.unlink({ tenantId: req.user.tenant_id, userId: req.user.sub });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
