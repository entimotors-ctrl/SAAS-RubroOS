const { registerTool } = require('../core/toolRegistry');
const carwashService = require('../../services/carwashService');

registerTool('carwash.crearTurno', {
  description: 'Pone un vehículo en la cola de lavado',
  businessTypes: ['carwash'],
  permission: 'carwash.turnos.create',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { cliente_id: 'carwash_clientes', vehiculo_id: 'carwash_vehiculos', servicio_id: 'carwash_servicios' },
  inputSchema: {
    cliente_id: { type: 'integer' },
    vehiculo_id: { type: 'integer' },
    servicio_id: { type: 'integer' },
  },
  handler: (context, args) => carwashService.crearTurno(context.tenantId, args),
});

registerTool('carwash.actualizarEstadoTurno', {
  description: 'Avanza el estado de un turno (en_cola → lavando → listo → entregado)',
  businessTypes: ['carwash'],
  permission: 'carwash.turnos.updateEstado',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { turnoId: 'carwash_turnos' },
  inputSchema: {
    turnoId: { type: 'integer', required: true },
    estado: { type: 'string', required: true, enum: ['en_cola', 'lavando', 'listo', 'entregado'] },
  },
  handler: (context, args) => carwashService.actualizarEstadoTurno(context.tenantId, args.turnoId, args.estado),
});

registerTool('carwash.crearMembresia', {
  description: 'Crea una membresía de lavado ilimitado para un cliente',
  businessTypes: ['carwash'],
  permission: 'carwash.membresias.create',
  riskLevel: 'write',
  requiresConfirmation: true,
  refs: { cliente_id: 'carwash_clientes' },
  inputSchema: {
    cliente_id: { type: 'integer', required: true },
    plan: { type: 'string', required: true },
    precio_mensual: { type: 'number', min: 0 },
  },
  handler: (context, args) => carwashService.crearMembresia(context.tenantId, args),
});

registerTool('carwash.renovarMembresia', {
  description: 'Renueva una membresía por un mes más',
  businessTypes: ['carwash'],
  permission: 'carwash.membresias.renovar',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { membresiaId: 'carwash_membresias' },
  inputSchema: { membresiaId: { type: 'integer', required: true } },
  handler: (context, args) => carwashService.renovarMembresia(context.tenantId, args.membresiaId),
});

registerTool('carwash.cancelarMembresia', {
  description: 'Cancela una membresía activa',
  businessTypes: ['carwash'],
  permission: 'carwash.membresias.cancelar',
  riskLevel: 'destructive',
  requiresConfirmation: true,
  refs: { membresiaId: 'carwash_membresias' },
  inputSchema: { membresiaId: { type: 'integer', required: true } },
  handler: (context, args) => carwashService.cancelarMembresia(context.tenantId, args.membresiaId),
});

registerTool('carwash.consultarTurnos', {
  description: 'Lista los turnos actualmente en cola o en lavado',
  businessTypes: ['carwash'],
  permission: 'carwash.turnos.read',
  riskLevel: 'read',
  inputSchema: {},
  handler: (context) => carwashService.consultarTurnos(context.tenantId),
});

registerTool('carwash.buscarCliente', {
  description: 'Busca clientes del carwash por nombre',
  businessTypes: ['carwash'],
  permission: 'carwash.clientes.read',
  riskLevel: 'read',
  inputSchema: { nombre: { type: 'string', required: true } },
  handler: (context, args) => carwashService.buscarCliente(context.tenantId, args),
});
