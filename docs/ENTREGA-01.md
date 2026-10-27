# Entrega 01: seguridad, inventario y órdenes de Taller

## Implementado

- Sesión JWT validada contra usuario actual; suspensión efectiva en HTTP y WhatsApp. Permisos de IA verificados de nuevo antes de ejecutar. El empleado no puede borrar registros del CRUD, cancelar membresías ni administrar inventario u órdenes.
- Arranque de producción sin creación de demos; rechazo de secretos JWT cortos, simuladores de IA/WhatsApp y CORS sin orígenes HTTPS explícitos. Las cuentas demo preexistentes NO se eliminan automáticamente.
- Migraciones versionadas 1 y 2, transaccionales, con respaldo SQLite consistente previo si ya existen negocios. Las ventas históricas mantienen `producto_id = NULL`.
- Venta con repuestos vinculados y descuento de stock atómico. Conceptos libres para servicios. Rechazo de producto ajeno, existencias insuficientes, importes inválidos y sobrepagos.
- Registro de movimientos de stock con usuario, motivo, venta y existencia resultante. API para consultar historial. Ajustes con motivo obligatorio.
- Clave de reintento en el POS: un mismo cobro repetido devuelve la venta original; una clave reutilizada con importes distintos se rechaza.
- Abonos transaccionales y cálculos monetarios en centavos durante las operaciones nuevas.
- Confirmación de IA y escritura de su resultado autoritativo en la misma transacción que el negocio.
- Órdenes: recepción, presupuesto versionado, aprobación anotada por administrador, reparación, listo y entrega. La entrega genera una venta y registra el movimiento de repuestos una sola vez.
- Interfaz de órdenes con búsqueda, filtros, historial y bloqueo de aprobación cuando hay cambios locales sin guardar. Indicador de vehículos en taller basado en órdenes abiertas.
- Clientes y vehículos con órdenes no pueden borrarse. Presupuesto aprobado no puede editarse.

## Pruebas

`cd server && npm test` ejecuta diez suites en copias temporales de código, sin copiar `.env`, usando bases nuevas y transportes simulados. Se reinicia la API por suite para evitar interferencia de límites de acceso. No ejecutar suites antiguas directamente contra la base de trabajo.

Resultados: functional-smoke 21, security-multitenant 15, ai-core 23, ai-chat 31, whatsapp 62, taller-hardening 11, whatsapp-empty-pending 30, release-foundation 32, migration-safety 8, release-http 17. Total: 250/250.

Recorrido visual en navegador: recepción de vehículo, presupuesto con repuesto y servicio, aprobación anotada, reparación y entrega a crédito. Verificación en BD de demostración: total L245, pago inicial L100, saldo L145 y stock de bujía de 40 a 39. No se contactó a un cliente real.

Frontend: `npm run build` y `npm run lint`. Hay dos advertencias previas de lint en auth-context.tsx; no son errores de compilación.

También se ensayó la migración sobre una copia consistente de la base local existente: conteos conservados en tenants/users/ventas/items/acciones; SQLite quick_check OK. La base original no se arrancó ni migró durante esta entrega.

## Alcance real y pendientes

Esta entrega NO es todavía un lanzamiento comercial completo. La aprobación se registra mediante una nota del administrador, no es firma electrónica del cliente. Los repuestos se descuentan al entregar, sin reservas previas de stock. Las órdenes todavía no tienen fotos, garantías ni modificaciones posteriores a la aprobación. Responsable es texto, no asignación formal a un usuario técnico.

Falta caja por turnos, devoluciones, compras completas, recibos/facturación según mercado, recuperación de contraseña, invitación/administración de empleados, vencimiento real de prueba y cobro de suscripciones. Los otros rubros conservan pendientes de integridad y funcionalidad de la investigación. No se han migrado tarifas ni planes comerciales.

El historial de movimientos tiene API; su pantalla dedicada de ajustes/historial queda pendiente. Las órdenes son accesibles por web; aún no se añadieron herramientas nuevas de IA para administrarlas.

No se repitió la prueba con un teléfono y proveedor de IA reales; no hay despliegue, GitHub push ni configuración de Meta.

## Arranque y migración

El próximo arranque del backend actualizado aplicará ambas migraciones. Si la base tiene negocios, guarda antes una instantánea en `backups/` junto a DATABASE_PATH, incluyendo los datos comprometidos del WAL. Un error de backup o migración impide continuar. Conservar los respaldos y no intentar revertir el esquema con ALTER inversos.

Para restaurar: detener el backend y todas las conexiones; conservar aparte los archivos actuales .db, -wal y -shm; colocar la instantánea en la ruta DATABASE_PATH sin dejar archivos WAL/SHM de la base reemplazada; usar una versión del código compatible con el esquema restaurado. Ensayar siempre este procedimiento sobre copias antes de usar datos reales.

Producción necesita NODE_ENV=production, JWT_SECRET generado de forma segura (mínimo 32 caracteres), CORS_ORIGIN con el origen HTTPS del frontend, DATABASE_PATH persistente y credenciales owner para la primera inicialización. HOST predeterminado es 127.0.0.1 para un proxy local; configurar otro HOST solo si lo requiere el despliegue. El ambiente real de WhatsApp debe usar sus credenciales propias y no simuladores.

## Próxima entrega

1. Caja: apertura, movimientos, cierre y conciliación, enlazada a ventas y abonos.
2. Devoluciones y correcciones auditadas; compras/entradas de inventario.
3. Fotos/documentos de recepción y comprobantes de entrega.
4. Alta del negocio, usuarios, prueba y renovaciones.
5. Piloto real con un taller, después del cierre técnico de esos puntos.
