/**
 * Registro de herramientas que un futuro orquestador de IA podrá invocar.
 * Todavía no lo llama ningún LLM — esto es la arquitectura, no el chatbot.
 *
 * Cada herramienta:
 *  - declara a qué rubro(s) aplica (businessTypes),
 *  - delega SIEMPRE en una función de server/src/services/* (nunca toca
 *    SQLite directamente — así IA y API REST comparten la misma lógica y
 *    las mismas validaciones),
 *  - puede marcarse requiresConfirmation para acciones sensibles (ver
 *    server/src/ai/security/permissions.js y el punto 11 de la auditoría).
 */
const tools = new Map();

function registerTool(name, { description, businessTypes, requiresConfirmation = false, handler }) {
  if (tools.has(name)) throw new Error(`La herramienta "${name}" ya está registrada`);
  if (typeof handler !== 'function') throw new Error(`La herramienta "${name}" necesita un handler(context, args)`);
  tools.set(name, { name, description, businessTypes, requiresConfirmation, handler });
}

function getTool(name) {
  return tools.get(name);
}

function listTools(businessType) {
  return [...tools.values()].filter((t) => !businessType || t.businessTypes.includes(businessType));
}

/**
 * Punto único de ejecución. Aplica, en este orden:
 *   1) el rubro de la herramienta coincide con el del tenant (AiContext),
 *   2) si la herramienta es sensible y no viene confirmada, se detiene y
 *      pide confirmación en vez de ejecutar — nunca ejecuta "por si acaso".
 *   3) delega en el service, que ya valida tenant_id/tipos/referencias.
 */
function runTool(name, context, args, { confirmed = false } = {}) {
  const tool = getTool(name);
  if (!tool) throw new Error(`Herramienta desconocida: ${name}`);
  if (!tool.businessTypes.includes(context.businessType)) {
    throw new Error(`La herramienta "${name}" no está disponible para el rubro "${context.businessType}"`);
  }
  if (tool.requiresConfirmation && !confirmed) {
    return { needsConfirmation: true, tool: name, message: `Esta acción (${tool.description}) requiere confirmación explícita antes de ejecutarse.` };
  }
  const result = tool.handler(context, args);
  return { needsConfirmation: false, tool: name, result };
}

module.exports = { registerTool, getTool, listTools, runTool };
