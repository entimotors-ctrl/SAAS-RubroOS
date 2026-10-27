# RubroOS: identidad y lanzamiento inicial de Barbería

Actualizado el 27 de octubre de 2026.

## Identidad propuesta

**Nombre:** RubroOS  
**Frase de marca:** *Tu negocio, en orden.*  
**Promesa:** una operación diaria clara para que el dueño, el equipo y los clientes sepan qué sigue.

La marca se construye sobre un tono confiable, directo y cercano. RubroOS evita hablar como un sistema complicado: dice “agenda”, “cobrar”, “turno”, “equipo” y “resumen”.

### Logotipo

El nuevo símbolo es una `R` dentro de un bloque redondeado. La pieza central es estable y fácil de reconocer en móvil; el punto dorado señala la atención al cliente. Se creó como SVG dentro del código para que no pierda calidad al usarse en icono, pantalla, presentación o impresión.

- Fondo oscuro: `#08111F`
- Verde RubroOS: `#37E0B4`
- Azul RubroOS: `#4D8DFF`
- Dorado de Barbería: `#D4AF37`
- Texto claro: `#E2E8F0`

No modificar la forma, deformar el símbolo ni usarlo sobre fondos con poco contraste. Para Barbería, el dorado acompaña al sistema pero no reemplaza la marca principal verde/azul.

## Decisión de mercado inicial

El primer producto comercial será **RubroOS para Barberías**. Taller sigue disponible para demostraciones internas, pero no se publicará como parte de la oferta inicial hasta que complete su propio piloto. Esta decisión reduce soporte, capacitación y mensajes comerciales contradictorios.

### Mensaje comercial inicial

> Agenda organizada, cobro por silla y un panel claro para tu equipo.

Para una barbería pequeña, la demostración debe recorrer: crear servicios y barberos → agendar → atender desde el panel del barbero → cobrar → revisar comisiones y reporte.

## Revisión de Barbería

### Lista para piloto controlado

- Agenda por barbero, duración por servicio y rechazo de horarios cruzados.
- Horario semanal por barbero, con lunes a sábado de 09:00 a 18:00 como punto de partida editable.
- Bloqueos por fecha completa o por horas para vacaciones, descansos y capacitaciones; la agenda no permite reservar dentro de esos períodos.
- Estados de cita: pendiente, confirmada, llamada, en atención, completada, cancelada y no asistió.
- Pantalla táctil de barbero con llamar al siguiente, iniciar, finalizar y marcar ausencia.
- Un barbero no puede atender o llamar dos citas al mismo tiempo.
- Clientes, servicios, precios, cuentas, métodos de pago y comisión calculada al cobrar.
- Panel de colaboradores: invitación de un solo uso, contraseña propia, tareas privadas y suspensión de acceso.
- Aislamiento por negocio y pruebas automatizadas de permisos y cambios simultáneos.

### No vender todavía como incluido

- Reservas públicas hechas por el cliente desde un enlace.
- Confirmaciones y recordatorios automáticos por WhatsApp.
- Anticipos, depósitos o cobros en línea.
- Inventario profesional de productos de reventa y descuento de stock.
- Arqueo de caja, gastos, pagos de comisión o conciliación bancaria.
- Ficha avanzada del cliente: preferencias, alergias, historial visual/fotos y consentimiento de marketing.
- Varias sucursales o una agenda compartida entre sedes.

## Prioridad de desarrollo antes de vender a más de un piloto

1. **Unir cita y cuenta — completado en esta entrega.** Caja permite elegir una cita terminada, rellena cliente/barbero/servicio y el servidor impide crear una segunda cuenta para la misma cita.
2. **Disponibilidad real — completada en esta entrega.** El administrador puede configurar la semana de cada barbero y crear bloqueos de día completo o por horas. El servidor verifica ambos al agendar.
3. **Reserva y confirmación.** Crear una página pública limitada por disponibilidad y un mensaje de confirmación. WhatsApp debe añadirse después de que Meta y el dominio HTTPS estén configurados.
4. **Cierre de caja.** Separar efectivo, tarjeta y transferencia; permitir registrar gastos y revisar el saldo esperado.
5. **Producto e inventario.** Crear catálogo de pomadas, shampoo y otros productos, con stock y movimientos. Solo se ofrecerá como “inventario” tras completar esta parte.

## Piloto recomendado

Escoger una barbería con 2 a 5 barberos durante dos semanas. Antes de iniciar, cargar sus servicios, precios, barberos y clientes activos. Al final de cada día, revisar: citas creadas/completadas/no asistidas, cuentas cobradas por método, comisiones y dificultades del equipo. No activar reservas públicas ni campañas masivas hasta completar el primer ciclo diario sin incidencias críticas.

## Dominio de prueba con GitHub

GitHub Pages puede publicar una página informativa o una landing en `https://TU_USUARIO.github.io`. No puede ejecutar el servidor Node, las rutas `/api`, la base de datos SQLite, Claude ni el webhook de WhatsApp; por eso no puede alojar RubroOS completo.

Puede usarse así durante el piloto:

- `TU_USUARIO.github.io/rubroos`: página pública de presentación.
- Un VPS con HTTPS: aplicación RubroOS, API, base de datos, Claude y WhatsApp.

Cuando se compre un dominio propio, se recomienda usar `www.tudominio.com` para la web y `app.tudominio.com` para RubroOS. GitHub Pages admite dominios propios, pero la aplicación debe continuar en el VPS.

## Claude

El código ya incluye soporte para Claude mediante estas variables del servidor:

```text
AI_PROVIDER=anthropic
AI_API_KEY=clave_de_Anthropic
AI_MODEL=claude-haiku-4-5-20251001
```

La clave se coloca solamente en el archivo privado de producción del VPS. No se agrega al repositorio, a GitHub Pages ni al frontend. Antes de usarla con clientes, se debe configurar presupuesto/límites en Anthropic y hacer una prueba real por cada herramienta autorizada.

## Meta WhatsApp: lo que se configurará después

Meta se necesita únicamente para recibir y enviar mensajes reales por WhatsApp. RubroOS ya contiene el webhook, la verificación de firma, protección contra mensajes repetidos y vínculo de número con administrador. Todavía falta configurar una cuenta real de Meta y el dominio HTTPS.

1. Crear o usar una cuenta de Facebook con autenticación de dos factores.
2. Crear una cuenta de Meta Business y verificar el negocio cuando Meta lo solicite.
3. Entrar a Meta for Developers, crear una app de tipo Business y añadir el producto WhatsApp.
4. Crear o asociar una cuenta de WhatsApp Business y registrar el número que enviará los mensajes. El número debe poder recibir SMS o llamada durante el proceso y no debe estar siendo usado por otra configuración incompatible.
5. Cuando RubroOS ya esté en HTTPS, configurar en Meta la URL `https://app.tudominio.com/api/whatsapp/webhook`, elegir un verify token nuevo y suscribirse al campo `messages`.
6. Crear un token de sistema de larga duración con permisos mínimos necesarios para WhatsApp. Obtener el Phone Number ID, WhatsApp Business Account ID, App ID y App Secret.
7. Guardar esos datos directamente en el archivo privado del servidor. No pegarlos en chat, en capturas, en GitHub ni dentro del código.
8. Probar primero con uno o dos números permitidos, revisar que el webhook conteste la verificación y hacer un recorrido completo de mensaje, confirmación y cancelación.

Antes de este punto no hace falta que entregues secretos. Solo se necesitarán cuando el VPS y `app.tudominio.com` estén funcionando con HTTPS.
