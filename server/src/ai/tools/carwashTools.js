const { registerTool } = require('../core/toolRegistry');
const carwashService = require('../../services/carwashService');

registerTool('carwash.crearTurno', {
  description: 'Pone un vehículo en la cola de lavado',
  businessTypes: ['carwash'],
  requiresConfirmation: false,
  handler: (context, args) => carwashService.crearTurno(context.tenantId, args),
});

registerTool('carwash.actualizarEstadoTurno', {
  description: 'Avanza el estado de un turno (en_cola → lavando → listo → entregado)',
  businessTypes: ['carwash'],
  requiresConfirmation: false,
  handler: (context, args) => carwashService.actualizarEstadoTurno(context.tenantId, args.turnoId, args.estado),
});

registerTool('carwash.crearMembresia', {
  description: 'Crea una membresía de lavado ilimitado para un cliente',
  businessTypes: ['carwash'],
  requiresConfirmation: true,
  handler: (context, args) => carwashService.crearMembresia(context.tenantId, args),
});

registerTool('carwash.renovarMembresia', {
  description: 'Renueva una membresía por un mes más',
  businessTypes: ['carwash'],
  requiresConfirmation: false,
  handler: (context, args) => carwashService.renovarMembresia(context.tenantId, args.membresiaId),
});

registerTool('carwash.cancelarMembresia', {
  description: 'Cancela una membresía activa',
  businessTypes: ['carwash'],
  requiresConfirmation: true,
  handler: (context, args) => carwashService.cancelarMembresia(context.tenantId, args.membresiaId),
});
