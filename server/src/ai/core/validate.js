/**
 * Validador de argumentos ligero para tools de IA — sin dependencias nuevas.
 * No reemplaza la validación de negocio que ya hacen server/src/services/*
 * (esa sigue siendo la autoridad final); esto es una primera barrera
 * pensada específicamente para argumentos generados por un modelo, que
 * puede mandar tipos equivocados o números fuera de rango de una forma que
 * un formulario web normalmente no permite.
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateArgs(schema, args) {
  const value = args || {};
  for (const [field, rule] of Object.entries(schema || {})) {
    const v = value[field];
    const present = v !== undefined && v !== null && v !== '';

    if (rule.required && !present) {
      throw new ValidationError(`Falta el campo requerido "${field}"`);
    }
    if (!present) continue;

    if (rule.type === 'number' || rule.type === 'integer') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new ValidationError(`"${field}" debe ser un número`);
      if (rule.type === 'integer' && !Number.isInteger(n)) throw new ValidationError(`"${field}" debe ser un número entero`);
      if (rule.min !== undefined && n < rule.min) throw new ValidationError(`"${field}" debe ser mayor o igual a ${rule.min}`);
      if (rule.max !== undefined && n > rule.max) throw new ValidationError(`"${field}" debe ser menor o igual a ${rule.max}`);
    } else if (rule.type === 'string') {
      if (typeof v !== 'string') throw new ValidationError(`"${field}" debe ser texto`);
      if (rule.enum && !rule.enum.includes(v)) throw new ValidationError(`"${field}" debe ser uno de: ${rule.enum.join(', ')}`);
    } else if (rule.type === 'array') {
      if (!Array.isArray(v)) throw new ValidationError(`"${field}" debe ser una lista`);
      if (rule.minLength !== undefined && v.length < rule.minLength) {
        throw new ValidationError(`"${field}" necesita al menos ${rule.minLength} elemento(s)`);
      }
      if (rule.itemSchema) {
        v.forEach((item, i) => {
          try {
            validateArgs(rule.itemSchema, item);
          } catch (err) {
            throw new ValidationError(`"${field}[${i}]": ${err.message}`);
          }
        });
      }
    }
  }
  return true;
}

module.exports = { validateArgs, ValidationError };
