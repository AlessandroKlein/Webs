# Pagos (arquitectura de pasarelas)

Webs incluye un **núcleo de pagos** en la base y **cada pasarela como un bloque**
que se registra como proveedor. El usuario activa solo las pasarelas que usa.

## Núcleo (base)

| Componente | Descripción |
| ---------- | ----------- |
| Tabla `Payment` | `id`, `provider`, `transactionId` (único), `amount` (centavos), `currency`, `status` (`pending/approved/rejected`), `userId`, `idempotencyKey`, `metadata`, `paidAt`. |
| `POST /payments/checkout` | Recibe el carrito, **valida montos con Zod** (enteros positivos, anti-manipulación de precios), llama al proveedor y guarda la transacción. |
| `POST /payments/webhook/:provider` | Recibe la notificación, el proveedor **valida la firma criptográfica**, y el núcleo aplica **idempotencia** (no reprocesa) y actualiza el estado. |
| `POST /payments/:id/mark-paid` | Aprueba manualmente un pago contra entrega. |
| `GET /payments` / `GET /payments/:id` | Lista/consulta de transacciones. |

## Proveedores (bloques)

| Bloque | Método | Secretos |
| ------ | ------ | -------- |
| `mercadopago` | SDK oficial / API REST | `accessToken`, `webhookSecret` |
| `modo` | SDK / API REST (QR) | `clientSecret`, `webhookSecret` |
| `payway` | Decidir 2.0 | `apiKey`, `webhookSecret` |
| `stripe` | API REST + Stripe.js | `secretKey`, `webhookSecret` |
| `paypal` | API REST | `clientSecret`, `webhookSecret` |
| `ebanx` | API REST | `integrationKey`, `webhookSecret` |
| `pos` | Contra entrega / terminal (mPOS, Point, Payway) | `apiKey`, `webhookSecret` |

Cada bloque expone un endpoint `GET /public-config` (sin secretos) para el
cliente y se configura en **Bloques → <proveedor> → Configurar**.

## Contrato de proveedor (SDK)

Un bloque de pasarela registra un `PaymentProviderAdapter`:

```ts
fastify.payments?.register({
  id: 'stripe',
  displayName: 'Stripe',
  createTransaction: async (input) => ({ transactionId, paymentUrl }),
  verifyWebhook: async (request) => ({ transactionId, status }),
});
```

## Seguridad

- **Secretos cifrados** en reposo (`x-ui.secret` → AES-256-GCM con `ENCRYPTION_KEY`).
- **Anti-manipulación de precios**: montos enteros (centavos) validados con Zod en el servidor.
- **Firma de webhook**: cada proveedor valida su cabecera (`x-signature`,
  `stripe-signature`, `paypal-transmission-sig`, …) antes de actuar.
- **Idempotencia**: `idempotencyKey` + verificación de `transactionId` ya procesado.
- **Tokenización (PCI-DSS)**: la tarjeta se tokeniza en el SDK de la pasarela;
  el servidor nunca recibe el PAN.
- **Auditoría**: los pagos aprobados emiten `payment.approved` (automatizaciones).

## Activar

La plantilla **Mercado/E-commerce** (`templates/market.json`) instala todos los
bloques de pago y crea la página **Pago** (slot `payment`).
