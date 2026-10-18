# Plan de entrega — elementos críticos

Plan de integración de los módulos críticos en releases. Webs usa **Fastify +
Prisma + pino + ioredis**, por lo que las librerías Express/NestJS se mapean a sus
equivalentes. Regla de arquitectura: el **núcleo** lleva lo que todos necesitan
(seguridad, rendimiento, archivos) y los **bloques** llevan lo que es opcional o
de terceros (notificaciones, storage cloud).

## 1. Estado actual (ya implementado)

| Elemento pedido | Equivalente en Webs | Estado |
| --------------- | ------------------- | ------ |
| Inyección SQL | Prisma (consultas preparadas) | ✅ |
| `zod` / `joi` | `zod` (auth, pagos) + JSON Schema (Fastify) | ✅ |
| `sanitize-html` / `dompurify` | `sanitize-html` (servidor) | ✅ |
| `express-rate-limit` | `@fastify/rate-limit` (global + por ruta) | ✅ |
| `argon2` / `bcrypt` | `bcrypt` (coste 10) | ✅ (argon2 opcional) |
| `dotenv` / `@nestjs/config` | `dotenv` + `zod` (`config/env.ts`) | ✅ |
| `crypto` AES-256-GCM | `lib/crypto.ts` + cifrado por campo | ✅ |
| `helmet` | `@fastify/helmet` + CSP/HSTS | ✅ |
| `nodemailer` | `modules/mail` | ✅ |
| `socket.io` / `ws` | `@fastify/websocket` | ✅ |
| `pino` / `winston` | `pino` (JSON estructurado) | ✅ |
| `redis` / `ioredis` | `ioredis` (cliente) | ✅ (sin uso pleno) |
| `twilio` / WhatsApp | — | ❌ pendiente (bloque) |
| `multer` | `@fastify/multipart` | ❌ pendiente (núcleo) |
| `sharp` | `sharp` | ❌ pendiente (núcleo) |
| `@aws-sdk/client-s3` | S3/R2/MinIO | ❌ pendiente (bloque) |
| `bullmq` | cola en memoria → `bullmq` | ❌ pendiente (núcleo) |
| `rate-limiter-flexible` (Redis) | rate limit en memoria → Redis | ❌ pendiente (núcleo) |

## 2. Decisiones: núcleo vs bloques

**Núcleo (base común para todos):**
- `rate-limiter-flexible` (Redis) — rate limit distribuido.
- Caché Redis (`lib/cache.ts`) aplicada a consultas calientes.
- `bullmq` — cola de tareas en segundo plano.
- Módulo **Media** (subida `multipart` + `sharp` + almacenamiento local).

**Bloques/plugins (opcionales, por usuario):**
- **Notificaciones** (SMS/WhatsApp vía Twilio): bloque de proveedor, igual que pagos.
- **Storage cloud** (S3/R2/MinIO): bloque/adaptador de storage.
- **argon2**: alternativa al `bcrypt` (opcional, bindings nativos).

## 3. Plan de releases (completado)

- ✅ **v0.23.0 — Seguridad y rendimiento**: rate limit Redis (`rate-limiter-flexible`)
  + caché Redis (`lib/cache.ts`) en settings y catálogo.
- ✅ **v0.24.0 — Tareas en segundo plano**: `bullmq` para la cola de correos
  (reintentos + backoff), fallback a polling sin Redis.
- ✅ **v0.25.0 — Multimedia**: módulo Media (`@fastify/multipart` + `sharp` + local)
  y bloque **storage-s3** (S3/R2/MinIO).
- ✅ **v0.26.0 — Notificaciones**: registro de proveedores + bloque **Twilio**
  (SMS/WhatsApp).

## 4. Orden sugerido

> Convención: al completar cada release, actualizar este documento y ROADMAP.md.
