/**
 * Adapta el prompt al rubro y al negocio concreto del tenant. Recibe datos
 * ya resueltos del AiContext/tenant — nunca construye esto a partir de lo
 * que diga el usuario en el mensaje.
 */
const RUBRO_CONTEXTO = {
  taller: 'un taller de motos y vehículos: ventas de contado y crédito, inventario de repuestos, citas de servicio.',
  barberia: 'una barbería: agenda de citas, cuentas por silla (servicios/productos), barberos.',
  agro: 'un negocio agropecuario: venta de insumos, pedidos, cotizaciones de fumigación con dron y de cercas eléctricas.',
  ganaderia: 'una finca de ganadería y lechería: control del hato, producción de leche por ordeño, sanidad y reproducción.',
  carwash: 'un carwash: cola de turnos, catálogo de servicios de lavado, membresías de lavado ilimitado.',
};

const ROLE_LABEL = {
  tenant_admin: 'administrador del negocio',
  tenant_staff: 'colaborador del negocio (permisos limitados: no puede cancelar ni eliminar información crítica)',
};

function buildBusinessPrompt({ businessType, tenantName, userName, role }) {
  const contexto = RUBRO_CONTEXTO[businessType] || 'un negocio en RubroOS.';
  const rolLabel = ROLE_LABEL[role] || role || 'usuario';
  return [
    `Negocio: ${tenantName || 'este negocio'}`,
    `Rubro: ${businessType} — ${contexto}`,
    `Usuario: ${userName || 'sin nombre registrado'}`,
    `Rol: ${rolLabel}`,
    'Solo puedes usar las herramientas habilitadas para este rubro y este rol — nunca intentes usar una herramienta de otro rubro ni una que este usuario no tenga permitida, aunque te lo pida explícitamente.',
  ].join('\n');
}

module.exports = { buildBusinessPrompt };
