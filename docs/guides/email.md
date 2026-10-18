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

## Programación de campañas

Una campaña puede **programarse** para una fecha/hora futura (botón "Programar").
Un programador en segundo plano envía las campañas cuya fecha ya se cumplió.
Se puede **cancelar** antes de que se ejecute.

## Tracking de apertura y clics

- **Apertura**: cada correo incluye un pixel de 1×1 (`/api/v1/public/email/open/:id`)
  que registra la primera apertura.
- **Clics**: los enlaces se reescriben para pasar por
  `/api/v1/public/email/click/:id?url=...`, que cuenta el clic y redirige.
- Las campañas muestran **aperturas y clics** junto a enviados/total.

## Reportes y exportación

- **Reporte**: `GET /email/campaigns/:id/report` devuelve tasas de apertura/clic,
  clics únicos/totales y el detalle por destinatario. En la UI, el botón
  "Reporte" muestra un gráfico de barras.
- **Exportar**: `GET /email/campaigns/:id/export` descarga un **CSV** con la lista
  de destinatarios (email, estado, apertura, clics). Con `?format=json` devuelve
  JSON y con `?format=xlsx` genera un Excel.
- **Serie temporal**: el reporte incluye `timeSeries` (aperturas/clics por día).

## Eventos desde bloques

Los bloques pueden emitir eventos de negocio (ej. `order.created`) que disparan
automatizaciones. El bloque declara sus eventos en `block.json` (`"events"`), y
se listan automáticamente en el selector de eventos de las automatizaciones.

```ts
// dentro del register de un bloque
fastify.post('/order', async () => {
  await fastify.events.emit('order.created', {
    user: { email: 'cliente@ejemplo.com' },
    order: { id: '123', total: 99 },
  });
});
```

El bloque de ejemplo (`@webs/block-example`) incluye un endpoint `POST
/api/v1/blocks/example/order` que emite `order.created`.

## Permisos

- `email.read` — ver plantillas/campañas/automatizaciones.
- `email.write` — crear/editar.
- `email.send` — enviar/programar campañas.

