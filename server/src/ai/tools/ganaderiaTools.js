const { registerTool } = require('../core/toolRegistry');
const ganaderiaService = require('../../services/ganaderiaService');

registerTool('ganaderia.registrarProduccion', {
  description: 'Registra la producción de leche de un ordeño (animal, fecha, turno, litros)',
  businessTypes: ['ganaderia'],
  permission: 'ganaderia.produccion.create',
  riskLevel: 'write',
  requiresConfirmation: false,
  refs: { animal_id: 'ganaderia_animales' },
  inputSchema: {
    animal_id: { type: 'integer', required: true },
    fecha: { type: 'string', required: true },
    turno: { type: 'string', enum: ['AM', 'PM'] },
    litros: { type: 'number', required: true, min: 0.01 },
  },
  handler: (context, args) => ganaderiaService.registrarProduccion(context.tenantId, args),
});

registerTool('ganaderia.consultarProduccion', {
  description: 'Resumen de producción de leche (hoy, última semana, por animal)',
  businessTypes: ['ganaderia'],
  permission: 'ganaderia.produccion.read',
  riskLevel: 'read',
  inputSchema: {},
  handler: (context) => ganaderiaService.resumenProduccion(context.tenantId),
});

registerTool('ganaderia.buscarAnimal', {
  description: 'Busca un animal del hato por arete o por nombre',
  businessTypes: ['ganaderia'],
  permission: 'ganaderia.animales.read',
  riskLevel: 'read',
  inputSchema: { arete: { type: 'string' }, nombre: { type: 'string' } },
  handler: (context, args) => ganaderiaService.buscarAnimal(context.tenantId, args),
});
