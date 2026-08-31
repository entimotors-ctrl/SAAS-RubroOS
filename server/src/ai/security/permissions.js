/**
 * Modelo de permisos de las tools de IA.
 *
 * Una única fuente de verdad: el permiso otorgado a un rol se calcula
 * directamente del toolRegistry (cada tool ya declara su `permission` y su
 * `riskLevel`), en vez de mantener un catálogo de permisos aparte que se
 * podría desincronizar de las tools reales.
 *
 * Política:
 *   tenant_admin — todos los permisos de las tools de su rubro (read, write, destructive).
 *   tenant_staff — read y write, NUNCA destructive (cancelar, eliminar, modificar
 *                  información crítica queda reservado al admin del negocio).
 *   cualquier otro rol (p. ej. owner, que no tiene tenant/rubro propio) — ninguno;
 *                  las tools de rubro no aplican a esa cuenta.
 *
 * La IA nunca decide esto: se calcula en el backend a partir del rol real
 * del usuario autenticado, antes de que exista ninguna tool call.
 */
const ROLE_ALLOWED_RISK_LEVELS = {
  tenant_admin: ['read', 'write', 'destructive'],
  tenant_staff: ['read', 'write'],
};

function permissionsForRole(role, businessType) {
  const allowedLevels = ROLE_ALLOWED_RISK_LEVELS[role];
  if (!allowedLevels || !businessType) return [];
  // require perezoso para evitar ciclos de carga con toolRegistry/tools.
  const { listTools } = require('../core/toolRegistry');
  return listTools(businessType)
    .filter((t) => allowedLevels.includes(t.riskLevel))
    .map((t) => t.permission);
}

module.exports = { permissionsForRole, ROLE_ALLOWED_RISK_LEVELS };
