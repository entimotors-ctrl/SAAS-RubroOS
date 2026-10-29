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

async function crearTenantDePrueba(businessType, tag) {
  const slug = `qa-ai-${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const info = await db
    .prepare(`INSERT INTO tenants (business_type, nombre_empresa, slug, plan, status) VALUES (?, ?, ?, 'pro', 'activo')`)
    .run(businessType, `QA AI Core ${tag}`, slug);
  return info.lastInsertRowid;
}

async function main() {
  console.log('=== Preparando tenants de prueba ===');
  const tallerA = await crearTenantDePrueba('taller', 'taller-a');
  const tallerB = await crearTenantDePrueba('taller', 'taller-b');
  const carwashA = await crearTenantDePrueba('carwash', 'carwash-a');
  const agroA = await crearTenantDePrueba('agro', 'agro-a');

  try {
    await runChecks({ tallerA, tallerB, carwashA, agroA });
  } finally {
    await limpiar({ tallerA, tallerB, carwashA, agroA });
  }

  console.log(`\n=== Resultado: ${pass}/${pass + fail} checks OK ===`);
  if (fail > 0) process.exit(1);
}

async function limpiar({ tallerA, tallerB, carwashA, agroA }) {
  console.log('\n=== Limpieza de datos de prueba ===');
  const run = db.transaction(async () => {
    for (const tid of [tallerA, tallerB, carwashA, agroA]) {
      await db.prepare('DELETE FROM ai_actions WHERE tenant_id = ?').run(tid);
      await db.prepare('DELETE FROM ai_messages WHERE tenant_id = ?').run(tid);
      await db.prepare('DELETE FROM ai_conversations WHERE tenant_id = ?').run(tid);
    }
    await db.prepare('DELETE FROM taller_venta_items WHERE venta_id IN (SELECT id FROM taller_ventas WHERE tenant_id IN (?, ?))').run(tallerA, tallerB);
    await db.prepare('DELETE FROM taller_abonos WHERE tenant_id IN (?, ?)').run(tallerA, tallerB);
    await db.prepare('DELETE FROM taller_ventas WHERE tenant_id IN (?, ?)').run(tallerA, tallerB);
    await db.prepare('DELETE FROM taller_clientes WHERE tenant_id IN (?, ?)').run(tallerA, tallerB);
    await db.prepare('DELETE FROM carwash_membresias WHERE tenant_id = ?').run(carwashA);
    await db.prepare('DELETE FROM carwash_clientes WHERE tenant_id = ?').run(carwashA);
    await db.prepare('DELETE FROM users WHERE tenant_id IN (?, ?, ?, ?)').run(tallerA, tallerB, carwashA, agroA);
    await db.prepare('DELETE FROM tenants WHERE id IN (?, ?, ?, ?)').run(tallerA, tallerB, carwashA, agroA);
  });
  await run();
  console.log('  listo');
}

async function runChecks({ tallerA, tallerB, carwashA, agroA }) {
  const clienteA = (await db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tallerA, 'Cliente A')).lastInsertRowid;
  const clienteB = (await db.prepare('INSERT INTO taller_clientes (tenant_id, nombre) VALUES (?, ?)').run(tallerB, 'Cliente B')).lastInsertRowid;
  const clienteCarA = (await db.prepare('INSERT INTO carwash_clientes (tenant_id, nombre) VALUES (?, ?)').run(carwashA, 'Cliente Carwash A')).lastInsertRowid;
  const hoy = new Date().toISOString().slice(0, 10);
  const enUnMes = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); })();
  const membresiaA = (await db
    .prepare(
      `INSERT INTO carwash_membresias (tenant_id, cliente_id, plan, precio_mensual, fecha_inicio, fecha_renovacion, estado)
       VALUES (?, ?, 'Ilimitado', 690, ?, ?, 'activa')`
    )
    .run(carwashA, clienteCarA, hoy, enUnMes)).lastInsertRowid;

  const fixtureUser = async (tenantId, businessType, role) => (await db.prepare('INSERT INTO users (tenant_id,business_type,email,password_hash,nombre,role) VALUES (?,?,?,?,?,?)').run(tenantId,businessType,`core-${tenantId}-${role}@test.local`,'x','QA',role)).lastInsertRowid;
  const userIds = [null,
    await fixtureUser(tallerA, 'taller', 'tenant_admin'), await fixtureUser(tallerA, 'taller', 'tenant_staff'),
    await fixtureUser(tallerB, 'taller', 'tenant_admin'), await fixtureUser(carwashA, 'carwash', 'tenant_admin'),
    await fixtureUser(carwashA, 'carwash', 'tenant_staff'), await fixtureUser(agroA, 'agro', 'tenant_admin')];
  const ctxAdminA = buildContext({ userId: userIds[1], tenantId: tallerA, businessType: 'taller', role: 'tenant_admin', channel: 'web' });
  const ctxStaffA = buildContext({ userId: userIds[2], tenantId: tallerA, businessType: 'taller', role: 'tenant_staff', channel: 'web' });
  const ctxAdminB = buildContext({ userId: userIds[3], tenantId: tallerB, businessType: 'taller', role: 'tenant_admin', channel: 'web' });
  const ctxCarwashAdminA = buildContext({ userId: userIds[4], tenantId: carwashA, businessType: 'carwash', role: 'tenant_admin', channel: 'web' });
  const ctxCarwashStaffA = buildContext({ userId: userIds[5], tenantId: carwashA, businessType: 'carwash', role: 'tenant_staff', channel: 'web' });
  const ctxAgroAdminA = buildContext({ userId: userIds[6], tenantId: agroA, businessType: 'agro', role: 'tenant_admin', channel: 'web' });

  const convA = await history.createConversation({ tenantId: tallerA, userId: userIds[1], channel: 'web' });
  const convB = await history.createConversation({ tenantId: tallerB, userId: userIds[3], channel: 'web' });
  const convCarA = await history.createConversation({ tenantId: carwashA, userId: userIds[4], channel: 'web' });

  console.log('\n=== Seguridad: aislamiento de tenant en tools ===');

  const ventaB = await proposeToolCall({
    conversationId: convB.id,
    context: ctxAdminB,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteB, items: [{ descripcion: 'Servicio B', cantidad: 1, precio_unitario: 100 }] },
  });
  const confirmB = await confirmToolCall({ actionId: ventaB.actionId, context: ctxAdminB });
  check('Tenant B puede registrar su propia venta (control positivo)', confirmB.success, JSON.stringify(confirmB));

  const fkAjena = await proposeToolCall({
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

  const confirmAjeno = await confirmToolCall({ actionId: confirmB.actionId || ventaB.actionId, context: ctxAdminA });
  check(
    'Tenant A no puede confirmar/leer una acción de Tenant B (ACTION_NOT_FOUND, no fuga de datos)',
    confirmAjeno.success === false && confirmAjeno.code === 'ACTION_NOT_FOUND',
    JSON.stringify(confirmAjeno)
  );

  const abonoAjeno = await proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarAbono',
    args: { ventaId: confirmB.data?.id, monto: 10 },
  });
  const confirmAbonoAjeno = abonoAjeno.actionId ? await confirmToolCall({ actionId: abonoAjeno.actionId, context: ctxAdminA }) : abonoAjeno;
  check(
    'Tenant A no puede abonar a una venta de Tenant B',
    confirmAbonoAjeno.success === false,
    JSON.stringify(confirmAbonoAjeno)
  );

  console.log('\n=== Permisos: tenant_staff vs tenant_admin ===');

  const staffDestructiva = await proposeToolCall({
    conversationId: convCarA.id,
    context: ctxCarwashStaffA,
    toolName: 'carwash.cancelarMembresia',
    args: { membresiaId: membresiaA },
  });
  check('tenant_staff → tool destructive (cancelarMembresia) → PERMISSION_DENIED', staffDestructiva.code === 'PERMISSION_DENIED', JSON.stringify(staffDestructiva));

  const adminDestructiva = await proposeToolCall({
    conversationId: convCarA.id,
    context: ctxCarwashAdminA,
    toolName: 'carwash.cancelarMembresia',
    args: { membresiaId: membresiaA },
  });
  check('tenant_admin → tool destructive → autorizado (needsConfirmation, no PERMISSION_DENIED)', adminDestructiva.success === true && adminDestructiva.needsConfirmation === true, JSON.stringify(adminDestructiva));
  if (adminDestructiva.actionId) await rejectToolCall({ actionId: adminDestructiva.actionId, context: ctxCarwashAdminA }); // no dejar la membresía pendiente de cancelar

  const staffLectura = await proposeToolCall({ conversationId: convCarA.id, context: ctxCarwashStaffA, toolName: 'carwash.consultarTurnos', args: {} });
  check('tenant_staff → tool de lectura general → denegado', staffLectura.code === 'PERMISSION_DENIED', JSON.stringify(staffLectura));

  console.log('\n=== Rubro: una tool no se puede invocar fuera de su businessType ===');

  const rubroCruzado = await proposeToolCall({ conversationId: convA.id, context: ctxAdminA, toolName: 'carwash.crearTurno', args: {} });
  check('Contexto taller no puede usar una tool de carwash', rubroCruzado.code === 'TOOL_NOT_AVAILABLE_FOR_BUSINESS_TYPE', JSON.stringify(rubroCruzado));

  const rubroCorrecto = await proposeToolCall({ conversationId: convCarA.id, context: ctxCarwashAdminA, toolName: 'carwash.consultarTurnos', args: {} });
  check('Contexto carwash sí puede usar una tool de carwash', rubroCorrecto.success === true, JSON.stringify(rubroCorrecto));

  console.log('\n=== Confirmaciones: no ejecuta sin confirmar, y solo confirma lo propuesto ===');

  const ventasAntes = (await db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA)).n;
  const propuesta = await proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteA, items: [{ descripcion: 'Cambio de aceite', cantidad: 1, precio_unitario: 275 }] },
  });
  const ventasDespuesDeProponer = (await db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA)).n;
  check('Proponer una venta (requiresConfirmation) NO la ejecuta todavía', ventasDespuesDeProponer === ventasAntes, `antes=${ventasAntes} despues=${ventasDespuesDeProponer}`);
  check('Propose devuelve needsConfirmation:true', propuesta.needsConfirmation === true);

  const confirmada = await confirmToolCall({ actionId: propuesta.actionId, context: ctxAdminA });
  const ventasDespuesDeConfirmar = (await db.prepare('SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ?').get(tallerA)).n;
  check('Confirmar la acción SÍ la ejecuta', confirmada.success === true && ventasDespuesDeConfirmar === ventasAntes + 1);
  check('El resultado confirmado corresponde a lo propuesto (mismo total)', confirmada.data?.total === 275, JSON.stringify(confirmada.data));

  const reconfirmar = await confirmToolCall({ actionId: propuesta.actionId, context: ctxAdminA });
  check('No se puede confirmar dos veces la misma acción', reconfirmar.success === false && reconfirmar.code === 'ACTION_NOT_PENDING', JSON.stringify(reconfirmar));

  console.log('\n=== Idempotencia ===');
  const idKey = 'venta-idempotente-1';
  const propuestaIdemA = await proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteA, items: [{ descripcion: 'Frenos', cantidad: 1, precio_unitario: 500 }] },
    idempotencyKey: idKey,
  });
  const confirmIdemA = await confirmToolCall({ actionId: propuestaIdemA.actionId, context: ctxAdminA });
  const propuestaIdemA2 = await proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteA, items: [{ descripcion: 'Frenos', cantidad: 1, precio_unitario: 500 }] },
    idempotencyKey: idKey,
  });
  const ventasConMismaKey = (await db.prepare("SELECT COUNT(*) n FROM taller_ventas WHERE tenant_id = ? AND total = 500").get(tallerA)).n;
  check('Repetir la misma tool+idempotencyKey no duplica la venta', propuestaIdemA2.deduplicated === true && ventasConMismaKey === 1, `ventas con total 500: ${ventasConMismaKey}`);

  console.log('\n=== Validación de argumentos ===');

  const cantidadNegativa = await proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { items: [{ descripcion: 'x', cantidad: -100, precio_unitario: 10 }] },
  });
  check('cantidad negativa → VALIDATION_ERROR (no crea acción pendiente)', cantidadNegativa.code === 'VALIDATION_ERROR' && !cantidadNegativa.actionId, JSON.stringify(cantidadNegativa));

  const idInexistente = await proposeToolCall({
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

  const idOtroTenant = await proposeToolCall({
    conversationId: convA.id,
    context: ctxAdminA,
    toolName: 'taller.registrarVenta',
    args: { cliente_id: clienteB, items: [{ descripcion: 'x', cantidad: 1, precio_unitario: 10 }] },
  });
  check('cliente_id de otro tenant → rechazado', idOtroTenant.success === false, JSON.stringify(idOtroTenant));

  console.log('\n=== Historial: aislamiento de conversaciones ===');
  const leerConversacionAjena = await history.getConversation(convA.id, tallerB);
  check('Tenant B no puede leer la conversación de Tenant A', leerConversacionAjena === undefined);
  const mensajesAjenos = await history.listMessages(convA.id, tallerB);
  check('Tenant B no puede leer mensajes de la conversación de Tenant A', mensajesAjenos.length === 0);
  const listadoB = await history.listConversations(tallerB);
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

main().catch(e=>{console.error(e);process.exitCode=1;});
