const db = require('../../db');
const { validateArgs, ValidationError } = require('./validate');
const { ServiceError } = require('../../services/errors');

/**
 * Registro de herramientas que el orquestador de IA puede invocar.
 *
 * Formato estándar de cada tool (ver server/src/ai/tools/*.js):
 *   name                 — namespace.accion, único.
 *   description          — para el modelo y para el usuario en confirmaciones.
 *   businessTypes        — rubros donde esta tool está habilitada.
 *   permission           — string tipo "taller.ventas.create"; ver security/permissions.js.
 *   riskLevel            — 'read' | 'write' | 'destructive'.
 *   requiresConfirmation — si el orchestrator debe pedir confirmación antes de ejecutar.
 *   inputSchema          — validado con validateArgs() antes de tocar el service.
 *   refs                 — { campo: 'tabla' } — antes de pedir confirmación o
 *                          ejecutar, verifica que ese id exista Y pertenezca
 *                          al tenant del contexto (mismo patrón que
 *                          utils/crud.js). Sin esto, una tool con
 *                          requiresConfirmation:true dejaría crear una
 *                          acción "pendiente de confirmar" para un id ajeno
 *                          que de todas formas el service iba a rechazar —
 *                          no es un hueco de seguridad (el service igual lo
 *                          bloquea), pero sí falla tarde. Con refs falla ya
 *                          en el propose, antes de guardar nada.
 *   handler(context, args) — SIEMPRE delega en server/src/services/*, nunca en SQLite directo.
 */
const tools = new Map();
const RISK_LEVELS = ['read', 'write', 'destructive'];

function registerTool(name, config) {
  const {
    description,
    businessTypes,
    permission,
    riskLevel = 'write',
    requiresConfirmation = false,
    inputSchema = {},
    refs = {},
    handler,
  } = config;
  if (tools.has(name)) throw new Error(`La herramienta "${name}" ya está registrada`);
  if (!Array.isArray(businessTypes) || businessTypes.length === 0) throw new Error(`"${name}" necesita businessTypes`);
  if (!permission || typeof permission !== 'string') throw new Error(`"${name}" necesita un "permission" (ej. "taller.ventas.create")`);
  if (!RISK_LEVELS.includes(riskLevel)) throw new Error(`"${name}" tiene riskLevel inválido: ${riskLevel}`);
  if (typeof handler !== 'function') throw new Error(`"${name}" necesita un handler(context, args)`);
  tools.set(name, { name, description, businessTypes, permission, riskLevel, requiresConfirmation, inputSchema, refs, handler });
}

function getTool(name) {
  return tools.get(name);
}

function listTools(businessType) {
  return [...tools.values()].filter((t) => !businessType || t.businessTypes.includes(businessType));
}

function codeForStatus(status) {
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'DUPLICATE';
  if (status === 400) return 'VALIDATION_ERROR';
  return 'INTERNAL_ERROR';
}

function stripSmuggledTenant(name, rawArgs) {
  const args = { ...(rawArgs || {}) };
  const smuggled = 'tenantId' in args || 'tenant_id' in args;
  delete args.tenantId;
  delete args.tenant_id;
  if (smuggled) {
    console.warn(`[ai] la tool "${name}" recibió un tenantId en los argumentos — ignorado, se usó el del AiContext`);
  }
  return args;
}

/**
 * Verifica rubro + permiso + forma de los argumentos SIN ejecutar el
 * handler. Lo usa runTool() antes de ejecutar, y el orchestrator lo usa
 * solo (sin ejecutar) para validar una acción sensible ANTES de pedir
 * confirmación — así no se le pide confirmar al usuario algo que de
 * cualquier forma iba a fallar por datos inválidos.
 */
function authorize(name, context, rawArgs) {
  const tool = getTool(name);
  if (!tool) return { ok: false, result: { success: false, code: 'TOOL_NOT_FOUND', message: `Herramienta desconocida: ${name}` } };

  const args = stripSmuggledTenant(name, rawArgs);

  if (!tool.businessTypes.includes(context.businessType)) {
    return {
      ok: false,
      result: {
        success: false,
        code: 'TOOL_NOT_AVAILABLE_FOR_BUSINESS_TYPE',
        message: `"${name}" no está disponible para el rubro "${context.businessType}"`,
      },
    };
  }
  if (!context.permissions?.includes(tool.permission)) {
    return { ok: false, result: { success: false, code: 'PERMISSION_DENIED', message: `No tienes permiso (${tool.permission}) para esta acción` } };
  }
  try {
    validateArgs(tool.inputSchema, args);
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, result: { success: false, code: 'VALIDATION_ERROR', message: err.message } };
    throw err;
  }

  for (const [field, refTable] of Object.entries(tool.refs || {})) {
    const value = args[field];
    if (value === undefined || value === null || value === '') continue;
    const row = db.prepare(`SELECT 1 FROM ${refTable} WHERE id = ? AND tenant_id = ?`).get(value, context.tenantId);
    if (!row) {
      return { ok: false, result: { success: false, code: 'VALIDATION_ERROR', message: `"${field}" no existe o no pertenece a tu negocio` } };
    }
  }

  return { ok: true, tool, args };
}

/**
 * Ejecuta una tool. Nunca lanza — siempre devuelve { success, data } o
 * { success:false, code, message }, para que el modelo (o el propio
 * orchestrator) puedan manejarlo sin ver mensajes de SQLite ni stack traces.
 */
function runTool(name, context, rawArgs) {
  const auth = authorize(name, context, rawArgs);
  if (!auth.ok) return auth.result;

  try {
    const data = auth.tool.handler(context, auth.args);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { success: false, code: codeForStatus(err.status), message: err.message };
    }
    console.error(`[ai] error inesperado ejecutando "${name}":`, err);
    return { success: false, code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno. Intenta de nuevo.' };
  }
}

module.exports = { registerTool, getTool, listTools, authorize, runTool };
