# RubroOS: funciones por rubro y trabajo del equipo
Investigación y propuesta de producto · 25 de septiembre de 2026

RubroOS tiene cinco rubros: taller, barbería, agro, ganadería y carwash. La comparación siguiente distingue lo existente de las ampliaciones recomendadas. Las páginas de proveedores son referencias de producto, no normas obligatorias ni una certificación de que RubroOS tenga todas sus funciones.

## 1. Taller
**Referencia:** [Shopmonkey](https://www.shopmonkey.io/) integra presupuestos, órdenes, facturación, clientes, repuestos e inspecciones. Su [documentación de inspecciones](https://support.shopmonkey.io/hc/en-us/articles/38743049848852-Perform-Inspections) describe el registro del estado del vehículo y el intercambio de resultados.

**Base existente en RubroOS:** clientes, vehículos, inventario, ventas y órdenes con diagnóstico, presupuesto, estados y conversión a venta. Hay control de existencias y registro de cambios.

**Flujo recomendado:** recepción → revisión → presupuesto autorizado → reparación → control final → cobro y entrega.

**Trabajo del colaborador añadido:** el administrador asigna tareas como revisar frenos, cambiar aceite o hacer control final; el mecánico confirma, inicia y termina únicamente sus tareas. Estas tareas son independientes: completar una tarea no factura ni cierra automáticamente una orden.

**Próximo desarrollo específico:** vincular tareas con órdenes/vehículos; inspecciones con fotos y checklist; autorización del presupuesto por cliente; registro de horas y garantía. Prioridad comercial: vínculo orden–técnico y evidencia de revisión.

## 2. Barbería
**Referencia:** [Fresha para barberías](https://www.fresha.com/for-business/barber) combina agenda, reservas, gestión del equipo, clientes, inventario y cobros. Es una referencia para organizar el trabajo por profesional y reducir huecos y ausencias.

**Base existente:** barberos, clientes, servicios, agenda con duración y rechazo de cruces, cuentas, cobros y comisiones configurables.

**Pantalla de trabajo añadida:** agenda individual por día, cliente y servicio; actualización cada 15 segundos; botones grandes para llamar al siguiente, iniciar, finalizar y marcar ausencia. Solo se atienden las citas del día del negocio. Un barbero no puede mantener dos citas llamadas/en atención a la vez desde este panel. Pantalla completa si el navegador la admite.

“Llamar” destaca al cliente en la pantalla; no hace una llamada telefónica ni envía WhatsApp. “Finalizar” registra la atención, no realiza un cobro. El barbero no ve precios, teléfonos, ventas ni citas de otro profesional. El administrador puede seleccionar al barbero cuya agenda revisa.

**Próximo desarrollo específico:** horarios/descansos por barbero, reservas públicas con disponibilidad real, lista de espera, recordatorios y políticas configurables de cancelación. Los depósitos requieren integrar y validar un proveedor de pagos antes de ofrecerlos.

## 3. Agro
**Referencias:** [Farmbrite Cultivos](https://www.farmbrite.com/crops) cubre planificación y seguimiento del cultivo. Su [guía de cosechas](https://help.farmbrite.com/help/crop-harvests) contempla cantidades, calidad y destino del producto. [Gestión de recursos](https://www.farmbrite.com/resource-management) aporta referencias para existencias, lotes y equipos.

**Base existente:** venta de insumos, productos, pedidos, entrega, cobro/devolución y cotización de servicios con dron. Este alcance corresponde principalmente a un comercio o prestador de servicios agrícolas. No equivale todavía a un sistema completo de administración de fincas.

**Trabajo del colaborador añadido:** preparar pedidos, programar una visita, revisar equipos o realizar una labor. Asignación, fecha, prioridad y confirmación personal.

**Próximo desarrollo específico para una finca:** parcelas y superficie; campañas y cultivos; planificación de labores; aplicaciones e insumos por parcela; cosecha por lote; costos y rendimiento. Para comercio de insumos: lotes, vencimientos, proveedores y compras. Conviene ofrecer dos modalidades claramente identificadas, evitando vender funciones de finca que aún no existen.

## 4. Ganadería
**Referencia:** [Farmbrite: inicio con ganado](https://help.farmbrite.com/help/getting-started-with-livestock) organiza animales y grupos, salud, reproducción y producción. Su [historial del ganado](https://www.farmbrite.com/features/livestock-activity-history) sirve como referencia de trazabilidad individual.

**Base existente:** animales e identificación, producción de leche por turno, control de duplicados, correcciones con motivo y reportes. Verificar con el ganadero los demás registros presentes antes de prometer una cobertura sanitaria o reproductiva completa.

**Trabajo del colaborador añadido:** ordeño, limpieza, alimentación o revisión de un lote. Una tarea completada acredita el estado del trabajo; no crea automáticamente registros de producción ni constituye validación veterinaria.

**Próximo desarrollo específico:** vínculo tarea–animal/lote, pesajes históricos, calendario sanitario, tratamientos con responsable, reproducción/partos, movimientos, alimentación y costos. Priorizar identificación y trazabilidad; formularios adaptados a campo y futura sincronización sin conexión.

## 5. Carwash
**Referencia:** [DRB Washify](https://drb.com/tunnel_solutions/point-of-sale/washify) reúne punto de venta, membresías, programación de servicios, seguimiento del personal y reportes. Sus funciones para túneles o identificación de vehículos son referencias avanzadas, no requisitos del carwash manual.

**Base existente:** clientes/vehículos, servicios, cola de turnos, estados, membresías y cobro al entregar.

**Trabajo del colaborador añadido:** asignar lavado, interior, secado o revisión final como tareas privadas. El colaborador confirma y actualiza su trabajo sin acceso a caja o membresías.

**Próximo desarrollo específico:** asociar trabajador y puesto al turno; checklist por paquete, fotos de recepción/entrega, estimación de espera y consumo de materiales. Automatizar renovaciones de membresías solo después de integrar pagos y gestionar fallos/cancelaciones.

## Panel común de colaboradores
La [documentación de tareas de Farmbrite](https://help.farmbrite.com/help/tasks) es una referencia para asignar y seguir labores. El diseño de RubroOS de esta entrega utiliza:

- Administrador: invitar, generar/renovar enlace, vincular barbero, suspender/restablecer acceso, asignar/reasignar y cancelar tareas.
- Colaborador: crear contraseña personal desde el enlace, consultar solo sus asignaciones, confirmar → iniciar → completar. Historial propio de tareas terminadas.
- Invitación: un solo uso, 48 horas, token aleatorio almacenado como hash; al renovar se invalida el enlace anterior. La cuenta pendiente no puede iniciar sesión.
- Acceso: el servidor obtiene negocio y usuario de la sesión. Las rutas generales, reportes y chat del administrador no están disponibles para el colaborador. La integración general de WhatsApp queda reservada al administrador.
- Conflictos: versiones para rechazar cambios desactualizados y auditoría de invitaciones, asignaciones y estados. Suspender invalida sesiones existentes.
- Diseño: formularios adaptables, tarjetas, estados claros y botones táctiles. Requiere conexión; no se anuncia funcionamiento sin internet ni bloqueo automático del apagado de pantalla.

## Cómo probar
1. En el equipo, abrir http://127.0.0.1:4180/elegir-sistema. En el móvil, conectado a la misma Wi-Fi, usar http://192.168.0.116:4181/elegir-sistema mientras el equipo y el servidor estén encendidos. La IP puede cambiar.
2. Elegir rubro e ingresar con la cuenta de demostración `maestro@rubroos.test`, contraseña `Maestro2026!`.
3. Abrir **Equipo y tareas**. Crear colaborador con nombre y correo. En barbería, vincularlo a un barbero activo; cada barbero tiene una sola cuenta vinculada.
4. Copiar el enlace privado y abrirlo en otro navegador/dispositivo. Si se usará en móvil, generar el enlace desde la dirección Wi-Fi, no desde 127.0.0.1. No se envía correo automáticamente.
5. El colaborador crea su propia contraseña de al menos 12 caracteres. Después puede iniciar sesión eligiendo su rubro y usando su correo/contraseña.
6. Asignarle una tarea, verificar que solo él la vea y confirmar/iniciar/completar desde su panel. Reasignarla antes de terminar debe retirarla del panel anterior.
7. En barbería, crear citas para hoy y ese barbero. Abrir **Mis citas** o **Abrir pantalla de citas**. Probar llamar → iniciar → finalizar; en otra cita probar ausencia.
8. Suspender al colaborador desde administración y comprobar que pierde el acceso. Para una invitación cancelada, restablecer acceso y generar un nuevo enlace.

Datos de esta demostración separados de la base original. No introducir datos reales de clientes para estas pruebas. Las mejoras propuestas por rubro siguen siendo un plan de producto salvo las funciones expresamente indicadas como existentes o añadidas.

## Antes de comercializar
Priorizar un piloto real por rubro y documentar sus criterios de aceptación. Para producción hacen falta dominio/HTTPS, servidor persistente, copias externas y restauración probada, correo/transporte de invitaciones si se automatiza, canales reales de IA/WhatsApp configurados, condiciones comerciales y una política de soporte. Separar claramente la suscripción al software de los costos de mensajes, IA y pagos. No presentar esta demo local como servicio público listo para clientes sin completar esa preparación.

## Acceso directo de prueba del barbero
En **Barbería**, ingresar con `barbero.pruebas@rubroos.test` y `BarberoPruebas2026!`. Cuenta exclusiva de la demostración, vinculada a Junior Flores. En **Mis tareas** hay una tarea de preparación; en **Mis citas** se muestra su agenda. Se verificó visualmente la confirmación de tarea y el recorrido llamar → iniciar → finalizar sobre una cita identificada como “Cliente QA panel”. Para regresar a administración, cerrar sesión e ingresar con el maestro.

Comprobaciones: 518 checks de backend aprobados en 13 suites; compilación correcta. Revisión visual a 390 × 844 y comprobación de enlace desde la red local. Esto no sustituye una prueba física en cada modelo de móvil ni certifica un despliegue de producción.
