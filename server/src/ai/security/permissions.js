/**
 * Espejo del mismo modelo de permisos que ya usa la API REST
 * (requireTenant + requireBusinessType + role, ver server/src/middleware/auth.js).
 * Una herramienta de IA nunca debe tener más acceso que el usuario humano
 * equivalente — estas funciones son el punto donde eso se verifica antes
 * de siquiera intentar ejecutar una tool.
 */

function canUseTools(context) {
  return Boolean(context?.tenantId && context?.businessType);
}

function canExecuteWrites(context) {
  return ['tenant_admin', 'tenant_staff', 'owner'].includes(context?.role);
}

module.exports = { canUseTools, canExecuteWrites };
