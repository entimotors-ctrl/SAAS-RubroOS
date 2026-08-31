/**
 * Adaptador: convierte el formato interno de una tool (toolRegistry) al
 * formato que necesita un proveedor de IA (JSON Schema, usado por OpenAI,
 * Claude y Gemini por igual). No toca la lógica de la tool — solo traduce
 * su `inputSchema` declarativo. Vive en core/ (no en providers/) porque no
 * es específico de OpenAI: cualquier proveedor nuevo lo puede reutilizar.
 */

function ruleToJsonSchema(rule) {
  if (rule.type === 'integer' || rule.type === 'number') {
    const schema = { type: rule.type === 'integer' ? 'integer' : 'number' };
    if (rule.min !== undefined) schema.minimum = rule.min;
    if (rule.max !== undefined) schema.maximum = rule.max;
    return schema;
  }
  if (rule.type === 'string') {
    const schema = { type: 'string' };
    if (rule.enum) schema.enum = rule.enum;
    return schema;
  }
  if (rule.type === 'array') {
    return { type: 'array', items: rule.itemSchema ? inputSchemaToJsonSchema(rule.itemSchema) : {} };
  }
  return {};
}

function inputSchemaToJsonSchema(inputSchema) {
  const properties = {};
  const required = [];
  for (const [field, rule] of Object.entries(inputSchema || {})) {
    properties[field] = { ...ruleToJsonSchema(rule), description: rule.description };
    if (rule.required) required.push(field);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

/** tool de toolRegistry.listTools() -> { name, description, parameters } genérico (JSON Schema). */
function toProviderTool(tool) {
  return { name: tool.name, description: tool.description, parameters: inputSchemaToJsonSchema(tool.inputSchema) };
}

function toProviderTools(tools) {
  return tools.map(toProviderTool);
}

module.exports = { toProviderTool, toProviderTools, inputSchemaToJsonSchema };
