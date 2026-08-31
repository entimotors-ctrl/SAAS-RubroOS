const { registerTool } = require('../core/toolRegistry');
const barberiaService = require('../../services/barberiaService');

registerTool('barberia.crearCuenta', {
  description: 'Abre una cuenta (servicios/productos) para un cliente en la silla',
  businessTypes: ['barberia'],
  requiresConfirmation: false,
  handler: (context, args) => barberiaService.crearCuenta(context.tenantId, args),
});

registerTool('barberia.cobrarCuenta', {
  description: 'Cobra y cierra una cuenta abierta',
  businessTypes: ['barberia'],
  requiresConfirmation: true,
  handler: (context, args) => barberiaService.cobrarCuenta(context.tenantId, args.cuentaId, args.metodoPago),
});
