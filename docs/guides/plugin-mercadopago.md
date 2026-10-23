# Plugin Mercado Pago (referencia)

`plugins/mercadopago` es el **plugin de referencia** de un pago seguro. Demuestra
todo el modelo de plugins aplicado a una integración real.

## Configuración (en **Plugins → Mercado Pago → Configurar**)

| Campo | Tipo | Cifrado |
| ----- | ---- | ------- |
| `storeName` | texto | — |
| `environment` | sandbox / production | — |
| `publicKey` | texto (público) | — |
| `accessToken` | password | ✅ `x-ui.secret` (AES-256-GCM) |
| `webhookSecret` | password | ✅ `x-ui.secret` (AES-256-GCM) |
| `checkoutMode` | embedded / redirect | — |
| `primaryColor` | color | — |

Los secretos se cifran en reposo con `ENCRYPTION_KEY` y se descifran solo al
usarlos; nunca se devuelven al cliente.

## Endpoints (bajo `/api/v1/plugins/mercadopago`)

- `GET /public-config` → config pública (sin secretos) para montar el SDK.
- `POST /payment` → crea una preferencia; acepta `idempotencyKey` (token único de
  pago) y emite `mercadopago.payment.created`.
- `GET /payment/:id/status` → estado del pago.
- `POST /webhook` → verifica `x-signature` (HMAC-SHA256) y emite
  `mercadopago.payment.approved`.

## Seguridad aplicada

- **Tokenización (PCI-DSS)**: la tarjeta se tokeniza con el SDK de Mercado Pago
  usando la `publicKey`; el plugin **nunca** recibe ni guarda el PAN.
- **Secretos cifrados**: `accessToken` y `webhookSecret` vía `x-ui.secret`.
- **Idempotencia**: cada pago lleva un `idempotencyKey` único (evita cobros dobles).
- **Webhook firmado**: se valida `x-signature` con HMAC-SHA256 antes de actuar.
  (En producción, firmá el *body crudo* y validá la cabecera real de Mercado Pago.)
- **Auditoría**: los eventos de negocio disparan automatizaciones y quedan en el
  registro de auditoría.

## Activar con una plantilla

La plantilla **Mercado/E-commerce** (`templates/market.json`) instala este plugin
automáticamente y crea el menú con la página de **Pago** (slot `payment`).
