/**
 * Pruebas del AI Core (server/src/ai) — no requieren el servidor HTTP
 * corriendo ni ningún proveedor de IA conectado: ejercitan directamente
 * AiContext, toolRegistry y el orchestrator contra la base de datos real.
 *
 * Cubre lo pedido en la auditoría del AI Core:
 *   - Seguridad: Tenant A no puede leer/modificar/confirmar acciones de Tenant B.
 *   - Permisos: tenant_staff no puede usar tools "destructive"; tenant_admin sí.
 *   - Rubro: una tool de un rubro no se puede invocar desde otro.
 *   - Confirmaciones: una tool sensible no se ejecuta sin confirmar, y solo
 *     se puede confirmar exactamente lo que se propuso (no otros argumentos).
 *   - Validación: cantidad negativa, id inexistente, id de otro tenant → rechazados.
 *   - Historial: una conversación de un tenant no es visible para otro.
 *
 * Uso: node tests/ai-core.js
 */

const db = require('../src/db');
require('../src/ai/tools');
const { buildContext } = require('../src/ai/core/context');
const history = require('../src/ai/core/history');
const { proposeToolCall, confirmToolCall, rejectToolCall } = require('../src/ai/core/orchestrator');

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

function crearTenantDePrueba(businessType, tag) {
  const slug = `qa-ai-${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const info = db
    .prepare(`INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES (?, ?, ?, 'pro', 'activo')`)
    .run(businessType, `QA AI Core ${tag}`, slug);
  return info.lastInsertRowid;
}

function main() {
  console.log('=== Preparando tenants de prueba ===');
  const tallerA = crearTenantDePrueba('taller', 'taller-a');
  const tallerB = crearTenantDePrueba('taller', 'taller-b');
  const carwashA = crearTenantDePrueba('carwash', 'carwash-a');
  const agroA = crearTenantDePrueba('agro', 'agro-a');

  try {
    runChecks({ tallerA, tallerB, carwashA, agroA });
  } finally {
    limpiar({ tallerA, tallerB, carwashA, agroA });
  }

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

function limpiar({ tallerA, tallerB, carwashA, agroA }) {
  console.log('\n=== Limpieza de datos de prueba ===');
  const run = db.transaction(() => {
    for (const tid of [tallerA, tallerB, carwashA, agroA]) {
      db.prepare('DELETE FROM ai_actions WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM ai_messages WHERE tenant_id = ?').run(tid);
      db.prepare('DELETE FROM ai_conversations WHERE tenant_id = ?').run(tid);
    }
    db.prepare('DELETE FROM taller_venta_items WHERE venta_id IN (SELECT id FROM taller_ventas WHERE tenant_id IN (?, ?))').run(tallerA, tallerB);
    db.prepare('DELETE FROM taller_abonos WHERE tenant_id IN (?, ?)').run(tallerA, tallerB);
    db.prepare('DELETE FROM taller_ventas WHERE tenant_id IN (?, ?)').run(tallerA, tallerB);
    db.prepare('DELETE FROM taller_clientes WHERE tenant_id IN (?, ?)').run(tallerA, tallerB);
    db.prepare('DELETE FROM carwash_membresias WHERE tenant_id = ?').run(carwashA);
    db.prepare('DELETE FROM carwash_clientes WHERE tenant_id = ?').run(carwashA);
    db.prepare('DELETE FROM tenants WHERE id IN (?, ?, ?, ?)').run(tallerA, tallerB, carwashA, agroA);
  });
  run();
  console.log('  listo');
}

function runChecks({ tallerA, tallerB, carwashA, agroA }) {
  const clienteA = db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tallerA, 'Cliente A').lastInsertRowid;
  const clienteB = db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tallerB, 'Cliente B').lastInsertRowid;
  const clienteCarA = db.prepare('INSERT INTO carwash_clientes (tenant_id, nombre) VALUES (?, ?)').run(carwashA, 'Cliente Carwash A').lastInsertRowid;
  const membresiaA = db
    .prepare(
      `INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado)
       VALUES (?, ?, 'Ilimitado', 690, date('now'), date('now','+1 month'), 'activa')`
    )
    .run(carwashA, clienteCarA).lastInsertRowid;

  const ctxAdminA = buildContext({ userId: 1, tenantId: tallerA, businessType: 'taller', role: 'tenant_admin', channel: 'web' });
  const ctxStaffA = buildContext({ userId: 2, tenantId: tallerA, businessType: 'taller', role: 'tenant_staff', channel: 'web' });
  const ctxAdminB = buildContext({ userId: 3, tenantId: tallerB, businessType: 'taller', role: 'tenant_admin', channel: 'web' });
  const ctxCarwashAdminA = buildContext({ userId: 4, tenantId: carwashA, businessType: 'carwash', role: 'tenant_admin', channel: 'web' });
  const ctxCarwashStaffA = buildContext({ userId: 5, tenantId: carwashA, businessType: 'carwash', role: 'tenant_staff', channel: 'web' });
  const ctxAgroAdminA = buildContext({ userId: 6, tenantId: agroA, businessType: 'agro', role: 'tenant_admin', channel: 'web' });

  const convA = history.createConversation({ tenantId: tallerA, userId: 1, channel: 'web' });
  const convB = history.createConversation({ tenantId: tallerB, userId: 3, channel: 'web' });
  const convCarA = history.createConversation({ tenantId: carwashA, userId: 4, channel: 'web' });

  console.log('\n=== Seguridad: aislamiento de tenant en tools ===');

  const ventaB = proposeToolCall({
    conversationId: convB.id,
    context: ctxAdminB,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteB, items: [{ descripcion: 'Servicio B', cantidad: 1, precio_unitario: 100 }] },
  });
  const confirmB = confirmToolCall({ actionId: ventaB.actionId, context: ctxAdminB });
  check('Tenant B puede registrar su propia venta (control positivo)', confirmB.success, JSON.stringify(confirmB));

  const fkAjena = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteB, items: [{ descripcion: 'Intento cross-tenant', cantidad: 1, precio_unitario: 100 }] },
  });
  check(
    'Tenant A no puede registrar una venta usando el cliente_id de Tenant B',
    fkAjena.success === false && fkAjena.code === 'VALIDATION_ERROR',
    JSON.stringify(fkAjena)
  );

  const confirmAjeno = confirmToolCall({ actionId: confirmB.actionId || ventaB.actionId, context: ctxAdminA });
  check(
    'Tenant A no puede confirmar/leer una acción de Tenant B (ACTION_NOT_FOUND, no fuga de datos)',
    confirmAjeno.success === false && confirmAjeno.code === 'ACTION_NOT_FOUND',
    JSON.stringify(confirmAjeno)
  );

  const abonoAjeno = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarAbono',
    args: { ventaId: confirmB.data?.id, monto: 10 },
  });
  const confirmAbonoAjeno = abonoAjeno.actionId ? confirmToolCall({ actionId: abonoAjeno.actionId, context: ctxAdminA }) : abonoAjeno;
  check(
    'Tenant A no puede abonar a una venta de Tenant B',
    confirmAbonoAjeno.success === false,
    JSON.stringify(confirmAbonoAjeno)
  );

  console.log('\n=== Permisos: tenant_staff vs tenant_admin ===');

  const staffDestructiva = proposeToolCall({
    conversationId: convCarA.id,
    context: ctxCarwashStaffA,
    toolName: 'carwash.cancelarMembresia',
    args: { membresiaId: membresiaA },
  });
  check('tenant_staff → tool destructive (cancelarMembresia) → PERMISSION_DENIED', staffDestructiva.code === 'PERMISSION_DENIED', JSON.stringify(staffDestructiva));

  const adminDestructiva = proposeToolCall({
    conversationId: convCarA.id,
    context: ctxCarwashAdminA,
    toolName: 'carwash.cancelarMembresia',
    args: { membresiaId: membresiaA },
  });
  check('tenant_admin → tool destructive → autorizado (needsConfirmation, no PERMISSION_DENIED)', adminDestructiva.success === true && adminDestructiva.needsConfirmation === true, JSON.stringify(adminDestructiva));
  if (adminDestructiva.actionId) rejectToolCall({ actionId: adminDestructiva.actionId, context: ctxCarwashAdminA }); // no dejar la membresía pendiente de cancelar

  const staffLectura = proposeToolCall({ conversationId: convCarA.id, context: ctxCarwashStaffA, toolName: 'carwash.consultarTurnos', args: {} });
  check('tenant_staff → tool de lectura → autorizado', staffLectura.success === true, JSON.stringify(staffLectura));

  console.log('\n=== Rubro: una tool no se puede invocar fuera de su businessType ===');

  const rubroCruzado = proposeToolCall({ conversationId: convA.id, context: ctxAdminA, toolName: 'carwash.crearTurno', args: {} });
  check('Contexto taller no puede usar una tool de carwash', rubroCruzado.code === 'TOOL_NOT_AVAILABLE_FOR_BUSINESS_TYPE', JSON.stringify(rubroCruzado));

  const rubroCorrecto = proposeToolCall({ conversationId: convCarA.id, context: ctxCarwashAdminA, toolName: 'carwash.consultarTurnos', args: {} });
  check('Contexto carwash sí puede usar una tool de carwash', rubroCorrecto.success === true, JSON.stringify(rubroCorrecto));

  console.log('\n=== Confirmaciones: no ejecuta sin confirmar, y solo confirma lo propuesto ===');

  const ventasAntes = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA).n;
  const propuesta = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteA, items: [{ descripcion: 'Cambio de aceite', cantidad: 1, precio_unitario: 275 }] },
  });
  const ventasDespuesDeProponer = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA).n;
  check('Proponer una venta (requiresConfirmation) NO la ejecuta todavía', ventasDespuesDeProponer === ventasAntes, `antes=${ventasAntes} despues=${ventasDespuesDeProponer}`);
  check('Propose devuelve needsConfirmation:true', propuesta.needsConfirmation === true);

  const confirmada = confirmToolCall({ actionId: propuesta.actionId, context: ctxAdminA });
  const ventasDespuesDeConfirmar = db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA).n;
  check('Confirmar la acción SÍ la ejecuta', confirmada.success === true && ventasDespuesDeConfirmar === ventasAntes + 1);
  check('El resultado confirmado corresponde a lo propuesto (mismo total)', confirmada.data?.total === 275, JSON.stringify(confirmada.data));

  const reconfirmar = confirmToolCall({ actionId: propuesta.actionId, context: ctxAdminA });
  check('No se puede confirmar dos veces la misma acción', reconfirmar.success === false && reconfirmar.code === 'ACTION_NOT_PENDING', JSON.stringify(reconfirmar));

  console.log('\n=== Idempotencia ===');
  const idKey = 'venta-idempotente-1';
  const propuestaIdemA = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteA, items: [{ descripcion: 'Frenos', cantidad: 1, precio_unitario: 500 }] },
    idempotencyKey: idKey,
  });
  const confirmIdemA = confirmToolCall({ actionId: propuestaIdemA.actionId, context: ctxAdminA });
  const propuestaIdemA2 = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteA, items: [{ descripcion: 'Frenos', cantidad: 1, precio_unitario: 500 }] },
    idempotencyKey: idKey,
  });
  const ventasConMismaKey = db.prepare("SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ? AND total = 500").get(tallerA).n;
  check('Repetir la misma tool+idempotencyKey no duplica la venta', propuestaIdemA2.deduplicated === true && ventasConMismaKey === 1, `ventas con total 500: ${ventasConMismaKey}`);

  console.log('\n=== Validación de argumentos ===');

  const cantidadNegativa = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { items: [{ descripcion: 'x', cantidad: -100, precio_unitario: 10 }] },
  });
  check('cantidad negativa → VALIDATION_ERROR (no crea acción pendiente)', cantidadNegativa.code === 'VALIDATION_ERROR' && !cantidadNegativa.actionId, JSON.stringify(cantidadNegativa));

  const idInexistente = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarAbono',
    args: { ventaId: 999999, monto: 10 },
  });
  check(
    'id de venta inexistente → rechazado ya en el propose (refs), sin crear acción pendiente',
    idInexistente.success === false && !idInexistente.needsConfirmation,
    JSON.stringify(idInexistente)
  );

  const idOtroTenant = proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteB, items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }] },
  });
  check('cliente_id de otro tenant → rechazado', idOtroTenant.success === false, JSON.stringify(idOtroTenant));

  console.log('\n=== Historial: aislamiento de conversaciones ===');
  const leerConversacionAjena = history.getConversation(convA.id, tallerB);
  check('Tenant B no puede leer la conversación de Tenant A', leerConversacionAjena === undefined);
  const mensajesAjenos = history.listMessages(convA.id, tallerB);
  check('Tenant B no puede leer mensajes de la conversación de Tenant A', mensajesAjenos.length === 0);
  const listadoB = history.listConversations(tallerB);
  check('listConversations(tenantB) no incluye conversaciones de Tenant A', !listadoB.some((c) => c.id === convA.id));

  console.log('\n=== Privacidad: sanitizeForAudit ===');
  const sanitizado = history.sanitizeForAudit({ nombre: 'Carlos', password: 'secreto123', anidado: { token: 'abc', ok: 'visible' } });
  check(
    'sanitizeForAudit oculta password/token anidados y conserva el resto',
    sanitizado.password === '[oculto]' && sanitizado.anidado.token === '[oculto]' && sanitizado.anidado.ok === 'visible' && sanitizado.nombre === 'Carlos',
    JSON.stringify(sanitizado)
  );

  console.log('\n=== Errores estructurados (no SQL crudo) ===');
  check(
    'El error de negocio nunca expone texto de SQLite',
    !JSON.stringify(idInexistente).match(/SQLITE|constraint failed/i)
  );
}

main();
