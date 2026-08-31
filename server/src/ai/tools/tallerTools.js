const { registerTool } = require('../core/toolRegistry');
const tallerService = require('../../services/tallerService');

registerTool('taller.registrarVenta', {
  description: 'Registra una venta de contado o crédito en el taller',
  businessTypes: ['taller'],
  requiresConfirmation: true,
  handler: (context, args) => tallerService.registrarVenta(context.tenantId, args),
});

registerTool('taller.registrarAbono', {
  description: 'Registra un abono a una venta a crédito',
  businessTypes: ['taller'],
  requiresConfirmation: true,
  handler: (context, args) => tallerService.registrarAbono(context.tenantId, args.ventaId, args.monto),
});
