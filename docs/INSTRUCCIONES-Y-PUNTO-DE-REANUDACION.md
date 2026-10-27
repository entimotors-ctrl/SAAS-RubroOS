# RubroOS: instrucciones y punto de reanudación

Actualizado el 27 de octubre de 2026.

## Estado comprobado

- La copia de trabajo consolidada está en `work/rubroos-team`.
- El repositorio Git configurado es `git@github.com:entimotors-ctrl/SAAS-RubroOS.git`, rama `main`.
- Se sincronizaron en la copia Git local las mejoras de Barbería, la identidad RubroOS y la documentación de Supabase.
- Las 526 comprobaciones aisladas del backend pasaron: funcionalidad, aislamiento multi-tenant, IA, WhatsApp, operaciones, migraciones, cinco rubros y portal de colaboradores.
- El frontend compiló para producción. La limpieza posterior separó el contexto y el hook de autenticación; el linter y TypeScript ya no reportan advertencias en la carpeta `web/src`.

## Qué quedó pendiente de GitHub

La copia Git local contiene los cambios preparados, pero todavía no se creó el commit ni se hizo `push`. Antes de publicar se intentó la revisión final de formato y secretos; la revisión automática de Codex bloqueó los comandos con permisos ampliados por un límite de uso, no por un hallazgo técnico.

Al reanudar:

1. Ejecutar `git diff --check` y una búsqueda de secretos.
2. Crear un commit con el trabajo consolidado y publicar en `main`.
3. Confirmar el enlace del commit en GitHub.

No añadir archivos `.env`, contraseñas, `DATABASE_URL`, tokens de Meta ni claves de IA al repositorio.

## Qué debes hacer ahora en Supabase

1. Abre el proyecto recién creado y entra a **Project Settings → Database → Connect**.
2. Guarda la contraseña de base de datos en un gestor de contraseñas. No la envíes por chat.
3. Cuando exista un VPS con solo IPv4, copia para uso posterior la cadena **Session pooler**. Si el VPS dispone de IPv6, se podrá usar la cadena de conexión directa.
4. No copies todavía esa cadena en el frontend ni crees tablas manualmente desde el Table Editor.
5. No habilites acceso anónimo a las tablas y no uses `service_role` en el navegador.
6. Comparte únicamente el identificador público o URL del proyecto si hace falta revisar la configuración visual. Las credenciales se colocarán directamente en los secretos del VPS cuando el adaptador PostgreSQL esté listo.

## Por qué no conectamos Supabase todavía

RubroOS funciona hoy sobre SQLite y sus servicios ejecutan transacciones síncronas y consultas propias de SQLite. Conectar una URL de Supabase sin migrar esa capa haría que la aplicación siguiera usando el archivo local, o fallara. La migración profesional seguirá este orden:

1. Crear las migraciones PostgreSQL versionadas para las tablas, índices y restricciones de RubroOS.
2. Sustituir el acceso SQLite por un adaptador PostgreSQL con transacciones y consultas parametrizadas.
3. Configurar las políticas de aislamiento por `tenant_id` y pruebas contra PostgreSQL.
4. Importar los datos de SQLite en una copia, comparar totales y referencias, y hacer un piloto de Barbería.
5. Configurar `DATABASE_URL` en el VPS y cambiar a producción solo después de las pruebas.

El diseño y las decisiones de seguridad están en `docs/MIGRACION-SUPABASE-POSTGRES.md`.

## Funciones que siguen pendientes antes de vender Barbería a escala

- Reservas públicas de clientes basadas en disponibilidad.
- Confirmaciones y recordatorios por WhatsApp cuando Meta y HTTPS estén configurados.
- Cierre de caja con gastos, efectivo esperado y conciliación.
- Inventario y movimientos de productos para pomadas, shampoo y reventa.
- Migración completa de SQLite a Supabase PostgreSQL.

## Archivos de entrega

El paquete actualizado se genera como `RubroOS-actualizacion-barberia-2026-10-27.tar.gz` dentro de la carpeta `outputs` del entorno de trabajo. Incluye el logo, mejoras de Barbería, pruebas, limpieza del frontend y toda la documentación de esta entrega.
