# Seguridad

Webs se construye con **seguridad por defecto**. Esta guía resume las medidas
aplicadas (organizadas por categoría) y cómo activar las opcionales.

## 1. Protección de la base de datos

- **Inyección SQL (SQLi)**: todas las consultas usan **Prisma** (ORM con consultas
  preparadas); nunca se concatenan cadenas.
- **Contraseñas**: hash adaptativo con **bcrypt** (coste 10). Nunca en texto plano.
- **Cifrado de PII en reposo**: utilidad de **AES-256-GCM** en
  `apps/api/src/lib/crypto.ts` (`encrypt`/`decrypt`). Usala para cifrar columnas
  sensibles (documentos, teléfonos, direcciones) antes de guardarlas. Requiere
  la variable `ENCRYPTION_KEY` (`openssl rand -hex 32`).

  Aplicado automáticamente a campos marcados como secretos en el esquema de
  ajustes (ej. la **contraseña SMTP**, vía `x-ui.secret`): se cifran al guardar y
  se descifran al leer.

  ```ts
  import { encrypt, decrypt } from '../lib/crypto';
  await prisma.cliente.create({ data: { telefono: encrypt(body.telefono) } });
  ```

- **Mínimo privilegio**: la cuenta de runtime de la app **no** debe ser superusuario.
  Incluimos [scripts/create-least-privilege-user.sql](../../scripts/create-least-privilege-user.sql)
  (solo `SELECT/INSERT/UPDATE/DELETE`); las migraciones se corren con otra cuenta.

## 2. Cabeceras HTTP (headers)

- **Helmet** aplica cabeceras base (y oculta `X-Powered-By`).
- **CSP** y **HSTS** configurables en **Ajustes → Seguridad**.
- **TLS/HTTPS** opcional para la API (`SSL_ENABLED`) y ejemplo de nginx con
  redirección HTTP→HTTPS en `docker/nginx.ssl.conf.example`.

## 3. Fuerza bruta y DoS

- **Rate limiting global** (`@fastify/rate-limit`).
- **Rate limiting específico** en endpoints sensibles: login (10/15 min),
  registro, recuperación y restablecimiento de contraseña (5/15 min).
- **Bloqueo de cuenta**: tras 5 intentos fallidos de login, la cuenta se bloquea
  temporalmente (15 min), además del rate limit por IP.
- **WAF**: en producción, activá Cloudflare (Managed Rules, anti-bot) delante del
  servidor.

## 4. Sanitización y validación de entradas

- **Validación por esquema JSON** (body/query/params) en toda la API.
- **Sanitización de HTML** (`sanitize-html`) en `apps/api/src/lib/sanitize.ts`,
  aplicada a plantillas de correo y contenido enriquecido (mitiga XSS).

## 5. Autenticación y sesiones

- **Cookies**: `HttpOnly` + `SameSite=Lax` + `Secure` (configurable).
- **Tokens**: JWT de acceso (15 min) + refresh token opaco hasheado con rotación.
- **2FA / TOTP**: autenticación de dos factores con Google Authenticator/Authy,
  con **códigos de respaldo** (de un solo uso). Activá en **Mi cuenta**.
  Activá en el panel (`POST /auth/2fa/setup`, `/confirm`, `/disable`); el login
  exige el código cuando está habilitado.
- **API tokens (JWT)** con scopes acotados y revocables.

## 6. Mantenimiento y dependencias

- **Dependabot** configurado para auditoría semanal de dependencias y Actions.
- Ejecutá `pnpm audit` periódicamente.
- **No revelación**: Helmet oculta `X-Powered-By`; en nginx, `server_tokens off;`.
- La API avisa en producción si `JWT_SECRET` usa el valor por defecto.
