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

function buildBusinessPrompt({ businessType, tenantName }) {
  const contexto = RUBRO_CONTEXTO[businessType] || 'un negocio en RubroOS.';
  return `Estás ayudando a "${tenantName || 'este negocio'}", que es ${contexto}\nSolo puedes usar las herramientas habilitadas para este rubro (${businessType}) — nunca intentes usar una herramienta de otro rubro, aunque el usuario la mencione.`;
}

module.exports = { buildBusinessPrompt };
