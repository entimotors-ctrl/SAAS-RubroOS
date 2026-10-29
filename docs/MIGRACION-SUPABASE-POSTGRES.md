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
- ⬜ Fase 4 (importación) y Fase 5 (piloto paralelo) siguen pendientes.

## Fases de trabajo

1. **Esquema PostgreSQL.** Traducir tablas, índices, claves foráneas, restricciones y datos iniciales a migraciones SQL versionadas en `supabase/migrations`.
2. **Adaptador de datos.** Sustituir las llamadas SQLite por `pg`, transacciones asíncronas y consultas parametrizadas. Las pruebas pasan a usar una base PostgreSQL efímera.
3. **Reglas de seguridad.** Conservar `tenant_id` en todas las tablas operativas; añadir pruebas que demuestren que un tenant no lee ni modifica registros ajenos.
4. **Importación única.** Exportar la SQLite actual, importar en PostgreSQL en una sola transacción por grupo de tablas y comparar conteos, importes, ventas, saldos e integridad de referencias.
5. **Prueba paralela.** Ejecutar una copia de pruebas con Supabase antes de cambiar producción. Solo después se cambia `DATABASE_URL` en el VPS.

No se borrará ni se modificará la SQLite original hasta validar la importación y realizar una copia de seguridad recuperable.

## Lo que debe preparar el dueño

1. Crear un proyecto nuevo de Supabase llamado `rubroos-produccion` o `rubroos-pruebas`. Para el primer piloto conviene empezar con `rubroos-pruebas`.
2. Elegir una región cercana a los usuarios y guardar la contraseña de base de datos en un gestor de contraseñas.
3. En *Connect*, copiar la cadena de conexión adecuada para el backend. Si el VPS solo tiene IPv4, elegir **Session pooler**; no compartir la contraseña por chat.
4. Cuando el VPS exista, guardar la cadena allí como `DATABASE_URL`. Ejemplo de forma, sin datos reales:

```text
DATABASE_URL=postgresql://rubroos_app:CONTRASENA@HOST:PUERTO/postgres?sslmode=require
```

5. Compartir únicamente el identificador público del proyecto o su URL si se necesita revisar la configuración visual. La contraseña, el `DATABASE_URL`, `service_role`, claves de Claude y tokens de Meta se insertan directamente en secretos del servidor.

## Criterio para cambiar a producción

La migración estará lista cuando todas las pruebas de RubroOS pasen sobre PostgreSQL, la importación verifique los datos y un piloto de Barbería complete agenda, cobro, comisión, panel de barbero y WhatsApp sin errores de aislamiento.
