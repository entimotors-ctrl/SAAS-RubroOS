/**
 * Pruebas de integración del chat de IA — HTTP real contra el servidor
 * corriendo, con AI_FAKE_PROVIDER=1 (ver server/src/ai/providers/index.js
 * y fakeProviderForTests.js) para no depender de red ni de una cuenta de
 * OpenAI real. Esto prueba TODA la ingeniería (rutas, autenticación,
 * AiContext, orchestrator, toolRegistry, confirmaciones, aislamiento de
 * tenant, historial) de forma determinista.
 *
 * Requiere el servidor corriendo con AI_FAKE_PROVIDER=1 en su entorno:
 *   AI_FAKE_PROVIDER=1 node src/index.js
 * Uso: node tests/ai-chat.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const db = require('../src/db');
const { signToken } = require('../src/middleware/auth');

const BASE = process.env.API_URL || 'http://localhost:4000/api';

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  OK   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function registro(business_type, tag) {
  const email = `chat-${tag}-${Date.now()}@qa-ai-chat.test`;
  const r = await api('/auth/registro', {
    method: 'POST',
    body: { business_type, empresa_nombre: `QA AI Chat ${tag} ${Date.now()}`, nombre: `QA ${tag}`, email, password: 'QaAiChat2026!' },
  });
  if (r.status !== 201) throw new Error(`No se pudo registrar tenant de prueba (${tag}): ${JSON.stringify(r.body)}`);
  return { token: r.body.token, tenantId: r.body.tenant.id, userId: r.body.user.id, email };
}

function tokenForStaffUser({ tenantId, businessType, userId, email }) {
  return signToken({ sub: userId, tenant_id: tenantId, business_type: businessType, role: 'tenant_staff', nombre: 'QA Staff', email });
}

async function main() {
  console.log('=== Preparando tenants de prueba ===');
  const tallerA = await registro('taller', 'taller-a');
  const tallerB = await registro('taller', 'taller-b');
  const carwashA = await registro('carwash', 'carwash-a');

  // Cliente real para poder probar la cadena buscarCliente -> registrarVenta.
  const clienteJuan = db
    .prepare('INSERT INTO taller_clientes (tenant_id, nombre, telefono) VALUES (?, ?, ?)')
    .run(tallerA.tenantId, 'Juan Pérez', '9999-0000').lastInsertRowid;

  // Usuario tenant_staff insertado directo en BD (no hay endpoint público
  // para crear uno todavía) para probar el límite de permisos.
  const staffUserId = db
    .prepare("INSERT INTO users (tenant_id, business_type, email, password_hash, nombre, role) VALUES (?, 'carwash', ?, 'x', 'QA Staff', 'tenant_staff')")
    .run(carwashA.tenantId, `staff-${Date.now()}@qa-ai-chat.test`).lastInsertRowid;
  const staffToken = tokenForStaffUser({ tenantId: carwashA.tenantId, businessType: 'carwash', userId: staffUserId, email: 'staff' });
  const clienteCarwash = db.prepare('INSERT INTO carwash_clientes (tenant_id, nombre) VALUES (?, ?)').run(carwashA.tenantId, 'Cliente Carwash A').lastInsertRowid;
  const membresiaCarwash = db
    .prepare(
      `INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado)
       VALUES (?, ?, 'Ilimitado', 690, date('now'), date('now','+1 month'), 'activa')`
    )
    .run(carwashA.tenantId, clienteCarwash).lastInsertRowid;

  console.log('\n=== Lectura: "¿Cuánto stock tengo?" ===');
  const inventarioReal = db.prepare('SELECT COUNT(*) n FROM taller_inventario WHERE tenant_id = ?').get(tallerA.tenantId).n;
  const rInventario = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { message: '¿Cuánto stock tengo?' } });
  check('POST /ai/chat responde 200', rInventario.status === 200, JSON.stringify(rInventario.body));
  check('Responde con el conteo REAL de inventario (no inventado)', rInventario.body?.message?.includes(String(inventarioReal)), rInventario.body?.message);
  check('type es "message"', rInventario.body?.type === 'message');
  const conversationId = rInventario.body?.conversationId;
  check('Devuelve un conversationId', Boolean(conversationId));

  console.log('\n=== Búsqueda: "Busca al cliente Juan" ===');
  const rBuscar = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { conversationId, message: 'Busca al cliente Juan' } });
  check('Encuentra al cliente real por nombre', rBuscar.body?.message?.includes('Juan Pérez'), rBuscar.body?.message);

  console.log('\n=== Acción + confirmación: "Registra una venta de 2 filtros para Juan Pérez" ===');
  const ventasAntes = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA.tenantId).n;
  const rVenta = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { conversationId, message: 'Registra una venta de 2 filtros para Juan Pérez' } });
  check('type es "confirmation_required"', rVenta.body?.type === 'confirmation_required', JSON.stringify(rVenta.body));
  check('No expone tool_name ni argumentos internos al frontend', !JSON.stringify(rVenta.body).match(/toolName|registrarVenta/));
  const ventasDespuesDeProponer = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA.tenantId).n;
  check('NO se ejecutó la venta todavía (sigue pendiente de confirmar)', ventasDespuesDeProponer === ventasAntes);
  const actionId = rVenta.body?.actionId;

  const rConfirm = await api('/ai/confirm', { method: 'POST', token: tallerA.token, body: { actionId } });
  check('POST /ai/confirm responde 200', rConfirm.status === 200, JSON.stringify(rConfirm.body));
  const ventaCreada = db.prepare('SELECT * FROM taller_ventas WHERE tenant_id = ? ORDER BY id DESC LIMIT 1').get(tallerA.tenantId);
  check('La venta SÍ se ejecutó tras confirmar, con el total correcto (2 x 150)', ventaCreada?.total === 300, JSON.stringify(ventaCreada));
  check('El cliente vinculado es el correcto (Juan Pérez)', ventaCreada?.cliente_id === clienteJuan);

  console.log('\n=== Cancelación ===');
  const rVenta2 = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { conversationId, message: 'Registra una venta de 2 filtros para Juan Pérez' } });
  const actionId2 = rVenta2.body?.actionId;
  const rCancel = await api('/ai/cancel', { method: 'POST', token: tallerA.token, body: { actionId: actionId2 } });
  check('POST /ai/cancel responde 200', rCancel.status === 200, JSON.stringify(rCancel.body));
  const ventasDespuesDeCancelar = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA.tenantId).n;
  check('Cancelar NO ejecuta la tool (no se creó una segunda venta)', ventasDespuesDeCancelar === ventasDespuesDeProponer + 1);
  const confirmarCancelada = await api('/ai/confirm', { method: 'POST', token: tallerA.token, body: { actionId: actionId2 } });
  check(
    'No se puede confirmar una acción ya cancelada (200 con mensaje explicativo, no se re-ejecuta)',
    confirmarCancelada.status === 200 && confirmarCancelada.body?.message?.includes('rejected'),
    JSON.stringify(confirmarCancelada.body)
  );

  console.log('\n=== Seguridad: aislamiento de tenant ===');
  const rAjenaChat = await api('/ai/chat', { method: 'POST', token: tallerB.token, body: { conversationId, message: 'hola' } });
  check('Tenant B con el conversationId de Tenant A NO reutiliza esa conversación (abre una nueva)', rAjenaChat.body?.conversationId !== conversationId, JSON.stringify(rAjenaChat.body));

  const rAjenaMessages = await api(`/ai/conversations/${conversationId}/messages`, { token: tallerB.token });
  check('Tenant B no puede leer los mensajes de la conversación de Tenant A → 404', rAjenaMessages.status === 404);

  const rAjenoConfirm = await api('/ai/confirm', { method: 'POST', token: tallerB.token, body: { actionId } });
  check('Tenant B no puede confirmar una acción de Tenant A → 404', rAjenoConfirm.status === 404, JSON.stringify(rAjenoConfirm.body));

  console.log('\n=== Seguridad: permisos (tenant_staff intenta una acción destructive) ===');
  const rStaffConv = await api('/ai/chat', { method: 'POST', token: staffToken, body: { message: 'hola' } });
  const staffConvId = rStaffConv.body?.conversationId;
  const membresiaAntes = db.prepare('SELECT estado FROM carwash_membresias WHERE id = ?').get(membresiaCarwash).estado;
  const rStaffCancel = await api('/ai/chat', { method: 'POST', token: staffToken, body: { conversationId: staffConvId, message: 'cancela la membresia' } });
  check('El chat responde (no crashea) cuando el rol no tiene permiso', rStaffCancel.status === 200);
  check('La respuesta refleja PERMISSION_DENIED, no una ejecución silenciosa', rStaffCancel.body?.message?.includes('PERMISSION_DENIED'), rStaffCancel.body?.message);
  const membresiaDespues = db.prepare('SELECT estado FROM carwash_membresias WHERE id = ?').get(membresiaCarwash).estado;
  check('La membresía NO fue cancelada de verdad', membresiaDespues === membresiaAntes && membresiaAntes === 'activa');

  console.log('\n=== Seguridad: rubro incorrecto ===');
  const rRubroConv = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { message: 'hola de nuevo' } });
  const rRubro = await api('/ai/chat', {
    method: 'POST',
    token: tallerA.token,
    body: { conversationId: rRubroConv.body?.conversationId, message: 'intenta usar una tool de otro rubro' },
  });
  check('El chat responde (no crashea) cuando el modelo intenta una tool de otro rubro', rRubro.status === 200);
  check('La respuesta refleja el rechazo por rubro', rRubro.body?.message?.includes('TOOL_NOT_AVAILABLE_FOR_BUSINESS_TYPE'), rRubro.body?.message);

  console.log('\n=== Errores: tool inválida / argumentos inválidos ===');
  const rToolInvalida = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { conversationId, message: 'llama a una tool que no existe' } });
  check('Tool inexistente no crashea el chat, responde 200', rToolInvalida.status === 200);
  check('Refleja TOOL_NOT_FOUND', rToolInvalida.body?.message?.includes('TOOL_NOT_FOUND'), rToolInvalida.body?.message);

  const rArgsInvalidos = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { conversationId, message: 'cantidad invalida' } });
  check('Argumentos inválidos no crashea el chat, responde 200', rArgsInvalidos.status === 200);
  check('Refleja VALIDATION_ERROR', rArgsInvalidos.body?.message?.includes('VALIDATION_ERROR'), rArgsInvalidos.body?.message);
  const ventasTrasArgsInvalidos = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA.tenantId).n;
  check('No se creó ninguna venta con cantidad inválida', ventasTrasArgsInvalidos === ventasDespuesDeCancelar);

  console.log('\n=== Errores: mensaje vacío / demasiado largo ===');
  const rVacio = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { message: '' } });
  check('Mensaje vacío → 400', rVacio.status === 400);
  const rLargo = await api('/ai/chat', { method: 'POST', token: tallerA.token, body: { message: 'x'.repeat(3000) } });
  check('Mensaje demasiado largo → 400', rLargo.status === 400);

  console.log('\n=== Historial: continuar una conversación anterior ===');
  const rListado = await api('/ai/conversations', { token: tallerA.token });
  check('GET /ai/conversations lista las conversaciones del tenant', rListado.status === 200 && rListado.body.some((c) => c.id === conversationId));
  const rMensajes = await api(`/ai/conversations/${conversationId}/messages`, { token: tallerA.token });
  check('GET /ai/conversations/:id/messages devuelve el historial real', rMensajes.status === 200 && rMensajes.body.length >= 4);

  console.log('\n=== Limpieza de datos de prueba ===');
  const run = db.transaction(() => {
    for (const tid of [tallerA.tenantId, tallerB.tenantId, carwashA.tenantId]) {
      db.prepare('DELETE FROM ai_actions WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM ai_messages WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM ai_conversations WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(tid);
    }
    db.prepare('DELETE FROM taller_venta_items WHERE venta_id IN (SELECT id FROM taller_ventas WHERE tenant_id = ?)').run(tallerA.tenantId);
    db.prepare('DELETE FROM taller_ventas WHERE tenant_id = ?').run(tallerA.tenantId);
    db.prepare('DELETE FROM taller_clientes WHERE tenant_id = ?').run(tallerA.tenantId);
    db.prepare('DELETE FROM carwash_membresias WHERE tenant_id = ?').run(carwashA.tenantId);
    db.prepare('DELETE FROM carwash_clientes WHERE tenant_id = ?').run(carwashA.tenantId);
  });
  run();
  console.log('  listo');

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Error ejecutando la prueba:', err);
  process.exit(1);
});
