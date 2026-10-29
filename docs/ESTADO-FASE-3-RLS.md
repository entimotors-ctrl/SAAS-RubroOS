# Fase 3 (Row-Level Security): estado

Actualizado el 29 de octubre de 2026.

## ✅ FASE 3 COMPLETA — RLS real, validado con un rol restringido (no superusuario)

Postgres ahora aplica aislamiento por tenant **dentro de la base de datos
misma**, como segunda capa de defensa independiente de que el código de la
aplicación filtre bien por `tenant_id` (que ya lo hace — ver la suite
`security-multitenant`, sin cambios). Las 14 suites (`node tests/run-isolated.js`,
TEST_DATABASE_URL apuntando a un Postgres real) pasan con un rol de conexión
que **no** es superusuario, ni dueño de las tablas, ni tiene `BYPASSRLS` —
condición necesaria para que esto demuestre algo: cualquiera de esos tres
hace que Postgres se salte RLS sin importar las políticas.

### Qué se construyó

1. **`supabase/migrations/20261027140010_rls.sql`** — habilita RLS y crea una
   política por tabla:
   - Tablas con `tenant_id` propio (~41, incluida `users`, con `tenant_id`
     NULL para el dueño del SaaS): `tenant_id = current_setting('app.tenant_id')
     OR current_setting('app.bypass_rls') = 'true'`.
   - `tenants`: la propia fila ES el tenant (su `id`, no una columna aparte).
   - Tablas hijas sin `tenant_id` propio (`taller_venta_items`,
     `barberia_cuenta_items`, `agro_pedido_items`, `password_resets`):
     heredan el aislamiento vía una subconsulta `EXISTS` al padre.
   - Tablas sin ningún concepto de tenant (`owner_events`,
     `whatsapp_inbound_events`): política "solo bypass" — nunca visibles
     bajo un contexto de tenant normal.
2. **`server/src/security/dbAccess.js`** (nuevo) — contexto de acceso por
   operación (`AsyncLocalStorage`): `asTenant(id, fn)`, `asOwner(fn)`,
   `asSystem(fn)` (para lo que por diseño resuelve A QUÉ tenant pertenece
   algo — login, registro, recuperación de contraseña, invitaciones de
   staff, identidad de WhatsApp). Motor-agnóstico: bajo SQLite no hace nada
   (nadie lo lee); solo `server/src/db/postgres.js` lo traduce a session
   vars de Postgres.
3. **`server/src/db/postgres.js`**:
   - `applyAccessContext()`: exige que exista un contexto (si no, lanza un
     error claro) y hace `SELECT set_config('app.tenant_id'|'app.bypass_rls',
     ..., true)` (el `true` final = `SET LOCAL`, se revierte solo al cerrar
     la transacción).
   - Cada llamada SUELTA (sin `db.transaction()` explícito) ahora abre su
     propia mini-transacción (`BEGIN` / aplicar contexto / consulta /
     `COMMIT`) — antes iba directo al pool. Costo: 2 round-trips extra por
     consulta suelta; irrelevante a la escala de este SaaS, y es el patrón
     estándar para RLS + pool de conexiones (una conexión se reutiliza entre
     tenants distintos, así que el contexto no puede fijarse "por conexión").
   - `ensureAppRole()`: crea/sincroniza (idempotente) el rol restringido que
     usa `DATABASE_URL` — nombre y contraseña salen de ahí mismo, sin
     credenciales nuevas que inventar. Corre con `DATABASE_ADMIN_URL` (nueva
     variable opcional) si está definida; si no, reutiliza `DATABASE_URL`
     (modo simple para desarrollo, pero entonces esa URL debe ser ya un rol
     con permisos de owner/DDL).
   - `warnIfRlsBypassed()`: en cada arranque, si el rol que usa `pool` puede
     saltarse RLS, imprime una advertencia fuerte en el log (no bloquea el
     arranque — es diagnóstico).
4. **Contexto establecido en los puntos de entrada reales**:
   - `middleware/auth.js` (`requireAuth`): la lectura del propio usuario por
     id corre bajo `asSystem` (todavía no se sabe su tenant); a partir de ahí,
     `asTenant(user.tenant_id, next)` o `asOwner(next)` envuelve el resto del
     request — incluyendo `requireTenant`/`requireOwner` y el handler final.
   - `routes/auth.js` (`/registro`, `/login`, `/owner-login`),
     `routes/staffPublic.js` (`/invitation`, `/activate`),
     `services/passwords.js` (`reset()`), `services/staffService.js`
     (`preview()`/`activate()`), `whatsapp/identityResolver.js` (`resolve()`):
     todos bajo `asSystem` — resuelven A QUÉ tenant pertenece algo antes de
     que exista un tenant_id por el cual filtrar.
   - `routes/whatsapp.js`: `claimMessage`/`markEvent` (idempotencia de Meta,
     sin RLS) siempre bajo `asSystem`; el resto del procesamiento de un
     mensaje (tools, ventas, confirmaciones) corre bajo `asTenant(identity.tenantId, ...)`
     una vez resuelta la identidad — la lógica de negocio real SÍ queda
     protegida por RLS, no todo el webhook bajo bypass.
   - `src/seed.js` (`ensureSeed`): bajo `asSystem` completo (crea la cuenta
     owner y varios tenants demo a propósito).
   - `src/index.js` (`/api/ready`): bajo `asSystem` (ruta pública, sin tenant).
5. **Los 11 archivos de test que llaman a `db.prepare(...)` directamente**
   (fuera de HTTP) se envuelven en `dbAccess.asSystem(...)` en su punto de
   entrada — un cambio de una línea por archivo. No afecta nada bajo SQLite
   (ver abajo); bajo Postgres evita que el chequeo de "falta contexto" se
   dispare en fixtures/limpieza que, legítimamente, tocan varios tenants.
6. **`server/tests/rls-defense.js`** (nueva suite, 14ª): prueba ADVERSARIAL,
   no de uso normal — con el contexto de un tenant A, corre una consulta que
   a propósito NO filtra por `tenant_id` (el bug exacto que esto previene) y
   confirma que Postgres igual solo devuelve filas de A; que un UPDATE/INSERT
   de A intentando tocar/suplantar a B es rechazado por la política; que el
   bypass sí ve a través de tenants; y que una consulta sin NINGÚN contexto
   establecido falla fuerte, no en silencio. Sin `DATABASE_URL` reporta 0/0
   (SQLite no tiene RLS que probar).
7. **`server/tests/run-isolated.js`**: cuando corre contra Postgres
   (`TEST_DATABASE_URL`), cada suite usa un rol `rubroos_app` real (no el
   superusuario admin que crea la base) vía `DATABASE_URL`, y ese superusuario
   vía la nueva `DATABASE_ADMIN_URL` — así la validación local prueba RLS de
   verdad, no un superusuario que se lo salta todo.

### Dos bugs reales encontrados durante esta validación (ya corregidos)

1. **Un chequeo cruzado de tenants legítimo se rompía bajo RLS**:
   `identityService.js` (`initiateLink`) comprueba a propósito si un número
   de WhatsApp ya está activo en OTRO tenant (`tenant_id != ?`), para dar un
   409 claro — bajo el contexto normal del tenant que llama, RLS oculta esa
   fila de otro tenant y la comprobación nunca "veía" el conflicto. Es la
   ÚNICA consulta de ese flujo que necesita cruzar tenants; se envolvió en
   `asSystem` puntualmente, dejando el resto de la función bajo el contexto
   normal.
2. **`CREATE ROLE`/`ALTER ROLE` no aceptan parámetros ($1) en la cláusula
   `PASSWORD`** (son sentencias de utilidad, no DML) — había que escapar el
   valor a mano como literal SQL. Además, la imagen de Postgres de Supabase
   trae su propia extensión (`supautils`) que bloquea un `ALTER ROLE` que
   repita banderas como `NOSUPERUSER` salvo que la conexión sea el
   superusuario real del clúster (ni siquiera `postgres` lo es ahí) — se
   resolvió haciendo que el `ALTER ROLE` de sincronización solo toque la
   contraseña, no las demás banderas (que ya quedaron fijadas al crear el rol).

### Validación

- SQLite: 526/526 (todas las suites, incluida la nueva `rls-defense` que
  reporta 0/0 ahí) — cero regresión, como en cada fase anterior.
- Postgres real, rol restringido: 518/518 en las 13 suites existentes +
  8/8 en `rls-defense` = 526 checks totales, 0 fallos.

### Qué falta antes de activar `DATABASE_URL` en un entorno real

Nada técnico de esta fase. Lo que sigue es la Fase 4 (importar los datos
reales desde la SQLite de producción) y la Fase 5 (piloto en paralelo) —
ver `docs/MIGRACION-SUPABASE-POSTGRES.md`. Para un proyecto Supabase real,
`DATABASE_URL` debe usar el rol restringido (crear un usuario en el SQL
Editor de Supabase con `DATABASE_ADMIN_URL` apuntando a la conexión
administradora del proyecto para el primer arranque, igual que en el arnés
de pruebas) — nunca la cadena de `service_role` ni la del superusuario del
proyecto para el tráfico normal de la API.
