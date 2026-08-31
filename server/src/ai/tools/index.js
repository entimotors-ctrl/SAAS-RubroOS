/**
 * Registra todas las herramientas de IA disponibles. Importar este archivo
 * (require) es lo único necesario para poblar el toolRegistry — no ejecuta
 * ninguna acción por sí mismo, solo declara qué existe.
 */
require('./tallerTools');
require('./barberiaTools');
require('./agroTools');
require('./ganaderiaTools');
require('./carwashTools');

module.exports = require('../core/toolRegistry');
