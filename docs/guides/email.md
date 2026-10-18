# Email: plantillas, campañas y automatizaciones

Webs incluye un módulo de **email marketing y automatización** construido sobre
la configuración SMTP (ver [instalación](instalacion.md)). Todo se gestiona desde
**Correos** en el panel de administración.

## Plantillas

Cada plantilla tiene:

- **Nombre** y **clave** (única).
- **Asunto** con variables.
- **Contenido** en dos modos, a elección del usuario:
  - **Editor visual (WYSIWYG)**: negrita, cursiva, subrayado, listas, títulos y
    enlaces; genera HTML automáticamente.
  - **HTML crudo**: pegás/editas el HTML y CSS directamente.
- **Variables** disponibles (se rellenan al enviar): `{{ site.name }}`,
  `{{ site.url }}`, `{{ user.name }}`, `{{ user.email }}`, `{{ link }}`, etc.

## Campañas (envío masivo)

Una campaña envía una plantilla a un conjunto de destinatarios:

- **Todos los usuarios** activos.
- **Por roles** (ej. solo `editor`).
- **Lista manual** de correos.

Al pulsar **Enviar**, los correos se encolan y un procesador en segundo plano
los envía por lotes (ver cola). La campaña muestra el progreso `enviados/total`.

## Automatizaciones (correos por criterio)

Una automatización es una regla: **"cuando ocurra [evento], enviar [plantilla] al
usuario"**. Eventos base incluidos:

| Evento | Cuándo se dispara |
| ------ | ----------------- |
| `user.registered` | Se registra un usuario |
| `user.email_verified` | Verifica su correo |
| `user.password_changed` | Restablece su contraseña |

Los bloques pueden emitir sus propios eventos (ej. `order.created`) mediante el
servicio `events` del contexto (`ctx.services.events`), lo que permite, por
ejemplo, confirmaciones de compra automáticas.

## Cola de envío

Los correos no se envían de forma síncrona: se guardan en `EmailMessage`
(`queued`) y un procesador periódico los envía por lotes, actualizando su estado
a `sent` o `failed`. Esto permite reintentos y evita saturar el SMTP.

> Para producción con alto volumen, la cola en memoria se puede sustituir por
> una cola externa (BullMQ/Redis), manteniendo la misma tabla y endpoints.

## Permisos

- `email.read` — ver plantillas/campañas/automatizaciones.
- `email.write` — crear/editar.
- `email.send` — enviar campañas.
