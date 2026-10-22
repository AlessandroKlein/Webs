# Arquitectura: núcleo vs plugins

Webs sigue un modelo de **dos capas**: un **núcleo obligatorio** (no desactivable,
garantiza estabilidad/seguridad/ciclo de vida) y **plugins opcionales**
(activables/desactivables por usuario). Este documento formaliza ese modelo y lo
mapea a la implementación actual.

> Webs usa **Fastify + Prisma + pino + ioredis** (no Express/NestJS). Las
> librerías del ejemplo se traducen a sus equivalentes.

> **Nota de naming:** la unidad de extensión se llama **«Plugin»** (antes «Bloque»).
> El rename de la superficie de usuario está completo, pero el *naming interno*
> (`block.read`/`block.manage`, directorio `blocks/`, modelos `BlockInstallation`/
> `BlockPlacement`) se conserva de forma transitoria. Ver
> [`plugin-system.md`](plugin-system.md#8-estado-transitorio-del-rename-bloques-plugins).

## 1. Principios

1. **Núcleo mínimo estable**: solo lo indispensable para arrancar, autenticar,
   persistir y coordinar plugins.
2. **Dependencia unidireccional**: los plugins dependen del núcleo (registro,
   eventos, permisos, settings); **el núcleo nunca depende de un plugin**.
3. **Desacople por eventos**: el núcleo emite eventos (`user.registered`,
   `payment.approved`, …) y los plugins se suscriben; si un plugin falta, el flujo
   sigue (degradación elegante).
4. **Desactivación sin romper**: quitar/desactivar un plugin no rompe la app.

## 2. Núcleo (obligatorio, no desactivable)

| Componente | Implementación en Webs | Estado |
| ---------- | ---------------------- | ------ |
| Auth / JWT (usuarios) | `@fastify/jwt` + refresh opaco + RBAC | ✅ |
| Hashing de contraseñas | `bcrypt` (coste 10) · `argon2` como alternativa | ✅ |
| Seguridad (helmet/CORS) | `@fastify/helmet` + CSP/HSTS + `@fastify/cors` | ✅ |
| Validación de esquemas | `zod` (auth/pagos) + JSON Schema (Fastify) | ✅ |
| Base de datos (ORM) | `prisma` (Postgres/SQLite/MySQL) + migraciones | ✅ |
| Carga de plugins (registry) | `plugins/loader.ts` + `pluginRegistry` | ✅ |
| Bus de eventos | `events` plugin (`fastify.events.emit`) | ✅ |
| Logs | `pino` (JSON estructurado) | ✅ |
| Rate limit global | `@fastify/rate-limit` (→ Redis con `rate-limiter-flexible`) | ✅ / 🔜 |

## 3. Plugins (opcionales)

| Módulo | Tipo | Estado |
| ------ | ---- | ------ |
| Email (transaccional + marketing) | módulo base (auth lo usa) | ✅ |
| Media / uploads (`@fastify/multipart` + `sharp` + storage) | plugin | 🔜 v0.24.0 |
| Notificaciones push / WebSocket | `ws` (ya) · push web | ✅ / 🔜 |
| Notificaciones SMS/WhatsApp (Twilio) | plugin | 🔜 v0.25.0 |
| Cola de tareas (BullMQ + Redis) | plugin | 🔜 v0.23.0 |
| Auditoría / actividad | módulo base (con filtros + export) | ✅ |
| Exportación (Excel/PDF) | `exceljs` (ya) · `pdfkit` | ✅ / 🔜 |
| Pagos (pasarelas) | plugins | ✅ v0.21.0 |

## 4. Desviaciones recomendadas respecto al ejemplo

1. **`bcrypt` en lugar de `argon2`**: evita bindings nativos; `argon2` queda como
   alternativa documentada.
2. **Email sigue en el núcleo**: la verificación/recuperación de cuenta lo usa.
   Si se "deshabilita", la app degrada (muestra el enlace en pantalla/log).
3. **`@fastify/multipart`** en lugar de `multer`; **`@fastify/websocket`** en
   lugar de `socket.io` (sin dependencias extra).
4. **Caché/rate limit/cola comparten Redis**: un solo cliente `ioredis`.
5. **Los plugins usan `x-ui.secret`** para cifrar claves (AES-256-GCM), igual que
   las pasarelas de pago.

## 5. Contrato de un plugin (resumen)

Un plugin declara en `plugin.json` (se acepta `block.json` por retrocompatibilidad):
`entry`/`clientEntry`, `settings` (JSON Schema), `permissions`, `slots`, `menu`,
`events`, `translations`. En `register(fastify, config)`:
- registra rutas bajo `/api/v1/plugins/<id>`,
- registra **proveedores** (`fastify.payments`, `fastify.<dominio>`),
- se suscribe a eventos del bus,
- usa `config` (settings cifrados/descifrados) y `services.db`/`services.cache`.

Ver [Sistema de plugins](plugin-system.md) y [Crear un plugin](../guides/crear-un-plugin.md).

## 6. Siguientes pasos

Ver [PLAN-ENTREGA.md](../../../PLAN-ENTREGA.md): v0.22.0 (rate limit + caché
Redis) → v0.23.0 (BullMQ) → v0.24.0 (media + storage) → v0.25.0 (notificaciones).
