/**
 * Error tipado para la capa de servicios de negocio. Lo lanzan las funciones
 * de server/src/services/* cuando una operación no puede completarse
 * (validación, referencia inválida, no encontrado, etc).
 *
 * Tanto las rutas REST como, más adelante, las herramientas de IA capturan
 * este error de la misma forma y lo traducen a una respuesta con el status
 * indicado — así ambos canales quedan sujetos exactamente a las mismas reglas.
 */
class ServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
  }
}

module.exports = { ServiceError };
