const { registerTool } = require('../core/toolRegistry');
const ganaderiaService = require('../../services/ganaderiaService');

registerTool('ganaderia.registrarProduccion', {
  description: 'Registra la producción de leche de un ordeño (animal, fecha, turno, litros)',
  businessTypes: ['ganaderia'],
  requiresConfirmation: false,
  handler: (context, args) => ganaderiaService.registrarProduccion(context.tenantId, args),
});
