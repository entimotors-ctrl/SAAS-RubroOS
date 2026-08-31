const express = require('express');
const rateLimit = require('express-rate-limit');
const { buildContext } = require('../ai/core/context');
const chatService = require('../ai/core/chatService');
const history = require('../ai/core/history');

const router = express.Router();

// Rate limit propio del chat de IA: generoso para una conversación normal,
// pero acota el costo/abuso del proveedor. Independiente del limiter de
// /auth/* (no comparten balde).
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes al asistente. Espera un momento e intenta de nuevo.' },
});

function contextFromRequest(req) {
  // AiContext se construye SIEMPRE desde el JWT ya verificado por
  // requireAuth/requireTenant — nunca desde el body de la petición.
  return buildContext({
    userId: req.user.sub,
    tenantId: req.user.tenant_id,
    businessType: req.user.business_type,
    role: req.user.role,
    channel: 'web',
  });
}

router.post('/chat', aiLimiter, async (req, res, next) => {
  try {
    const context = contextFromRequest(req);
    const { conversationId, message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }
    if (String(message).length > 2000) {
      return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres)' });
    }
    const result = await chatService.handleChatMessage({
      context,
      conversationId: conversationId || undefined,
      userMessage: String(message).trim(),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/confirm', aiLimiter, async (req, res, next) => {
  try {
    const context = contextFromRequest(req);
    const { actionId } = req.body || {};
    if (!actionId) return res.status(400).json({ error: 'Falta actionId' });
    const result = await chatService.confirmAndReply({ context, actionId });
    if (result.type === 'error') return res.status(404).json({ error: result.message });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', aiLimiter, (req, res, next) => {
  try {
    const context = contextFromRequest(req);
    const { actionId } = req.body || {};
    if (!actionId) return res.status(400).json({ error: 'Falta actionId' });
    const result = chatService.cancelAndReply({ context, actionId });
    if (result.type === 'error') return res.status(404).json({ error: result.message });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Para "nueva conversación / continuar una anterior" en el frontend.
router.get('/conversations', (req, res, next) => {
  try {
    const context = contextFromRequest(req);
    const rows = history.listConversations(context.tenantId, { userId: context.userId }).slice(0, 20);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/conversations/:id/messages', (req, res, next) => {
  try {
    const context = contextFromRequest(req);
    const conversation = history.getConversation(req.params.id, context.tenantId);
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });
    const messages = history.listMessages(conversation.id, context.tenantId).map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at }));
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
