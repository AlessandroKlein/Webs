# Política «todo nativo, sin modo de pago» — auditoría de dependencias

> **Regla:** Webs se ejecuta **100% autoalojado** con dependencias de **licencias permisivas**
> (MIT / Apache-2.0 / BSD-2-Clause / ISC). No hay **SaaS de pago** como dependencia de runtime, no
> hay **copyleft** (GPL/AGPL/LGPL) en el grafo de runtime, y toda funcionalidad «de pago» es un
> **plugin opcional** que el cliente final configura (y que la plataforma no necesita para correr).

## 1. Principios

1. **Autoalojado por defecto**: la base no exige ninguna cuenta, API key ni URL de terceros para
   arrancar. PostgreSQL, Redis y el almacenamiento son propios (o MinIO/self-hosted).
2. **Solo licencias permisivas**: MIT, Apache-2.0, BSD-2/3-Clause, ISC. Prohibido copyleft
   (GPL/AGPL/LGPL) y licencias propietarias/de pago en dependencias de runtime.
3. **Sin SaaS de pago como dependencia**: no se integra Builder.io, Contentful, Prismic, Sanity,
   Auth0 ni ningún servicio que cobre por su uso como requisito de funcionamiento.
4. **Los SaaS opcionales son plugins del cliente**: los proveedores de pago (MercadoPago, Stripe,
   PayPal, Ebanx, Payway) y de envío (OCA, Andreani) son **plugins** que el *cliente final* conecta
   con sus propias credenciales. La plataforma **no** los requiere para correr; son integraciones
   de negocio, no dependencias de runtime de la base.
5. **Preferir vendored/self-owned cuando sea posible**: las primitivas UI de shadcn/ui se
   **vendorearon** en `apps/web/src/components/ui/` (sin depender de `@radix-ui`); el editor visual
   elegido (GrapesJS, ADR-0011) es MIT y autoalojado.

## 2. Auditoría de dependencias (runtime)

Inventario de dependencias de runtime por paquete, con licencia:

### `apps/api` (backend)

| Dependencia | Licencia | Nota |
|-------------|----------|------|
| `fastify` + `@fastify/*` (cookie, cors, helmet, jwt, rate-limit, sensible, swagger, swagger-ui, multipart, websocket) | MIT | Framework HTTP |
| `@prisma/client` | Apache-2.0 | ORM |
| `@aws-sdk/client-s3` | Apache-2.0 | Cliente S3; apunta a MinIO/self-hosted, no fuerza AWS |
| `ioredis`, `bullmq` | MIT | Redis + colas |
| `rate-limiter-flexible` | ISC | Rate-limit global en Redis (ADR-0008) |
| `pino` | MIT | Logging |
| `zod`, `ajv` | MIT | Validación |
| `bcryptjs` | MIT | Hashing de contraseñas |
| `otplib` | MIT | TOTP 2FA |
| `nodemailer` | MIT-0 | SMTP (servidor propio o del cliente) |
| `exceljs` | MIT | Export/import |
| `sanitize-html` | MIT | Saneado del HTML del builder |
| `sharp` | Apache-2.0 | Imágenes (nativo, permisivo) |
| `dotenv` | BSD-2-Clause | Config (permisivo) |
| `@simplewebauthn/server` | MIT | Passkeys |
| `@licensify/core` | interno (`workspace:*`) | Licencias locales (repo Licensify) |

### `apps/web` (frontend)

| Dependencia | Licencia | Nota |
|-------------|----------|------|
| `react`, `react-dom` | MIT | UI |
| `react-router-dom` | MIT | Enrutado |
| `@tanstack/react-query` | MIT | Server state |
| `zustand` | MIT | Client state |
| `i18next`, `react-i18next` | MIT | i18n (ADR-0012) |
| `@tiptap/*` | MIT | Rich text |
| `bootstrap-icons` | MIT | Iconos |
| `qrcode` | MIT | QR |
| `@simplewebauthn/browser` | MIT | Passkeys |
| `tailwindcss`, `@tailwindcss/vite` | MIT | Estilos (ADR-0009) |
| `vite` | MIT | Build (dev) |

### `packages/*`

- `@webs/plugin-sdk`: `zod` (MIT) — el resto es código propio.
- `@webs/core`, `@webs/ui`, `@webs/i18n`: **sin dependencias de runtime externas** (solo
  `peerDependencies: react` en `@webs/ui`).
- `@webs/config`: `@eslint/js` (MIT) + `typescript-eslint` (MIT/BSD-2-Clause) — solo tooling.

## 3. Verificaciones de la política

| Chequeo | Resultado |
|---------|-----------|
| ¿Alguna dependencia GPL/AGPL/LGPL en runtime? | **No** |
| ¿Algún SaaS de pago como dependencia (`@builder.io`, `contentful`, `@sanity/*`, `@prismicio/*`, `@auth0/*`)? | **No** (grep sin coincidencias) |
| ¿Dependencias propietarias/de pago? | **No** |
| ¿shadcn/ui vía `@radix-ui`? | **No** — vendoreado en `apps/web/src/components/ui/` |
| ¿Editor visual pagado? | **No** — GrapesJS (MIT, ADR-0011) |
| ¿Almacenamiento/SaaS forzado? | **No** — S3-compatible (MinIO self-hosted) |
| ¿Proveedores de pago/envío? | **Solo plugins opcionales** (`plugins/mercadopago`, `stripe`, `paypal`, `oca`, `andreani`, `ebanx`, `payway`) |

## 4. Excepciones y límites honestos

- Los **proveedores de pago/envío** son SaaS *para el cliente final* (el comercio los conecta con
  sus credenciales). Webs los integra pero **no los requiere**: una instalación sin ellos arranca
  y funciona (sin pagos/onboarding). Esto no contradice la política porque son **plugins de
  negocio**, no dependencias de la base.
- `@aws-sdk/client-s3` es solo un *cliente* de protocolo S3; el backend de almacenamiento puede ser
  MinIO (self-hosted) o cualquier S3-compatible. No implica contratar AWS.
- El licenciamiento de Webs (ADR-0007 / `docs/architecture/licensing-integration.md`) es la **única**
  pieza «de pago» del producto, y es **local/offline** (sin servidor de licencias externo).

## Notas

- Auditoría basada en los `package.json` del monorepo (raíz, `apps/*`, `packages/*`, `plugins/*`).
- Anexo legal de cara al cliente: `docs/legal/05-cumplimiento-componentes-sin-pago.md` (lista de
  licencias verificada contra `node_modules` y mantenible con `pnpm licenses list --prod`).
- El editor visual GrapesJS se documenta en ADR-0011; la estrategia i18n en ADR-0012.
- Doc de coherencia de producto: `docs/architecture/base-universal.md`.
