const { registerTool } = require('../core/toolRegistry');
const agroService = require('../../services/agroService');

registerTool('agro.crearPedido', {
  description: 'Crea un pedido de insumos para un cliente',
  businessTypes: ['agro'],
  requiresConfirmation: false,
  handler: (context, args) => agroService.crearPedido(context.tenantId, args),
});

registerTool('agro.actualizarEstadoPedido', {
  description: 'Cambia el estado de un pedido existente',
  businessTypes: ['agro'],
  requiresConfirmation: false,
  handler: (context, args) => agroService.actualizarEstadoPedido(context.tenantId, args.pedidoId, args.estado),
});

registerTool('agro.cotizarDron', {
  description: 'Genera una cotización de fumigación/fertilización/mapeo con dron',
  businessTypes: ['agro'],
  requiresConfirmation: false,
  handler: (context, args) => agroService.cotizarDron(context.tenantId, args),
});

registerTool('agro.cotizarCerca', {
  description: 'Genera una cotización de cerca eléctrica',
  businessTypes: ['agro'],
  requiresConfirmation: false,
  handler: (context, args) => agroService.cotizarCerca(context.tenantId, args),
});
