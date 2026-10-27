/** Regression: resolved/absent actions must never fall through to the LLM. */
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-regression-test-only';
const assert = require('node:assert/strict');
const db = require('../src/db');
const history = require('../src/ai/core/history');
const { tryHandle } = require('../src/whatsapp/confirmationIntent');

(async () => {
  const tenantId = Number(db.prepare("INSERT INTO tenants (business_type, nombre_empresa, slug) VALUES ('taller', 'Regression', 'regression')").run().lastInsertRowid);
  const context = { tenantId, businessType: 'taller', role: 'tenant_admin' };
  const conversation = history.createConversation({ tenantId, channel: 'whatsapp' });
  let checks = 0;
  for (const status of [null, 'rejected', 'executed']) {
    if (status) history.createAction({ conversationId: conversation.id, tenantId, toolName: 'taller.registrarVenta', args: {}, status });
    const before = db.prepare('SELECT * FROM ai_actions').all();
    for (const text of ['Cancelar 1', 'Cancelar 2', 'no 2', 'cancelar todo', 'sí', 'no', 'confirmar', '2', '9']) {
      const count = history.listMessages(conversation.id, tenantId).length;
      const result = await tryHandle({ context, conversation, text });
      assert.ok(result, `${text}, state=${status}: must not fall through to LLM`);
      assert.match(result.message, /no hay acciones pendientes/i);
      assert.equal(history.listMessages(conversation.id, tenantId).length, count + 2);
      assert.deepEqual(db.prepare('SELECT * FROM ai_actions').all(), before);
      checks++;
    }
  }
  for (const text of ['no sé cuántos productos tengo', 'quiero vender 2 filtros', 'precio del aceite']) {
    const count = history.listMessages(conversation.id, tenantId).length;
    assert.equal(await tryHandle({ context, conversation, text }), null);
    assert.equal(history.listMessages(conversation.id, tenantId).length, count);
    checks++;
  }
  console.log(`${checks}/${checks} checks OK`);
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => db.close());
