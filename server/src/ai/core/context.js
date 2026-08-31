const { permissionsForRole } = require('../security/permissions');

/**
 * AiContext: la identidad bajo la que se ejecuta una herramienta de IA.
 *
 * Se construye igual sin importar el canal (chat web o WhatsApp): siempre a
 * partir de un usuario YA autenticado o YA vinculado, nunca de un tenant_id
 * que venga suelto en el mensaje. Esto es lo que garantiza que la IA quede
 * sujeta a las mismas reglas de aislamiento multi-tenant que ya aplica el
 * middleware requireAuth/requireTenant de la API REST (ver
 * server/src/middleware/auth.js) — la IA no es un camino alterno, es otra
 * interfaz sobre las mismas reglas.
 *
 * `permissions` se calcula aquí, en el backend, a partir del rol real
 * (ver security/permissions.js) — nunca lo decide el modelo ni llega desde
 * el mensaje del usuario.
 */
function buildContext({ userId, tenantId, businessType, role, channel = 'web' }) {
  if (!tenantId || !businessType) {
    throw new Error('AiContext requiere tenantId y businessType ya resueltos; no se aceptan sueltos desde el mensaje del usuario.');
  }
  require('../tools'); // efecto secundario: registra todas las tools antes de calcular permisos
  const permissions = permissionsForRole(role, businessType);
  return { userId, tenantId, businessType, role, channel, permissions };
}

module.exports = { buildContext };
