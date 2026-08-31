const { registerTool } = require('../core/toolRegistry');
const tallerService = require('../../services/tallerService');

registerTool('taller.registrarVenta', {
  description: 'Registra una venta de contado o crédito en el taller',
  businessTypes: ['taller'],
  permission: 'taller.ventas.create',
  riskLevel: 'write',
  requiresConfirmation: true,
  refs: { cliente_id: 'taller_clientes' },
  inputSchema: {
    cliente_id: { type: 'integer' },
    tipo: { type: 'string', enum: ['contado', 'credito'] },
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
  handler: (context, args) => tallerService.registrarVenta(context.tenantId, args),
});

registerTool('taller.registrarAbono', {
  description: 'Registra un abono a una venta a crédito',
  businessTypes: ['taller'],
  permission: 'taller.ventas.abonar',
  riskLevel: 'write',
  requiresConfirmation: true,
  refs: { ventaId: 'taller_ventas' },
  inputSchema: {
    ventaId: { type: 'integer', required: true },
    monto: { type: 'number', required: true, min: 0.01 },
  },
  handler: (context, args) => tallerService.registrarAbono(context.tenantId, args.ventaId, args.monto),
});

registerTool('taller.consultarInventario', {
  description: 'Lista el inventario del taller (nombre, sku, precio, stock)',
  businessTypes: ['taller'],
  permission: 'taller.inventario.read',
  riskLevel: 'read',
  inputSchema: {},
  handler: (context) => tallerService.consultarInventario(context.tenantId),
});

registerTool('taller.buscarCliente', {
  description: 'Busca clientes del taller por nombre',
  businessTypes: ['taller'],
  permission: 'taller.clientes.read',
  riskLevel: 'read',
  inputSchema: { nombre: { type: 'string', required: true } },
  handler: (context, args) => tallerService.buscarCliente(context.tenantId, args),
});
