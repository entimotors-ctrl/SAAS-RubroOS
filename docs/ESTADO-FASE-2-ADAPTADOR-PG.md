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

## Qué falta (el trabajo grande que sigue)

**Ningún archivo de rutas/servicios se convirtió todavía.** Siguen llamando a `db.prepare(...).get()` etc. de forma síncrona, sin `await`. Eso es seguro mientras nadie defina `DATABASE_URL` (SQLite ignora por completo el adaptador nuevo), pero si alguien la define hoy, el negocio fallaría EN SILENCIO: contra Postgres esas llamadas devuelven una Promise (que es "truthy"), no la fila — un `if (!row)` nunca se cumple, por ejemplo. **No definir `DATABASE_URL` en ningún entorno hasta terminar esta conversión.**

### Patrón mecánico de conversión (repetir por archivo)

1. Cada función que contenga una llamada `db.prepare(...).get/all/run(...)` o `db.transaction(...)` pasa a ser `async`.
2. Cada una de esas llamadas lleva `await` delante.
3. Toda función que LLAME a una función que acabas de volver `async` también debe volverse `async` y hacerle `await` — propagar hacia arriba hasta el handler de ruta de Express (que gracias a `express-async-errors` ya no necesita try/catch envolvente: un `throw`/rechazo dentro de un handler `async` llega solo al error handler global).
4. `await` sobre un valor que no es Promise no hace nada (se resuelve en el siguiente microtask con ese mismo valor) — por eso este patrón no cambia el comportamiento bajo SQLite; es seguro convertir y correr la suite existente después de cada archivo para confirmarlo.

### Dos excepciones que no son mecánicas (ya identificadas, no hay que volver a buscarlas)

- **`server/src/services/barberiaAvailability.js` línea 90**: `SELECT CAST(strftime('%w', ?) AS INTEGER) AS day` — el adaptador no traduce `strftime` genéricamente (es el único uso en todo el código de negocio). Cambiar a mano por `SELECT EXTRACT(DOW FROM ?::date)::integer AS day` — Postgres devuelve la misma convención (0=domingo..6=sábado) que `strftime('%w', ...)`.
- **`server/src/seed.js`**: usa el minilenguaje de modificadores de fecha de SQLite (`date('now','+1 day')`, `date('now', ?)` con `'-6 day'`, etc.) en varias siembras de demo. Postgres no entiende esa sintaxis. Reescribir calculando la fecha en JavaScript (`new Date(Date.now() + dias*86400000).toISOString().slice(0,10)`) y pasarla como parámetro `?`, en vez de interpolar el modificador en el SQL. `seed.js` SÍ corre en los tests (vía `NODE_ENV=test`), así que esto no es opcional para validar contra Postgres.

### Lista completa de archivos pendientes (37, catálogo exhaustivo vía grep de `db.prepare(`/`db.transaction(` — no hay que volver a buscarlos)

Core / transversal (bloquean TODO lo demás, convertir primero):
`middleware/auth.js`, `routes/auth.js`, `utils/crud.js`, `seed.js`, `services/passwords.js`, `security/access.js`

Por rubro:
- Taller: `routes/taller.js`, `routes/tallerInventory.js`, `services/tallerService.js`, `services/tallerSales.js`, `services/tallerOrders.js`
- Barbería: `routes/barberia.js`, `services/barberiaService.js`, `services/barberiaAppointments.js`, `services/barberiaAvailability.js`
- Agro: `routes/agro.js`, `services/agroService.js`, `services/agroPayments.js`
- Ganadería: `services/ganaderiaService.js`, `services/milkCorrections.js` (no se encontró `routes/ganaderia.js` en la lista — usa `utils/crud.js` directamente)
- Carwash: `routes/carwash.js`, `services/carwashService.js`

Transversal / staff / IA / WhatsApp:
`routes/owner.js`, `routes/operations.js`, `routes/staff.js`, `routes/staffPublic.js`, `services/staffService.js`, `services/staffAppointments.js`, `services/settings.js`, `services/reports.js`, `services/businessClock.js`, `ai/core/chatService.js`, `ai/core/history.js`, `ai/core/orchestrator.js`, `ai/core/toolRegistry.js`, `routes/whatsapp.js`, `whatsapp/identityService.js`

No aplica (herramienta de respaldo SQLite, sin equivalente en Postgres — Supabase maneja sus propios respaldos): `maintenance/restore.js`, `maintenance/backups.js`.

### Cómo validar cuando esté todo convertido

1. `node tests/run-isolated.js` sin `DATABASE_URL` (SQLite) → debe seguir en 526/526, cero regresión.
2. Levantar un Postgres efímero (`docker run ... public.ecr.aws/supabase/postgres:17.6.1.134` o `postgres:16`), extender `tests/run-isolated.js` (o correrlo a mano por suite) pasando `DATABASE_URL` en vez de `DATABASE_PATH` en el `env` de cada proceso lanzado — el arnés ya es agnóstico del motor porque prueba por HTTP contra el server real. Mismas 13 suites, mismos 526 checks, deben pasar igual contra Postgres.
3. Solo entonces seguir con la Fase 3 (RLS) de `docs/MIGRACION-SUPABASE-POSTGRES.md`.
