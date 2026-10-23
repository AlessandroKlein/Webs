# Pagos y checkout unificado

> **Estado:** implementado (M4). Un solo contrato de creación de pago
> (`POST /api/v1/payments/checkout`) y un cobro físico (`POST /api/v1/payments/pos`)
> orquestados por el núcleo, con métodos de pago extensibles vía
> `fastify.payments.register`. Tienda, suscripciones y caja (POS) comparten el
> mismo flujo de conciliación. El diseño se decide en
> [ADR-0015](../adr/0015-checkout-unificado.md).

## Visión general

Antes había tres flujos de cobro separados (tienda, suscripciones, POS). M4 los
unifica en **un contrato y un bus de eventos**:

```
              ┌────────────────────────────────────────────────┐
              │  apps/api/src/modules/payments/               │
              │   service.ts          routes.ts               │
              │   createCheckoutPayment   POST /payments/checkout │
              │   createPosPayment        POST /payments/pos      │
              └───────────────┬────────────────────────────────┘
                              │ getPaymentProvider(id)
              ┌───────────────▼────────────────────────────────┐
              │  registry.ts — fastify.payments.register()     │
              │  mercadopago · stripe · paypal · ebanx ·       │
              │  payway · pos · mercadolibre                    │
              └───────────────┬────────────────────────────────┘
                              │ webhook / mark-paid
              ┌───────────────▼────────────────────────────────┐
              │  events.emit('payment.approved')               │
              │   → facturacion (comprobante)                  │
              │   → suscripciones (activar membership)         │
              │   → pos (confirmar orden + descontar stock)    │
              └────────────────────────────────────────────────┘
```

## Contrato único de checkout

`apps/api/src/modules/payments/service.ts`:

```ts
createCheckoutPayment(fastify, input: CheckoutPaymentInput): Promise<CheckoutPaymentResult>
```

- Resuelve el proveedor con `getPaymentProvider(input.provider)` (del registry);
  si no existe → `NotFoundError`.
- Llama `provider.createTransaction(input)` y crea un `Payment` `status: 'pending'`.
- Devuelve `{ id, transactionId, status, paymentUrl?, qr? }`.

`CheckoutPaymentInput` extiende `PaymentProviderInput` con `provider`,
`organizationId`, `userId`. `CoreFastify` es un subconjunto estructural
(`prisma` + `events`) declarado localmente para que el módulo sea compilable
desde los plugins que lo importan por ruta relativa (no depende del
module-augmentation de `apps/api`).

`POST /api/v1/payments/checkout` (en `routes.ts`) valida con Zod
(`provider`, `amount` entero positivo, `currency` len 3, `items[]`, `metadata`)
y delega en `createCheckoutPayment`. Es el **único** contrato de creación de
pago online; el `kind` (store | subscription | pos) viaja en `metadata.kind`.

## Métodos de pago extensibles

El registro `fastify.payments.register({ id, displayName, createTransaction,
verifyWebhook })` sigue siendo el mecanismo canónico de extensión:

- `GET /api/v1/payments/providers` devuelve `listPaymentProviders()`.
- Cada proveedor es un plugin que registra `createTransaction` (crea la
  intención en la pasarela) y `verifyWebhook` (valida la firma del webhook).
- Un proveedor nuevo no toca el núcleo.

## Cobro físico en sucursal (POS)

`createPosPayment(fastify, input)` (`service.ts`) registra un pago presencial:

| Modo | `transactionId` | Estado inicial | Efecto |
|------|-----------------|----------------|--------|
| `cash` | `cod_<uuid>` | `approved` (inmediato, `paidAt` ahora) | Emite `payment.approved` en el mismo request. |
| `terminal` | `pos_<uuid>` | `pending` | Se aprueba vía webhook del lector. |

`POST /api/v1/payments/pos` (`routes.ts`, preHandler `authenticate` +
`requireTenant` + `authorize('sales.manage')`) valida con `posSchema`
(`method: cash|terminal`) y delega en `createPosPayment`.

El plugin `pos` (`plugins/pos/src/server.ts`) es ahora un **cliente del checkout
unificado**:

1. `POST /checkout` crea la `Order` en `pending` y llama `createPosPayment` con
   `metadata: { kind: 'pos', orderId }`.
2. Se suscribe a `payment.approved`: si `metadata.kind === 'pos'`, confirma la
   orden (`status: 'paid'`) y descuenta stock de `Product` e `InventoryItem` de
   forma **idempotente** (no hace nada si la orden ya está `paid`).
3. Para efectivo, el evento se emite de forma síncrona dentro de
   `createPosPayment`, por lo que la orden queda confirmada en el mismo request.

## Suscripciones integradas al cobro

Se cerró el `TODO` de `plugins/suscripciones`:

1. `POST /subscribe` con `requirePayment && price > 0` crea la `Membership` en
   `status: 'pending'` y llama `createCheckoutPayment` con
   `metadata: { kind: 'subscription', membershipId, planId, userId }`.
2. Al recibir `payment.approved`, el suscriptor activa la membership
   (`updateMany({ where: { id: membershipId, status: 'pending' } })`).
3. Plan gratuito o `requirePayment=false` → membership `active` directa.

La activación se hace por `metadata.membershipId` (no por `externalReference`),
de modo que es idempotente y no depende del formato del `externalReference`.

## Webhook y conciliación

`POST /api/v1/payments/webhook/:provider` (público, sin auth):

1. Resuelve el proveedor; si `payments.requireWebhookSignature !== false`,
   valida la firma con `provider.verifyWebhook(request)` (si falla → 401).
2. Idempotencia por `transactionId`: si el `Payment` ya no está `pending`,
   devuelve `alreadyProcessed: true`.
3. Normaliza el estado con `normalizeWebhookStatus` (cubre los valores de
   Mercado Pago, Stripe, PayPal, EBANX, MODO y Payway).
4. Actualiza/crea el `Payment` y, si `approved`, emite `payment.approved`.

Otros endpoints de gestión: `GET /payments` (filtro status/provider), `GET
/payments/summary` (conciliación), `GET /payments/:id`, `POST
/payments/:id/mark-paid` (contra entrega), `POST /payments/:id/refund`,
`DELETE /payments/:id` (solo pending), `POST /payments/cancel-pending`, `POST
/payments/auto-cancel` (umbral `payments.pendingExpiryMinutes`, default 60 min).

## Tabla de contratos

| Método | Ruta | Contrato |
|--------|------|----------|
| GET | `/api/v1/payments/providers` | `{ providers: [{ id, displayName }] }`. |
| POST | `/api/v1/payments/checkout` | Body `{ provider, amount, currency, description?, externalReference?, idempotencyKey?, items[], metadata{ kind, ... } }` → `201 { id, transactionId, status, paymentUrl?, qr? }`. |
| POST | `/api/v1/payments/pos` | Body `{ amount, currency, method: cash\|terminal, ... }` → `201 { id, transactionId, status }`. |
| POST | `/api/v1/payments/webhook/:provider` | Body de la pasarela + firma → `{ ok, id, status }` (idempotente). |
| POST | `/api/v1/payments/:id/mark-paid` | Confirma cobro en efectivo/contra entrega (`pending → approved`). |
| POST | `/api/v1/payments/:id/refund` | Reembolso (`approved → refunded`) + evento `payment.refunded`. |

## `metadata.kind` y efecto posterior

El `metadata.kind` es el pegamento que define qué se cumple al aprobarse:

| `kind` | Productor | Consumidor (`payment.approved`) | Efecto |
|--------|-----------|---------------------------------|--------|
| `store` | checkout tienda | (opcional) | Confirmar orden de tienda. |
| `subscription` | `suscripciones` | `suscripciones` | Activar `Membership` (`metadata.membershipId`). |
| `pos` | `pos` | `pos` | Confirmar `Order` + descontar stock (`metadata.orderId`). |

## Enlaces

- [ADR-0015 — Checkout unificado](../adr/0015-checkout-unificado.md)
- [Comprobantes y facturas](comprobantes-facturas.md)
- [Facturación electrónica ARCA](facturacion-electronica.md)
- Código: `apps/api/src/modules/payments/{service,routes,registry}.ts`,
  `apps/api/src/plugins/payments.ts`, `apps/api/src/plugins/events.ts`,
  `plugins/{pos,suscripciones}/src/server.ts`.
