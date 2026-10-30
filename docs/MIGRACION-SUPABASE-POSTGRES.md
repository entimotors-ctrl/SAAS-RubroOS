# Plan de migración de RubroOS a Supabase PostgreSQL

Actualizado el 27 de octubre de 2026.

## Decisión técnica

RubroOS usará **Supabase PostgreSQL como base de datos administrada** y conservará su API Express como única capa que habla con la base. El navegador seguirá comunicándose con `/api`; no recibirá una contraseña de PostgreSQL, una clave `service_role` ni acceso directo a las tablas operativas.

Esta no es una configuración de una sola variable. La versión actual usa SQLite mediante `better-sqlite3` y ejecuta consultas y transacciones en 41 archivos del servidor. Algunas consultas usan funciones y sintaxis propias de SQLite. Cambiar de motor requiere una migración controlada para preservar operaciones, aislamiento por `tenant_id`, auditoría e idempotencia.

No se utilizará la Data API de Supabase como sustituto rápido de la API actual. La lógica de permisos, confirmaciones de IA, WhatsApp, transacciones de ventas y reglas entre rubros debe continuar del lado del servidor.

## Arquitectura destino

```text
Navegador ──HTTPS──> API Express RubroOS ──TLS──> Supabase PostgreSQL
                         │
                         ├── Claude / proveedores de IA
                         └── Meta WhatsApp Cloud API
```

- La API Express se autentica con su JWT existente y decide el `tenant_id` del usuario.
- El servidor usa `DATABASE_URL`, guardada solo en el gestor de secretos del VPS.
- Para un VPS permanente con red IPv4 se usará el **Session pooler** de Supabase; para un servidor IPv6 se puede usar una conexión directa. Nunca se expone esa cadena al frontend.
- Las tablas estarán en un esquema propio de RubroOS, fuera de los esquemas expuestos por la Data API. Las reglas RLS se añaden como defensa adicional y se prueban por tenant.
- Se creará un rol de aplicación con los mínimos permisos; no se utilizará una cuenta administradora de PostgreSQL para ejecutar la API diaria.

## Estado de la migración

- ✅ **Fase 1 (esquema) completada el 27 de octubre de 2026.** Las 50 tablas de negocio (los 5 rubros, IA, WhatsApp, operación transversal y portal de colaboradores) están traducidas a SQL versionado en `supabase/migrations/` (50 tablas; se excluye a propósito `schema_migrations`, que era contabilidad interna del runner de SQLite). Se aplicaron las 9 migraciones contra un PostgreSQL real en un contenedor desechable (imagen oficial de Supabase) y se verificó: creación sin errores, el trigger de horario inicial de barbero, los índices únicos parciales (idempotencia de `ai_actions`, número de WhatsApp activo único entre tenants) y las claves foráneas rechazando referencias inexistentes. Las convenciones de tipos usadas (identity BIGINT, NUMERIC para dinero/cantidades, TIMESTAMPTZ para marcas de tiempo, DATE para fechas de calendario) están documentadas como comentario en `supabase/migrations/20261027140000_core.sql`.
- ✅ **Fase 2 (adaptador `pg` + conversión completa de la capa de negocio) completada y validada el 29 de octubre de 2026.** Los ~41 archivos de servicios/rutas están convertidos a `async`/`await`, y la suite completa de pruebas (13 suites, 526 checks) pasa idéntica contra SQLite y contra un PostgreSQL 17 real (contenedor desechable) — incluido el único hueco de sintaxis que quedaba (`business_day()`/`business_today()`, resuelto con funciones reales de Postgres). Ver `docs/ESTADO-FASE-2-ADAPTADOR-PG.md` para el detalle completo, incluidos dos bugs de compatibilidad encontrados y corregidos en esta validación (alias SQL sin comillas plegados a minúsculas por Postgres, y `DATE`/`TIMESTAMP(TZ)` devueltos como objeto `Date` en vez de string). **`DATABASE_URL` sigue sin definirse en ningún entorno real o compartido** — ya no por nada técnico (la Fase 3, RLS, también está completa — ver abajo), sino porque falta la Fase 4 (importación de datos reales) y la decisión del usuario de activar el corte.
- ✅ **Fase 3 (Row-Level Security) completada y validada el 29 de octubre de 2026.** RLS habilitado en todas las tablas de negocio, con políticas por tenant (y un contexto de acceso por operación: tenant/owner/sistema — ver `server/src/security/dbAccess.js`). Validado con un rol de Postgres genuinamente restringido (no superusuario, no dueño de las tablas, sin BYPASSRLS) — sin eso, la prueba no demostraría nada. Incluye una suite nueva, adversarial (`tests/rls-defense.js`), que confirma que una consulta que a propósito "olvida" filtrar por `tenant_id` igual queda bloqueada por Postgres. Ver `docs/ESTADO-FASE-3-RLS.md` para el detalle completo.
- ✅ **Proyecto Supabase real conectado y validado el 30 de octubre de 2026.** Proyecto "Rubros" (confirmado por Wilkin: sin datos reales de clientes, aunque Supabase lo etiqueta "PRODUCTION"). Esquema + RLS aplicados ahí mismo, rol restringido `rubroos_app` funcionando de verdad (no superusuario), validado por HTTP (seed + login) y con la suite adversarial `rls-defense` (8/8) — luego limpiado (`TRUNCATE` de las 50 tablas) para dejarlo vacío otra vez. Dos particularidades del pooler de Supabase (Supavisor) aparecieron y ya están resueltas en código: certificado TLS firmado por una CA propia de Supabase (`server/certs/supabase-ca.crt`, público, no secreto) y el usuario de conexión necesita el formato `rol.referencia-de-proyecto` para enrutar — ver `server/src/db/postgres.js`.
- ➖ **Fase 4 (importación) no aplica: Wilkin confirmó el 30 de octubre de 2026 que no hay datos reales de RubroOS en ningún lado** (ni en la SQLite actual ni en ningún otro sistema) — no hay nada que exportar/importar/comparar. Si esto cambiara más adelante (por ejemplo, si se usa la SQLite local con datos reales antes de desplegar), esta fase habría que retomarla tal como está descrita abajo.
- ⬜ **Fase 5 (antes "prueba paralela", ahora solo "piloto real"):** sin una SQLite de producción con la que correr en paralelo, lo que queda es el criterio de la sección de abajo — usar RubroOS de verdad (aunque sea solo Wilkin) contra este proyecto Supabase antes de considerarlo la base de datos definitiva. Pendiente: también falta decidir cuándo/dónde se despliega el servidor (VPS) que usaría `DATABASE_URL` en vez de SQLite.

## Fases de trabajo

1. **Esquema PostgreSQL.** Traducir tablas, índices, claves foráneas, restricciones y datos iniciales a migraciones SQL versionadas en `supabase/migrations`. ✅
2. **Adaptador de datos.** Sustituir las llamadas SQLite por `pg`, transacciones asíncronas y consultas parametrizadas. Las pruebas pasan a usar una base PostgreSQL efímera. ✅
3. **Reglas de seguridad.** Conservar `tenant_id` en todas las tablas operativas; añadir pruebas que demuestren que un tenant no lee ni modifica registros ajenos. ✅
4. **Importación única.** *(No aplica — no hay datos reales que importar, ver arriba.)* Si algún día hiciera falta: exportar la SQLite con datos reales, importar en PostgreSQL en una sola transacción por grupo de tablas y comparar conteos, importes, ventas, saldos e integridad de referencias.
5. **Piloto real.** Usar RubroOS de verdad contra el proyecto Supabase (ya conectado) antes de considerarlo la base de datos definitiva — ver el criterio de abajo.

## Lo que debe preparar el dueño

1. ✅ Proyecto de Supabase creado ("Rubros").
2. ✅ Cadena de conexión copiada y puesta en `server/.env` (`DATABASE_ADMIN_URL` para el bootstrap, `DATABASE_URL` con el rol restringido `rubroos_app.<referencia-de-proyecto>` para el día a día).
3. ⬜ Cuando exista un VPS (o cualquier entorno real donde corra el servidor fuera de la máquina de Wilkin), guardar esas mismas dos variables ahí como secretos del servidor — nunca en un archivo versionado ni por chat. Ejemplo de forma, sin datos reales:

```text
DATABASE_URL=postgresql://rubroos_app.referencia-de-proyecto:CONTRASENA@HOST:PUERTO/postgres
```

4. Compartir únicamente el identificador público del proyecto o su URL si se necesita revisar la configuración visual. La contraseña, el `DATABASE_URL`, `service_role`, claves de Claude y tokens de Meta se insertan directamente en secretos del servidor.

## Criterio para cambiar a producción

La migración estará lista cuando todas las pruebas de RubroOS pasen sobre PostgreSQL (✅ ya se cumple) y un piloto de Barbería complete agenda, cobro, comisión, panel de barbero y WhatsApp sin errores de aislamiento, usando el proyecto Supabase real en vez de SQLite.
