# RubroOS: versión para piloto y preparación del lanzamiento

Actualizado el 21 de septiembre de 2026. Código aplicado al proyecto local. La demo usa datos separados. Esta entrega es una candidata a piloto: todavía no es un servicio comercial desplegado ni una garantía de ausencia de errores.

## Lo que puedes probar ahora

Abre **http://127.0.0.1:4180/elegir-sistema** en este mismo equipo. Elige un rubro e inicia sesión:

- Correo: `maestro@rubroos.test`
- Contraseña: `Maestro2026!`

Tu panel de dueño está en **http://127.0.0.1:4180/owner/login**:

- Correo: `admin@rubroos.test`
- Contraseña: `AdminPruebas2026!`

Estas cuentas son de demostración. El maestro tiene una cuenta independiente en cada rubro. La demo simula la IA y WhatsApp: no envía mensajes ni realiza pagos.

Si reinicias la computadora o cierras el proceso, abre una terminal y ejecuta:

```bash
cd /home/wilkin/Escritorio/saas-principal
node scripts/demo-local.js
```

Espera «RubroOS API escuchando» y deja la terminal abierta. Para detenerlo, Ctrl+C. Los datos de prueba se conservan en `server/data/demo-local/`. El proceso no lee el `.env` del negocio ni su base original. El acceso 127.0.0.1 funciona solo desde esta computadora.

## Funciones de los cinco rubros

| Rubro | Flujo disponible para el piloto | Prueba de aceptación |
|---|---|---|
| Taller | Clientes, vehículos, órdenes con diagnóstico/presupuesto/aprobación, reparación, entrega y venta; POS, stock y créditos | Entregar una orden con un repuesto y un pago parcial. Comprobar una sola venta, un solo descuento de stock y el saldo pendiente |
| Barbería | Agenda por barbero y duración, rechazo de cruces, cuentas/POS, cobro registrado y comisiones sobre servicios | Intentar dos citas superpuestas. Cobrar una cuenta y revisar comisión y método de pago |
| Agro | Insumos, pedidos, entrega con descuento atómico, cobro, devolución completa y reposición; tarifas de dron/cercas por negocio | Entregar y cobrar un pedido. Devolverlo con motivo y verificar reposición única y reembolso registrado |
| Ganadería | Hato, ordeños AM/PM de hembras activas, sanidad, reproducción, corrección de ordeños con motivo y control de versiones | Registrar un ordeño. Intentar duplicarlo. Corregir los litros y comprobar el historial |
| Carwash | Clientes/vehículos, cola con estados secuenciales, entrega, registro del pago, membresías y validación de vigencia | Completar un lavado. Comprobar que aparece como ingreso al entregarlo; probar otro cubierto por membresía vigente |

Registrar efectivo, tarjeta o transferencia **no procesa dinero**. En Agro, confirma una devolución después de recibir todos los productos y realizar el reembolso por el medio correspondiente. Esta versión admite devolución completa del pedido, no devolución parcial.

## Administración dentro de cada rubro

Abre **Administración** en el menú del negocio.

1. Elige Desde/Hasta y pulsa **Consultar reporte**. La medida depende del rubro: ventas del taller, cuentas cobradas de barbería, pedidos creados en Agro, litros de ganadería o lavados entregados.
2. Pulsa **Descargar CSV** para llevar esos registros a una hoja de cálculo. Cada consulta admite hasta 10 000 registros; usa períodos menores si superas el límite.
3. Para guardar un cierre, selecciona un mismo día en Desde/Hasta, escribe notas y pulsa **Guardar cierre del día consultado**. Se conserva una copia del reporte. Un segundo intento recupera el mismo cierre.
4. Ajusta la zona horaria. Agro también permite editar tarifas de dron y cercas. Los cambios se guardan por negocio.
5. Consulta el historial de cambios registrados. La lista muestra las últimas 100 entradas de estas operaciones; no es una auditoría exhaustiva de todos los campos del sistema.
6. Cambia tu contraseña desde el formulario de seguridad. Todas las sesiones anteriores de esa cuenta dejarán de ser válidas.

Los totales de ventas/pedidos no equivalen a saldo de caja. El cierre es una copia informativa: no bloquea operaciones posteriores, no concilia bancos y no hace arqueo de billetes. Los colaboradores pueden cambiar su propia contraseña; las funciones administrativas requieren administrador.

## Tu panel de dueño

- **Negocios:** crear un negocio y su administrador, buscar, cambiar plan, suspender/reactivar y administrar usuarios.
- **Usuarios:** generar un enlace de recuperación de un solo uso. Vence a los 15 minutos. Debes verificar quién lo solicita y entregarlo manualmente. No se envían correos automáticamente.
- **Actividad:** revisar cambios administrativos.
- **Sistema:** consultar modo de ejecución, estado del respaldo automático y si IA/WhatsApp están simulados. También puedes cambiar tu contraseña de dueño.

La mensualidad estimada del panel se calcula a partir del plan asignado; no acredita que el cliente pagó. No hay pasarela de suscripciones ni facturación fiscal conectada.

## Verificación realizada

- **371/371 comprobaciones** en 12 suites con bases temporales independientes: funciones, aislamiento entre negocios, IA, WhatsApp simulado, taller, migraciones, permisos HTTP, operaciones de los cinco rubros y estabilidad.
- La suite nueva cubre tarifas por negocio, restricciones de colaboradores, cobro/devolución sin duplicar stock, corrección de ordeños, reportes por fecha/zona, cierres, CSV, recuperación con token almacenado como hash, caducidad/un solo uso, invalidación de sesiones, respaldos y restauración.
- Arranque adicional con `NODE_ENV=production` en una base temporal vacía: dueño creado, cero negocios demo, registro público cerrado, frontend servido, respaldo automático verificado y apagado ordenado.
- Compilación frontend correcta. Lint sin errores, con dos advertencias anteriores del contexto de autenticación. El compilador advierte sobre el tamaño del paquete JavaScript; queda margen para optimizar carga antes de crecimiento significativo.
- Migración 4 añadida. La demo se migra conservando sus datos; las migraciones con negocios existentes generan una copia previa. No se ejecutó la migración sobre la base original de negocio.
- No se realizó publicación, push, conexión real a Meta ni cobro externo en esta entrega.

Las pruebas automatizadas no equivalen a auditoría independiente, prueba de carga, alta disponibilidad o piloto real.

## Lo que tienes que preparar tú

1. **Tu marca y acceso:** nombre comercial definitivo, correo del dueño y correo/teléfono para soporte. Define el país donde empezarás y la moneda. La interfaz actual usa lempiras.
2. **Dominio y servidor:** disponer de un dominio y un servidor Linux con almacenamiento persistente. El dominio debe poder apuntar al servidor y usar HTTPS. No necesitas comprar nada para probar localmente.
3. **Respaldo externo:** elegir un destino independiente del servidor y quién recibe alertas. Las copias locales ya tienen generación, rotación y verificación; una avería del disco exige una copia fuera del equipo.
4. **IA y WhatsApp reales, si los vas a ofrecer:** disponer de la cuenta/proyecto de IA y de los recursos Meta del negocio. Guardar credenciales en el entorno del servidor y completar la vinculación/validación real. No pegar contraseñas o tokens en documentos públicos. Estas conexiones requieren una prueba final con tus cuentas.
5. **Oferta comercial:** decidir precio, alcance, prueba gratuita, soporte y forma de cobrar. Para empezar puedes gestionar cobros manualmente; para automatizarlos falta elegir e integrar un proveedor y sus webhooks. El panel actual no lleva un libro de pagos de suscripción.
6. **Negocios piloto:** seleccionar al menos uno por rubro y obtener su lista de servicios/productos, precios, inventario y personas autorizadas. Que cada encargado complete el recorrido de la tabla y confirme sus resultados.
7. **Condiciones del servicio:** preparar términos, privacidad, tratamiento de datos y requisitos de facturación aplicables a tu país con la persona responsable de esas áreas. La aplicación todavía no emite comprobantes fiscales.

## Instalación técnica preparada

En el proyecto están estas plantillas para quien administre el servidor:

- `deploy/production.env.example`: variables requeridas y rutas persistentes.
- `deploy/rubroos.service`: servicio de sistema con reinicio y permisos limitados.
- `deploy/nginx.conf.example`: proxy HTTPS con dominio/certificados por sustituir.
- `scripts/backup.js`: copia consistente de SQLite.
- `scripts/restore.js`: restauración a una ruta nueva, con validación de integridad y rechazo de destinos existentes.

Son plantillas; no se han instalado en un VPS. El arranque probado fue local con opciones de producción. Para el piloto, usar una única instancia de Node con SQLite en disco local persistente. No montar esta base en una carpeta de red ni lanzar varias réplicas suponiendo que existe sincronización.

Orden de despliegue:

1. Guardar una versión identificable del código y ejecutar `npm test` desde `server`. Revisar los cambios pendientes antes de crear el commit de lanzamiento.
2. Instalar dependencias desde los archivos lock en servidor y frontend, usando `npm ci`. Compilar con `NODE_ENV=production` y sin `VITE_LOCAL_DEMO=1`. Usar una versión de Node compatible y repetir los tests en el entorno elegido.
3. Colocar el código en `/opt/rubroos`, crear el usuario de servicio `rubroos` y preparar `/var/lib/rubroos` con permisos para ese usuario.
4. Copiar la plantilla de entorno a `/etc/rubroos/production.env`, sustituir los marcadores, generar un `JWT_SECRET` aleatorio, configurar correo/contraseña inicial del dueño, dominio HTTPS y rutas absolutas. Proteger este archivo. El arranque rechaza marcadores `CAMBIAR_`, simuladores y secretos demasiado cortos en producción.
5. Empezar con una **base nueva** de producción, nunca con la demo. Si necesitas conservar datos de la base anterior, primero restaurar una copia a otra ruta y probar las migraciones/operaciones ahí, antes de cualquier cambio definitivo.
6. Preparar certificados y proxy; comprobar la configuración antes de activar los servicios. Exponer únicamente el proxy HTTPS, manteniendo Node en 127.0.0.1.
7. Comprobar `/api/ready`, acceso del dueño y primer respaldo en **Sistema**. Configurar monitoreo externo de disponibilidad, espacio de disco, errores de respaldo y antigüedad de la última copia.
8. Crear negocios y usuarios reales desde el panel. Probar una operación completa por rubro, exportar un reporte y hacer un ensayo de restauración.
9. Validar IA/WhatsApp reales si forman parte de la oferta. Abrir el piloto y mantener una lista de incidencias con responsable y solución antes de lanzar ventas abiertas.

Ejemplo de respaldo manual desde la raíz del proyecto, sustituyendo las rutas por las reales:

```bash
node scripts/backup.js /var/lib/rubroos/rubroos.db /var/lib/rubroos/backups
```

Ejemplo de restauración de ensayo:

```bash
node scripts/restore.js /ruta/copia-verificada.db /ruta/nueva-base-restaurada.db
```

La restauración no modifica `DATABASE_PATH` ni sustituye la base activa. Para un cambio real: detener el servicio, restaurar a una ruta nueva, comprobar integridad/permisos, actualizar `DATABASE_PATH`, iniciar y validar. Conservar la base anterior y el código compatible para poder volver atrás. Proteger y cifrar las copias externas según el destino elegido.

## Alcance que sigue pendiente

Para venderlo como servicio estable falta validar la instalación real, recuperación externa, carga esperada, conexiones reales y aceptación de los pilotos. Requieren desarrollo adicional la pasarela de suscripciones, facturación fiscal, avisos automáticos por correo/WhatsApp y permisos más detallados si el cliente los exige.

Funciones avanzadas por decidir con los pilotos: fotos/firma y reservas de repuestos en Taller; recordatorios y arqueo de caja en Barbería; devoluciones parciales/lotes en Agro; trazabilidad especializada del hato; cobro recurrente y cuotas de uso en Carwash. No se presentan como incluidas en esta versión.

La recuperación del dueño, si pierde su único acceso, aún requiere un procedimiento técnico controlado. Los enlaces de recuperación del panel sirven para usuarios de negocios. No publiques esta demo ni compartas sus credenciales como accesos comerciales.

## Material de capacitación

La presentación `RubroOS-guia-plataforma.pptx` contiene 19 diapositivas editables con acceso, roles, recorridos por los cinco rubros, administración diaria y pendientes de lanzamiento. Incluye capturas de la demo tomadas durante estas entregas; los datos y algunos detalles del menú pueden variar al seguir usándola.
