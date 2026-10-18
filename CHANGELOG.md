# Registro de cambios

Las versiones siguen [SemVer](https://semver.org/lang/es/). Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.13.0] - 2026-10-18

### Añadido

- **FIDO2 / Passkeys**: registro y login sin contraseña (huella/rostro/llave de
  seguridad) vía WebAuthn, con gestión en "Mi cuenta".
- **Cifrado por campo aplicado a contacto**: teléfono, dirección y WhatsApp se
  cifran en reposo (`x-ui.secret`).
- **ROADMAP.md** con elementos futuros y recomendaciones.

## [0.12.0] - 2026-10-18

### Añadido

- **Tokens de API personales**: cualquier usuario gestiona sus propios tokens (ya
  no solo admin); los scopes se validan para no exceder sus permisos.
- **Rate limit por token** (peticiones/minuto) y contador de peticiones.
- **"Recordarme"** en el login: la cookie de sesión dura 90 días (vs 30).

## [0.11.0] - 2026-10-18

### Añadido

- **Bloqueo de cuenta** por intentos fallidos de login (5 intentos → 15 min), a
  nivel de cuenta (además del rate limit por IP).
- **Códigos de respaldo para 2FA** (de un solo uso) y página **Mi cuenta** para
  activar/desactivar 2FA con QR/clave + códigos.
- **Cifrado por campo aplicado**: la contraseña SMTP (y campos `x-ui.secret`) se
  cifran automáticamente al guardar y se descifran al leer.

## [0.10.0] - 2026-10-18

### Añadido

- **Traducciones por bloque**: los bloques declaran `translations` en `block.json`
  y se sirven en `/public/i18n` bajo un namespace propio (su id), solo para
  idiomas habilitados + bloques instalados (cierra "módulos bajo demanda").
- `i18n.t()` del bloque resuelve por defecto en su namespace.

## [0.9.0] - 2026-10-18

### Añadido

- **Arranque "todo en uno" con Docker**: `docker compose up -d --build` levanta
  PostgreSQL, **MySQL**, Redis, API y web. Se agregó MySQL como alternativa.
- **Valores de conexión pre-cargados en el asistente** (presets PostgreSQL/MySQL
  de Docker, SQLite local y PostgreSQL local).
- `.dockerignore`, `Makefile` (`make up/down/logs/reset`) y compose canónico en la raíz.

## [0.8.0] - 2026-10-18

### Añadido

- **Programación de campañas** (fecha/hora) con `schedule`/`cancel` y scheduler
  en segundo plano.
- **Tracking de apertura y clics**: pixel de apertura + reescritura de enlaces,
  con contadores por campaña.
- **Eventos desde bloques**: los bloques declaran eventos en `block.json` y los
  emiten vía `fastify.events.emit(...)`; el bloque de ejemplo emite `order.created`.

## [0.7.0] - 2026-10-18

### Añadido

- **Seguridad integral** (checklist):
  - Cifrado de PII en reposo con **AES-256-GCM** (`lib/crypto.ts` + `ENCRYPTION_KEY`).
  - Sanitización de HTML (**XSS**) con `sanitize-html` en plantillas de correo y contenido.
  - **2FA / TOTP** (Google Authenticator/Authy) con flujo de login y endpoints de setup/confirm/disable.
  - **Rate limiting específico** en login/registro/recuperación de contraseña.
  - Mínimo privilegio en BD (`create-least-privilege-user.sql`) y **Dependabot**.

## [0.6.0] - 2026-10-18

### Añadido

- **API tokens (JWT)** para acceso programático a la API REST con scopes acotados,
  caducidad opcional y revocación inmediata (verificados contra la BD en cada
  petición). Sección "API Tokens" en el panel.
- Permisos nuevos: `apiToken.read`, `apiToken.write`.
- `authenticate` ahora acepta token de acceso (JWT) y token de API (JWT con
  `type: 'api_token'`).

## [0.5.0] - 2026-10-18

### Añadido

- **SSL/TLS opcional para la API** (`SSL_ENABLED` + certificado/clave por archivo
  o PEM): el usuario decide si lo activa.
- **Sección de seguridad en la UI** (HSTS, cookies seguras, CSP) con cabeceras
  aplicadas por plugin.
- Cookies de sesión `Secure` configurables; aviso en producción si `JWT_SECRET`
  usa el valor por defecto.
- Ejemplo de nginx con TLS + redirección HTTP→HTTPS y guía de seguridad.

## [0.4.0] - 2026-10-18

### Añadido

- **Selección de idiomas + carga bajo demanda**: el administrador elige qué
  idiomas habilita (uno o varios) en la instalación o en Ajustes; el frontend
  descarga únicamente los recursos de esos idiomas (`GET /api/v1/public/i18n`).
- Catálogo de idiomas en `@webs/i18n` con `es`, `en` y `pt`.
- Soporte de arrays (multi-selección) en el formulario auto-generado (SchemaForm).

## [0.3.0] - 2026-10-18

### Añadido

- **Módulo de Email marketing/automatización**:
  - Plantillas HTML con **editor visual (WYSIWYG) o HTML crudo** (a elección) y
    variables (`{{ user.name }}`, `{{ site.name }}`, …).
  - **Campañas masivas** (todos los usuarios, por roles o lista manual).
  - **Automatizaciones** por eventos (`user.registered`, `user.email_verified`,
    `user.password_changed`) con extensión por bloques.
  - **Cola de envío** en segundo plano con estado `queued/sent/failed`.
- Permisos nuevos: `email.read`, `email.write`, `email.send`.

## [0.2.0] - 2026-10-18

### Añadido

- **Asistente de instalación gráfico** (frontend multi-paso + API `/api/v1/setup/*`):
  selección de base de datos (PostgreSQL / SQLite / MySQL), configuración del
  sitio (nombre, logo claro/oscuro, icono, favicon), SMTP y creación de la cuenta
  administrador. Sin tocar código.
- **Soporte multi-motor de base de datos** vía esquemas Prisma por motor
  (`prisma db push` + `prisma generate` en la instalación).
- **Módulo de correo (SMTP)** con `nodemailer`: verificación de email y
  restablecimiento de contraseña.
- Estado de instalación persistido en `data/webs.config.json`; la API arranca en
  "modo instalación" si aún no está configurada.
- Páginas de verificación de correo y restablecimiento de contraseña.

## [0.1.0] - 2026-10-18

### Añadido

- Monorepo `pnpm workspaces` con TypeScript estricto.
- Backend **Fastify 5**: REST `/api/v1`, WebSocket `/ws`, Swagger `/docs`,
  health checks, manejo de errores consistente, rate limiting, CORS, helmet.
- **Sistema de bloques/plugins** (manifiesto `block.json` + SDK + loaders + slots).
- Módulos: auth (JWT + refresh token + RBAC), users, roles/permissions,
  settings (JSON Schema → formulario), blocks, content, translations, audit.
- Frontend **React 19 + Vite**: panel de administración, temas claro/oscuro,
  i18n (es/en), formularios auto-generados, editor de CSS, gestión de bloques.
- Bloque de ejemplo (`@webs/block-example`).
- Persistencia con **Prisma 6 + PostgreSQL** (esquema y seed de roles/permisos).
- Docker Compose + Dockerfiles + CI (GitHub Actions).
- Documentación completa (arquitectura, API, guías, ADRs).
