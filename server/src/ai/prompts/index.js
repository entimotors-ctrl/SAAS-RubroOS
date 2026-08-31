const { CORE_PROMPT } = require('./core');
const { buildBusinessPrompt } = require('./business');
const { TOOLS_PROMPT } = require('./tools');
const { SECURITY_PROMPT } = require('./security');

/**
 * Compone el prompt completo para una conversación: core + rubro del
 * tenant + cómo usar las tools + reglas de seguridad. Ningún secreto ni
 * variable de entorno se interpola aquí.
 */
function buildFullPrompt({ businessType, tenantName }) {
  return [CORE_PROMPT, buildBusinessPrompt({ businessType, tenantName }), TOOLS_PROMPT, SECURITY_PROMPT].join('\n\n');
}

module.exports = { buildFullPrompt, CORE_PROMPT, buildBusinessPrompt, TOOLS_PROMPT, SECURITY_PROMPT };
