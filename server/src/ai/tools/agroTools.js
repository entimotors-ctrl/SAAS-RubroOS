const { registerTool } = require('../core/toolRegistry');
const agroService = require('../../services/agroService');

registerTool('agro.crearPedido', {
  description: 'Crea un pedido de insumos para un cliente',
  businessTypes: ['agro'],
  permission: 'agro.pedidos.create',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { cliente_id: 'agro_clientes' },
  inputSchema: {
    cliente_id: { type: 'integer' },
    items: {
      type: 'array',
      required: true,
      minLength: 1,
      itemSchema: {
        producto_id: { type: 'integer' },
        cantidad: { type: 'number', min: 0.01 },
        precio_unitario: { type: 'number', min: 0 },
      },
    },
  },
  handler: (context, args) => agroService.crearPedido(context.tenantId, args),
});

registerTool('agro.actualizarEstadoPedido', {
  description: 'Cambia el estado de un pedido existente',
  businessTypes: ['agro'],
  permission: 'agro.pedidos.updateEstado',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { pedidoId: 'agro_pedidos' },
  inputSchema: {
    pedidoId: { type: 'integer', required: true },
    estado: { type: 'string', required: true },
  },
  handler: (context, args) => agroService.actualizarEstadoPedido(context.tenantId, args.pedidoId, args.estado),
});

registerTool('agro.cotizarDron', {
  description: 'Genera una cotización de fumigación/fertilización/mapeo con dron',
  businessTypes: ['agro'],
  permission: 'agro.cotizaciones.dron',
  riskLevel: 'write',
  requiresConfirmation: false,
  inputSchema: {
    hectareas: { type: 'number', required: true, min: 0.01 },
    tipo_servicio: { type: 'string', required: true, enum: ['fumigacion', 'fertilizacion', 'mapeo'] },
    cliente_nombre: { type: 'string' },
  },
  handler: (context, args) => agroService.cotizarDron(context.tenantId, args),
});

registerTool('agro.cotizarCerca', {
  description: 'Genera una cotización de cerca eléctrica',
  businessTypes: ['agro'],
  permission: 'agro.cotizaciones.cerca',
  riskLevel: 'write',
  requiresConfirmation: false,
  inputSchema: {
    metros: { type: 'number', required: true, min: 0.01 },
    hilos: { type: 'integer', min: 1, max: 12 },
    cliente_nombre: { type: 'string' },
  },
  handler: (context, args) => agroService.cotizarCerca(context.tenantId, args),
});

registerTool('agro.consultarInventario', {
  description: 'Lista el inventario de insumos agropecuarios',
  businessTypes: ['agro'],
  permission: 'agro.inventario.read',
  riskLevel: 'read',
  inputSchema: {},
  handler: (context) => agroService.consultarInventario(context.tenantId),
});

registerTool('agro.buscarCliente', {
  description: 'Busca clientes agro por nombre',
  businessTypes: ['agro'],
  permission: 'agro.clientes.read',
  riskLevel: 'read',
  inputSchema: { nombre: { type: 'string', required: true } },
  handler: (context, args) => agroService.buscarCliente(context.tenantId, args),
});
