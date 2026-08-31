const { registerTool } = require('../core/toolRegistry');
const barberiaService = require('../../services/barberiaService');

registerTool('barberia.crearCuenta', {
  description: 'Abre una cuenta (servicios/productos) para un cliente en la silla',
  businessTypes: ['barberia'],
  permission: 'barberia.cuentas.create',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { cliente_id: 'barberia_clientes', barbero_id: 'barberia_barberos' },
  inputSchema: {
    cliente_id: { type: 'integer' },
    barbero_id: { type: 'integer' },
    items: {
      type: 'array',
      required: true,
      minLength: 1,
      itemSchema: {
        descripcion: { type: 'string', required: true },
        cantidad: { type: 'number', min: 0.01 },
        precio_unitario: { type: 'number', min: 0 },
      },
    },
  },
  handler: (context, args) => barberiaService.crearCuenta(context.tenantId, args),
});

registerTool('barberia.cobrarCuenta', {
  description: 'Cobra y cierra una cuenta abierta',
  businessTypes: ['barberia'],
  permission: 'barberia.cuentas.cobrar',
  riskLevel: 'write',
  requiresConfirmation: true,
  refs: { cuentaId: 'barberia_cuentas' },
  inputSchema: {
    cuentaId: { type: 'integer', required: true },
    metodoPago: { type: 'string' },
  },
  handler: (context, args) => barberiaService.cobrarCuenta(context.tenantId, args.cuentaId, args.metodoPago),
});

registerTool('barberia.consultarCitas', {
  description: 'Lista las próximas citas agendadas (desde hoy en adelante)',
  businessTypes: ['barberia'],
  permission: 'barberia.citas.read',
  riskLevel: 'read',
  inputSchema: { desde: { type: 'string' } },
  handler: (context, args) => barberiaService.consultarCitas(context.tenantId, args),
});

registerTool('barberia.buscarCliente', {
  description: 'Busca clientes de la barbería por nombre',
  businessTypes: ['barberia'],
  permission: 'barberia.clientes.read',
  riskLevel: 'read',
  inputSchema: { nombre: { type: 'string', required: true } },
  handler: (context, args) => barberiaService.buscarCliente(context.tenantId, args),
});
