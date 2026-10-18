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

## 3. Plan de releases

### v0.22.0 — Seguridad y rendimiento (núcleo)
- Rate limit distribuido con **Redis** (`rate-limiter-flexible`) detrás de
  `@fastify/rate-limit` (fallback a memoria si no hay Redis).
- **Caché Redis** (`lib/cache.ts`) aplicada a settings, i18n y catálogo de bloques.
- Documentar `argon2` como alternativa a `bcrypt`.

### v0.23.0 — Tareas en segundo plano (núcleo)
- **`bullmq`** reemplaza la cola en memoria del email (cola + reintentos + programación).
- Sistema genérico de jobs (`enqueue`/`process`) con logging `pino`.
- Reusar en: envío de campañas, generación de reportes, procesamiento de imágenes.

### v0.24.0 — Gestión de archivos y multimedia (núcleo + bloque)
- **Media** (núcleo): subida con `@fastify/multipart`, validación de tipo/tamaño,
  **`sharp`** para redimensionar + convertir a WebP/AVIF, y almacenamiento local.
- **Storage providers** (bloque): abstracción + adaptador **S3/R2/MinIO**
  (`@aws-sdk/client-s3`), registro análogo a `fastify.payments`.

### v0.25.0 — Notificaciones SMS/WhatsApp (bloque)
- **Bloque Notificaciones** con proveedor **Twilio** (SMS/WhatsApp): envío de OTP
  para 2FA y notificaciones transaccionales; secretos cifrados (`x-ui.secret`) y
  registro de proveedores análogo a pagos.

## 4. Orden sugerido

1. v0.22.0 (rate limit + caché Redis) → 2. v0.23.0 (bullmq) → 3. v0.24.0 (media +
storage) → 4. v0.25.0 (notificaciones).

> Convención: al completar cada release, actualizar este documento y ROADMAP.md.
