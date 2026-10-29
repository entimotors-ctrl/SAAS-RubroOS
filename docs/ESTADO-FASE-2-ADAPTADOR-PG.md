# Fase 2 (adaptador PostgreSQL): estado y punto de reanudación

Actualizado el 29 de octubre de 2026.

## ✅ FASE 2 COMPLETA — validada de punta a punta contra Postgres real

Las 13 suites existentes (`node tests/run-isolated.js`) pasan **idénticas** contra
SQLite (526/526) y contra un PostgreSQL 17 real (518/518 — la diferencia de 8
son exactamente los checks de dos herramientas explícitamente fuera de
alcance para Postgres: la prueba de `migrations.js` nativo de better-sqlite3,
y el bloque de `maintenance/backups.js`/`restore.js`, ver más abajo). Ya no
queda ningún hueco pendiente: `business_day()`/`business_today()` se
resolvieron con la Opción A (funciones reales de Postgres). **Sigue sin
definirse `DATABASE_URL` en ningún entorno real** — eso espera a la Fase 3
(RLS) y a que el usuario decida activar el corte, no a nada técnico.

### Cómo se corrió la validación (reproducible)

```bash
docker run -d --name rubroos-pg-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 \
  public.ecr.aws/supabase/postgres:17.6.1.134
cd server
TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5433" npm test
docker stop rubroos-pg-test && docker rm rubroos-pg-test
```

`TEST_DATABASE_URL` es una variable nueva que entiende `tests/run-isolated.js`:
si está definida, cada una de las 13 suites corre contra su propia base
PostgreSQL (creada/recreada en el `postgres` administrativo), en vez de su
propio archivo SQLite — mismo arnés, mismas 13 suites, sin tocar nada más.

### `business_day()`/`business_today()`: resuelto con la Opción A

Se eligió la Opción A documentada abajo (funciones reales de Postgres, no
recalcular en JavaScript) porque Postgres tiene soporte nativo de zonas
horarias (`AT TIME ZONE`) tan completo como `Intl.DateTimeFormat` del lado
JS, y porque la alternativa (recalcular en JS) hubiera obligado a reescribir
consultas con `GROUP BY`/agregados condicionales (comisiones por barbero,
ventas agrupadas por día) para traer filas crudas y agrupar en la
aplicación — mucho más invasivo que una migración nueva.

- **`supabase/migrations/20261027140009_business_clock.sql`** (nueva): define
  `tenant_timezone(tenant_id)`, `business_today(tenant_id)` y dos overloads de
  `business_day(valor, tenant_id)` — uno para `TIMESTAMPTZ` (columnas como
  `created_at`/`cobrada_at`/`entregado_at`) y otro para `DATE` (columnas como
  `fecha`, donde es un identidad). Las tres leen `tenant_settings` (la MISMA
  tabla que alimenta el cache en memoria del lado JS en `businessClock.js`),
  así que no hay dos fuentes de verdad sobre la zona horaria de un tenant.
  También define `sqlite_add_months(fecha, n)`, que replica el "clamping" de
  SQLite al sumar meses (si el día de origen no existe en el mes destino, cae
  al último día de ese mes — Postgres por defecto desborda al mes siguiente).
- Los 5 sitios que combinaban `business_today()`/`business_day()` con el
  modificador `date(x,'±N day'|'±N month')` de SQLite (sin equivalente en
  Postgres) se tradujeron a mano con el mismo patrón ya usado en
  `barberiaAvailability.js` (dos strings SQL, elegidos con un ternario sobre
  `process.env.DATABASE_URL`): `routes/taller.js`, `routes/ganaderia.js`,
  `services/ganaderiaService.js` (×2), `services/carwashService.js` (×2, uno
  de ellos también traduce `MAX(a,b)` escalar de SQLite a `GREATEST(a,b)` de
  Postgres). El resto de los 7 archivos ya documentados (`routes/barberia.js`,
  `routes/carwash.js`, `services/reports.js`) no necesitaron ningún cambio:
  una vez que las funciones existen en Postgres, el mismo texto SQL sirve
  para los dos motores.
- `services/businessClock.js` (el `db.function()` de SQLite) sigue sin
  tocarse — solo se instala en la rama SQLite de `db.js`, nunca en la de
  Postgres, así que no hay conflicto entre las dos implementaciones.

### Dos bugs adicionales encontrados DURANTE esta validación (ya corregidos)

1. **Postgres pliega a minúsculas los alias SQL sin comillas.** `AS tenantId`
   se convierte en la columna `tenantid` (no `tenantId`) a menos que el alias
   vaya entre comillas dobles (`AS "tenantId"`) — SQLite no hace esto, así que
   el código nunca lo había necesitado. Rompía en silencio la resolución de
   identidad de WhatsApp (`identityResolver.js`: `identity.tenantId`/
   `identity.businessType` quedaban `undefined`) y el estado de vinculación
   (`identityService.js`: `phoneNumber`/`updatedAt`/`linkedUserName`).
   Corregido poniendo esos alias entre comillas dobles — funciona igual en
   los dos motores.
2. **`pg` devuelve `DATE`/`TIMESTAMP(TZ)` como objeto `Date` de JS por
   defecto**, no como el string plano que siempre dio better-sqlite3 (y que
   el código asume — p. ej. `action.created_at.replace(' ','T')+'Z'` en
   `ai/core/orchestrator.js` rompía con un `Date`, que no tiene `.replace`).
   Corregido con `pg.types.setTypeParser` para los OID 1082/1114/1184 (date/
   timestamp/timestamptz), devolviendo el string plano `'YYYY-MM-DD'` /
   `'YYYY-MM-DD HH:MM:SS'` igual que siempre. Ligado a esto: el `Pool` ahora
   fija `options: '-c TimeZone=UTC'` — sin eso, Postgres interpretaría un
   string de fecha-hora sin zona (`'2026-09-21 02:00:00'`) usando el
   `TimeZone` de sesión del servidor en vez de UTC, que es lo que el código
   (JS y SQLite) siempre asumió.

### Un problema de timing en un test, no de la migración

El test de rate limiting de WhatsApp (12b en `tests/whatsapp.js`) asumía que
la respuesta a los 21 mensajes enviados en ráfaga llegaría en el MISMO orden
en que se enviaron, y que la última en llegar sería la cortada por el
limitador. Eso era cierto por accidente bajo SQLite (todo corre
efectivamente serializado por ser síncrono), pero no es una garantía real
del sistema: bajo Postgres, el procesamiento en segundo plano de cada
webhook (`fire-and-forget`, ver `routes/whatsapp.js`) hace E/S real contra la
base y las 21 respuestas pueden completarse en otro orden. Se corrigió la
aserción para verificar que ALGUNA de las 21 respuestas fue cortada por el
limitador (el invariante real que importa), no específicamente la última.

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

**Lo único sin convertir, a propósito (y no hace falta):**
- `services/businessClock.js` — es quien REGISTRA `business_day()`/`business_today()` vía `db.function()`, solo para la rama SQLite de `db.js`. La rama Postgres usa las funciones SQL reales de `supabase/migrations/20261027140009_business_clock.sql` en su lugar — ver la sección "FASE 2 COMPLETA" arriba.
- `maintenance/restore.js` / `maintenance/backups.js` — herramienta de respaldo específica de SQLite, sin equivalente en Postgres (Supabase maneja sus propios respaldos). No aplica.

**`DATABASE_URL` sigue sin definirse en ningún entorno real** — ya no por nada técnico (ver "FASE 2 COMPLETA" arriba), sino porque falta la Fase 3 (RLS) y la decisión del usuario de activar el corte.

### Prueba de extremo a extremo contra Postgres real (29 de octubre de 2026)

Se levantó un PostgreSQL 17 real (imagen oficial de Supabase, contenedor desechable) y se arrancó el servidor completo (`node src/index.js`) con `DATABASE_URL` apuntando a él — nada simulado, el proceso real de producción:

- Bootstrap automático de esquema (50 tablas, Fase 1) al no existir `tenants`.
- `ensureSeed()` creó la cuenta owner y los 5 tenants demo con sus datos de ejemplo (confirmó que la reescritura de fechas de `seed.js` funciona de verdad, no solo en teoría).
- Por HTTP real: login (`/api/auth/login`, JWT con `session_version`), listado de clientes aislado por tenant, creación de una venta con transacción (`/api/taller/ventas`, montos correctos, `NUMERIC` devuelto como `number`), el chat de IA completo (`/api/ai/chat` con proveedor falso: contexto → historial → conversación → respuesta), y el trigger de horario inicial de barbero (`barberia_barbero_horario_inicial`, Fase 1) disparándose correctamente al sembrar un barbero demo.
- `/api/taller/finanzas/resumen` (usa `business_day()`/`business_today()`) falló exactamente como se esperaba — `error: function business_day(text, bigint) does not exist` — un error de SQL visible en el log del servidor, no un dato incorrecto servido en silencio. Confirma que el único hueco real es el ya documentado, y que falla de forma segura (500 + log), no silenciosa.
- Esta prueba encontró y corrigió un bug real en el adaptador: `ensureSchema()` (el bootstrap que aplica `supabase/migrations/`) se lanzaba al cargar el módulo pero nada esperaba esa promesa antes de la primera consulta real — `seed.js` intentaba leer `tenants` antes de que las migraciones terminaran de aplicarse (`relation "tenants" does not exist`). Corregido: `prepare()...exec()` y `runTransaction()` ahora hacen `await ready` antes de ejecutar cualquier consulta — costo cero una vez resuelta la primera vez.

Conclusión de esta prueba (29 de octubre, primera corrida): con el único hueco de `business_day`/`business_today` resuelto, el corte a Postgres debería funcionar de punta a punta sin sorpresas adicionales — confirmado después: ver "FASE 2 COMPLETA" al inicio del documento.

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
- **Resuelto — `business_day()` / `business_today()`**: ver la sección "FASE 2 COMPLETA" al inicio del documento para el detalle completo (Opción A: funciones reales de Postgres).
- **Resuelto** — `server/src/seed.js`: ya no usa el minilenguaje de modificadores de fecha de SQLite. Se agregaron los helpers `addDays(n)`/`addMonths(n)` (calculan la fecha en JavaScript con `Date`/`setUTCDate`/`setUTCMonth`) y se pasan como parámetro `?` en vez de interpolar el modificador en el SQL. `seed.js` SÍ corre en los tests (`NODE_ENV=test`), así que esto bloqueaba validar contra Postgres y ya está resuelto.

### Siguiente paso

Ya no queda nada pendiente de esta fase. El siguiente paso es la Fase 3 (RLS) de `docs/MIGRACION-SUPABASE-POSTGRES.md`.
