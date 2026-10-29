# Fase 2 (adaptador PostgreSQL): estado y punto de reanudación

Actualizado el 27 de octubre de 2026.

## Qué está hecho y verificado

1. **`server/src/db/postgres.js`** (nuevo): adaptador que expone la MISMA forma que usa hoy `server/src/db.js` con `better-sqlite3` — `db.prepare(sql).get/all/run(...)`, `db.transaction(fn)` (invocable directo o con `.immediate()/.deferred()/.exclusive()`), `.close()` — pero async por dentro (usa `pg`). Traduce automáticamente, a nivel de texto SQL, los dos únicos patrones de SQLite usados en código de negocio fuera del esquema:
   - `datetime('now')` → `now()` (genérico, cualquier archivo).
   - placeholders posicionales `?` → `$1, $2, ...`.
   
   Inyecta `RETURNING id` en los `INSERT` para emular `lastInsertRowid`, excepto en las tablas sin columna `id` (lista explícita en el archivo: `operation_requests`, `tenant_settings`, `whatsapp_inbound_events`, `password_resets`, `staff_invitations`, `staff_profiles`). Al arrancar, si no existe la tabla `tenants`, aplica automáticamente todos los archivos de `supabase/migrations/` (bootstrap de esquema para una base nueva, incluida una Postgres efímera de pruebas).

   Usa `AsyncLocalStorage` para que `db.transaction(fn)` abra un `BEGIN/COMMIT/ROLLBACK` real y que cualquier `db.prepare(...)` ejecutado dentro del callback (sin importar cuán anidada esté la llamada) use la MISMA conexión — y es reentrante: una transacción llamada dentro de otra reutiliza la de afuera en vez de abrir una conexión nueva.

   `pg` devuelve BIGINT/NUMERIC como string por defecto; se configuró `pg.types.setTypeParser` para que vuelvan a ser `number` (igual que siempre daba `better-sqlite3`) — sin este ajuste, comparaciones como `Number.isInteger(id)` se habrían roto en silencio.

2. **`server/src/db.js`**: al inicio, si `DATABASE_URL` está definida, exporta el adaptador de arriba en vez de abrir SQLite. **Sin `DATABASE_URL`, el comportamiento es idéntico al de siempre** — se corrió toda la suite de pruebas existente (526 checks, 13 suites) dos veces tras estos cambios y sigue en 0 fallos.

3. **`server/src/index.js`**: se agregó `require('express-async-errors')` (no-op para handlers síncronos, necesario para cuando empiecen a ser `async`), `/api/ready` ahora hace `await` del `SELECT 1`, y el manejador global de errores reconoce también el código `23505` de Postgres (violación UNIQUE) junto al `SQLITE_CONSTRAINT_UNIQUE` que ya existía.

4. **Dependencias**: `pg` y `express-async-errors` agregadas a `server/package.json` e instaladas.

5. **Validación realizada:**
   - Script standalone contra un PostgreSQL 17 real (imagen oficial de Supabase, contenedor desechable): bootstrap de las 50 tablas, `get/all/run`, `lastInsertRowid` vía RETURNING, `changes`, las dos formas de invocar `db.transaction`, rollback real ante un `throw`, reentrancia anidada, la tabla sin `id`, y el código `23505` en una violación UNIQUE. 12/12 OK.
   - Suite completa de pruebas existente (`node tests/run-isolated.js`, 526 checks) contra SQLite: 0 regresiones por los cambios de `db.js` e `index.js`.

## ✅ Conversión mecánica COMPLETA (actualizado el 29 de octubre de 2026)

**Todos** los archivos de rutas/servicios que tocan `db` están convertidos a `async`/`await` y verificados contra la suite completa (526 checks, 13 suites, cero regresión en cada paso): los 5 rubros completos (Taller, Barbería, Agro, Ganadería, Carwash), auth/passwords/staff, todo el AI Core (`toolRegistry`, `orchestrator`, `chatService`, `history`), todo el subsistema WhatsApp (`identityService`, `identityResolver`, `confirmationIntent`, las rutas del webhook y de vinculación), `utils/crud.js`, `settings.js`, `reports.js`, `routes/operations.js`, y `seed.js` (incluida la reescritura de `date('now','+N day')` a JavaScript — ver abajo). El arranque del servidor en `index.js` también se ajustó: `ensureSeed()` ahora es async, así que `app.listen(...)` espera a que termine antes de aceptar conexiones (antes era síncrono y bloqueante; ahora es un `.then()` sobre la promesa, con el mismo `process.exit(1)` si falla).

**Lo único sin convertir, a propósito:**
- `services/businessClock.js` — es quien REGISTRA `business_day()`/`business_today()` vía `db.function()`. No se toca hasta resolver la decisión de diseño de abajo.
- `maintenance/restore.js` / `maintenance/backups.js` — herramienta de respaldo específica de SQLite, sin equivalente en Postgres (Supabase maneja sus propios respaldos). No aplica.

**Aun así, NO definir `DATABASE_URL` en ningún entorno real todavía** — ver el punto sin resolver de `business_day()`/`business_today()` más abajo: los 7 archivos que los usan funcionan bien contra SQLite (sintaxis nativa), pero esa sintaxis no existe en Postgres.

### Prueba de extremo a extremo contra Postgres real (29 de octubre de 2026)

Se levantó un PostgreSQL 17 real (imagen oficial de Supabase, contenedor desechable) y se arrancó el servidor completo (`node src/index.js`) con `DATABASE_URL` apuntando a él — nada simulado, el proceso real de producción:

- Bootstrap automático de esquema (50 tablas, Fase 1) al no existir `tenants`.
- `ensureSeed()` creó la cuenta owner y los 5 tenants demo con sus datos de ejemplo (confirmó que la reescritura de fechas de `seed.js` funciona de verdad, no solo en teoría).
- Por HTTP real: login (`/api/auth/login`, JWT con `session_version`), listado de clientes aislado por tenant, creación de una venta con transacción (`/api/taller/ventas`, montos correctos, `NUMERIC` devuelto como `number`), el chat de IA completo (`/api/ai/chat` con proveedor falso: contexto → historial → conversación → respuesta), y el trigger de horario inicial de barbero (`barberia_barbero_horario_inicial`, Fase 1) disparándose correctamente al sembrar un barbero demo.
- `/api/taller/finanzas/resumen` (usa `business_day()`/`business_today()`) falló exactamente como se esperaba — `error: function business_day(text, bigint) does not exist` — un error de SQL visible en el log del servidor, no un dato incorrecto servido en silencio. Confirma que el único hueco real es el ya documentado, y que falla de forma segura (500 + log), no silenciosa.
- Esta prueba encontró y corrigió un bug real en el adaptador: `ensureSchema()` (el bootstrap que aplica `supabase/migrations/`) se lanzaba al cargar el módulo pero nada esperaba esa promesa antes de la primera consulta real — `seed.js` intentaba leer `tenants` antes de que las migraciones terminaran de aplicarse (`relation "tenants" does not exist`). Corregido: `prepare()...exec()` y `runTransaction()` ahora hacen `await ready` antes de ejecutar cualquier consulta — costo cero una vez resuelta la primera vez.

Conclusión: con el único hueco de `business_day`/`business_today` resuelto, el corte a Postgres debería funcionar de punta a punta sin sorpresas adicionales.

### Patrón mecánico de conversión (repetir por archivo)

1. Cada función que contenga una llamada `db.prepare(...).get/all/run(...)` o `db.transaction(...)` pasa a ser `async`.
2. Cada una de esas llamadas lleva `await` delante.
3. Toda función que LLAME a una función que acabas de volver `async` también debe volverse `async` y hacerle `await` — propagar hacia arriba hasta el handler de ruta de Express. Esto incluye los handlers de `ai/tools/*.js` (ya les basta con `return` lo que devuelva el service — `toolRegistry.runTool` ya hace `await auth.tool.handler(...)`, no hace falta tocarlos uno por uno).
4. `await` sobre un valor que no es Promise no hace nada (se resuelve en el siguiente microtask con ese mismo valor) — por eso este patrón no cambia el comportamiento bajo SQLite; es seguro convertir y correr la suite existente después de cada archivo para confirmarlo.
5. **Los archivos de test que llaman a una función convertida DIRECTAMENTE (no por HTTP) también necesitan su propio `await`** — varios tests (`release-foundation.js`, `ai-core.js`, `staff-portal.js`, `whatsapp.js`, `ai-chat.js`, `release-http.js`, `multi-business-beta.js`, `stable-operations.js`, `taller-hardening.js`) importan `signToken`/servicios y los llaman de forma síncrona a nivel de módulo o dentro de `test()`/`check()` helpers. Si un test usaba `assert.throws(fn)` sobre una función que ACABAS de volver async, cambiarlo a `await assert.rejects(fn)` (lanzar síncrono y rechazar son cosas distintas para `assert`). Si no se sabe aún si la función es sync o async en ese punto de la conversión, usar el helper `throwsOrRejects` ya definido en `release-foundation.js`.

### Dos bugs de diseño del adaptador encontrados DURANTE la conversión (ya corregidos, no hay que volver a buscarlos)

1. **better-sqlite3 rechaza un callback async en su propio `db.transaction()`** ("Transaction function cannot return a promise"). `server/src/db.js` ahora detecta `fn.constructor.name==='AsyncFunction'`: si es async usa un wrapper propio (`BEGIN`/`COMMIT`/`ROLLBACK` crudos, reentrante vía contador `depth`); si es síncrono sigue yendo al `db.transaction()` nativo tal cual. Esto es lo que permite seguir convirtiendo archivo por archivo sin tener que tocar los ~20 sitios con `db.transaction()` de una sola vez.
2. **`db.transaction(fn)` se usa de dos formas**: encadenado con `.immediate()` (la mayoría) y también invocado directo como `db.transaction(fn)()` (`seed.js`, `services/passwords.js`). El wrapper soporta ambas.

### Una excepción de sintaxis SQL ya resuelta, y una categoría de huecos SIN resolver (sí hay que volver a esto)

- **Resuelto** — `server/src/services/barberiaAvailability.js`, función `assertAvailable`: `strftime('%w', ?)` (día de la semana en SQLite) se traduce a mano según el driver activo (`process.env.DATABASE_URL`) a `EXTRACT(DOW FROM ?::date)::integer` — misma convención 0=domingo..6=sábado en los dos motores. Patrón a repetir si aparece otro `strftime`.
- **SIN resolver — `business_day()` / `business_today()`**: son funciones SQL registradas en SQLite vía `db.function()` (ver `services/businessClock.js`), que no existen en PostgreSQL. Se usan, casi siempre combinadas con el modificador de fecha de SQLite `date(x, '+N day'|'-N day'|'+N month')` (que tampoco existe en Postgres), en: `routes/barberia.js`, `routes/taller.js`, `routes/ganaderia.js`, `routes/carwash.js`, `services/reports.js`, `services/ganaderiaService.js`, `services/carwashService.js`. Antes de activar `DATABASE_URL` hace falta UNA de estas dos soluciones (no es mecánico, es una decisión de diseño):
  - Crear `business_today(tenant_id)`/`business_day(valor, tenant_id)` como funciones reales de PostgreSQL (nueva migración en `supabase/migrations/`), consultando `tenant_settings` y usando `AT TIME ZONE` para la conversión — y traducir cada `date(x, '+N day')` a aritmética de intervalos (`(x::date + interval 'N days')::date`), consulta por consulta.
  - O calcular el día de negocio en JavaScript (reutilizando `businessClock.day()`) y filtrar/agrupar esas consultas del lado de la aplicación en vez de inline en SQL.
- **Resuelto** — `server/src/seed.js`: ya no usa el minilenguaje de modificadores de fecha de SQLite. Se agregaron los helpers `addDays(n)`/`addMonths(n)` (calculan la fecha en JavaScript con `Date`/`setUTCDate`/`setUTCMonth`) y se pasan como parámetro `?` en vez de interpolar el modificador en el SQL. `seed.js` SÍ corre en los tests (`NODE_ENV=test`), así que esto bloqueaba validar contra Postgres y ya está resuelto.

### Lo único que falta antes de poder activar `DATABASE_URL`

**Una sola decisión de diseño pendiente**: `business_day()`/`business_today()` (ver arriba) en `routes/barberia.js`, `routes/taller.js`, `routes/ganaderia.js`, `routes/carwash.js`, `services/reports.js`, `services/ganaderiaService.js`, `services/carwashService.js`. Elegir una de las dos soluciones ya descritas (funciones reales de Postgres vía nueva migración, o calcular el día de negocio en JavaScript) y aplicarla en esos 7 archivos — es la única pieza que impide hoy correr la suite completa contra una Postgres real de punta a punta.

### Cómo validar cuando esté resuelto el punto de arriba

1. `node tests/run-isolated.js` sin `DATABASE_URL` (SQLite) → debe seguir en 526/526, cero regresión (ya se confirma así con cada archivo convertido).
2. Levantar un Postgres efímero (`docker run ... public.ecr.aws/supabase/postgres:17.6.1.134` o `postgres:16`), extender `tests/run-isolated.js` (o correrlo a mano por suite) pasando `DATABASE_URL` en vez de `DATABASE_PATH` en el `env` de cada proceso lanzado — el arnés ya es agnóstico del motor porque prueba por HTTP contra el server real. Mismas 13 suites, mismos 526 checks, deben pasar igual contra Postgres. (Con la conversión ya completa, esto debería funcionar en cuanto se resuelva `business_day`/`business_today` — vale la pena intentarlo primero para ver si aparece algo más antes de invertir en la solución de diseño.)
3. Solo entonces seguir con la Fase 3 (RLS) de `docs/MIGRACION-SUPABASE-POSTGRES.md`.
