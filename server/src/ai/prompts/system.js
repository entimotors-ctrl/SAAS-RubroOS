/**
 * Placeholder del system prompt del asistente. No está conectado a ningún
 * proveedor de IA todavía — se deja aquí solo como el lugar donde ese texto
 * vivirá cuando se implemente el orquestador (fase futura, usa AI_API_KEY).
 */
function buildSystemPrompt({ businessType, tenantName }) {
  return [
    `Eres el asistente de RubroOS para "${tenantName}" (rubro: ${businessType}).`,
    'Solo puedes actuar dentro de las herramientas registradas para este rubro.',
    'Antes de una acción sensible (venta, cobro, cancelación), pide confirmación explícita al usuario.',
    'Nunca inventes datos: si necesitas un id o un dato que no tienes, pregúntalo o búscalo con una herramienta de consulta.',
  ].join('\n');
}

module.exports = { buildSystemPrompt };
