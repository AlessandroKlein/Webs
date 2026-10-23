# ADR-0015: Checkout unificado (tienda + suscripciones + cobro físico)

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 4)
- **Decisión:** Unificar el checkout en **una página y un contrato de pago** orquestados por el núcleo de pagos (`POST /api/v1/payments/checkout`), con métodos de pago extensibles vía el registro de proveedores (`fastify.payments.register`) y el cobro físico en sucursal (POS/caja) como un proveedor más. La tienda (`ecommerce`/`carrito`), las suscripciones (`suscripciones`) y la venta en caja (`pos`) comparten el mismo flujo de creación de pago, webhook y conciliación.

## Contexto

Hoy existen tres flujos de cobro separados y parcialmente conectados:

1. **Tienda / ecommerce** (`plugins/ecommerce`, `plugins/carrito`): carrito y catálogo, sin checkout unificado.
2. **Suscripciones** (`plugins/suscripciones/src/server.ts`): usa `MembershipPlan` + `Membership`; el `POST /subscribe` tiene un `TODO` explícito — cuando `config.requirePayment` es `true`, el cobro **no está integrado** (se crea la suscripción activa y se avisa al frontend). El TODO describe exactamente el flujo deseado (`POST /payments/checkout` → `Membership` pending → webhook `payment.approved` → activar).
3. **Cobro físico / POS** (`plugins/pos/src/server.ts`): `POST /checkout` crea directamente `Order` (status `paid`) + `Payment` (`provider: 'pos'`, status `approved`) y descuenta stock, **sin pasar** por el núcleo de pagos; `POST /payments/:id/mark-paid` se usa para contra entrega.

El núcleo de pagos ya provee la infraestructura correcta:

- Registro de proveedores `fastify.payments.register({ id, displayName, createTransaction, verifyWebhook })` (`apps/api/src/plugins/payments.ts` → `apps/api/src/modules/payments/registry.ts`).
- `POST /api/v1/payments/checkout` (`apps/api/src/modules/payments/routes.ts:101-153`): valida body, resuelve provider, llama `createTransaction`, crea `Payment` (`status: 'pending'`) y devuelve `{ id, transactionId, status, paymentUrl, qr }`.
- `POST /api/v1/payments/webhook/:provider` (`:159-218`): valida firma, actualiza `status`, emite `payment.approved`.
- Proveedores actuales: `mercadopago`, `stripe`, `paypal`, `ebanx`, `payway`, `pos`, `mercadolibre`.

## Decisión

### 1. Una página de checkout unificada

- Ruta frontend única `/checkout` (pública, o `/admin/checkout` para cobro en caja) que sirve a **tienda**, **suscripciones** y **cobro físico**, seleccionando el "contexto de pago" (`kind`) y los métodos de pago disponibles.
- El backend no añade un endpoint nuevo: **`POST /api/v1/payments/checkout` es el único contrato de creación de pago**. El `kind` (store | subscription | pos) viaja en `metadata.kind` y define el `externalReference` y el efecto posterior (qué se cumple al aprobarse).

### 2. Métodos de pago extensibles

- El registro `fastify.payments.register` se mantiene como **mecanismo canónico de extensión**. Un nuevo proveedor (gateway o físico) es un plugin que se registra con `createTransaction`/`verifyWebhook`; no toca el núcleo.
- `GET /api/v1/payments/providers` devuelve los proveedores registrados; el frontend filtra por `kind` y por configuración (ej. `pos` solo en sucursal, gateways online en tienda/suscripción).

### 3. Pago físico en sucursal (POS/caja)

- El plugin `pos` **deja de crear `Payment` por su cuenta** y pasa a registrar el proveedor `pos` con dos modos ya existentes: `cash` (contra entrega, `cod_...`, queda `pending` y se aprueba con `POST /payments/:id/mark-paid`) y `terminal` (lector físico, `pos_...`, aprobación por webhook).
- El `POST /checkout` actual de `pos` (crea `Order` + `Payment` + descuenta stock) se reescribe como un **cliente del checkout unificado**: llama `POST /payments/checkout` con `metadata.kind='pos'` y, al recibir `payment.approved`, confirma la `Order` y descuenta stock. Así la venta en caja queda dentro de la misma conciliación y auditoría.

### 4. Suscripciones integradas al cobro

Se cierra el `TODO` de `plugins/suscripciones`:

1. `POST /subscribe` con `requirePayment=true` crea una `Membership` en `status: 'pending'` y llama `POST /payments/checkout` con `metadata.kind='subscription'`, `externalReference='suscripcion-<planId>-<userId>'`.
2. Al recibir `payment.approved`, el suscriptor activa la `Membership` (`status: 'active'`). Un pago `rejected`/`expired` deja la suscripción `cancelled`.

### 5. Contratos de API (para trabajo en paralelo frontend ↔ backend)

| Método | Ruta | Contrato |
|--------|------|----------|
| GET | `/api/v1/payments/providers` | `{ providers: [{ id, displayName }] }` (lista de proveedores registrados) |
| POST | `/api/v1/payments/checkout` | Body `{ provider, amount, currency, description, externalReference, idempotencyKey, items[], metadata{ kind, orderId?, planId?, userId? } }` → `201 { id, transactionId, status, paymentUrl, qr }` |
| POST | `/api/v1/payments/webhook/:provider` | Body del proveedor + firma → `{ ok, id, status }` (idempotente) |
| POST | `/api/v1/payments/:id/mark-paid` | Confirma cobro en efectivo/contra entrega (`pending` → `approved`) |
| POST | `/api/v1/payments/:id/refund` | Reembolso → nota de crédito (ADR-0014) |

- El `externalReference` es el pegamento: `order:<orderId>` (tienda), `suscripcion-<planId>-<userId>` (suscripción), `pos:<orderId>` (caja). El suscriptor de `payment.approved` lo interpreta para cumplir la operación correspondiente.
- La **idempotencia** se garantiza con `idempotencyKey` (ya soportado en `Payment.idempotencyKey` y en el webhook).

## Consecuencias

### Positivas

- Un solo flujo de pago, conciliación y auditoría para tienda, suscripciones y caja; menor superficie de bugs y de UI.
- Métodos de pago extensibles sin tocar el núcleo (el registro ya existe).
- Cierra la deuda técnica explícita del `TODO` de suscripciones y unifica el cobro físico con el checkout online.

### Negativas

- Requiere reescribir el `POST /checkout` de `pos` (hoy crea `Payment` directo) para pasar por el núcleo; cambio con impacto en el flujo de caja existente.
- El efecto posterior ("qué se cumple al aprobarse") depende de la interpretación del `externalReference`/`metadata.kind`, que debe quedar bien documentada y versionada para no romper la conciliación.
- El cobro físico sin conexión (efectivo) sigue requiriendo el paso manual `mark-paid`; no es automático.

## Notas

- Enlaces al estado actual: `apps/api/src/modules/payments/routes.ts:101-153` (checkout), `:159-218` (webhook), `plugins/pos/src/server.ts:111-168` (`POST /checkout` propio), `plugins/suscripciones/src/server.ts:56-101` (TODO de pago en `POST /subscribe`), `apps/api/src/modules/payments/registry.ts` (registro de proveedores).
- Los proveedores actuales (`mercadopago`, `stripe`, `paypal`, `ebanx`, `payway`, `pos`) ya se registran vía `fastify.payments.register`; la decisión no cambia su contrato, solo el flujo de `pos` y la integración de suscripciones.
- El checkout unificado es nativo (sin SaaS de pago): los gateways son plugins MIT/Apache y el cobro físico es local, consistente con `docs/architecture/politica-dependencias.md`.

## Estado de implementación (M4)

Implementado (t73, t75). Diferencias respecto a este ADR:

- **Núcleo de pagos**: `createCheckoutPayment` y `createPosPayment` viven en
  `apps/api/src/modules/payments/service.ts` (antes la creación estaba inline en
  `routes.ts`). `POST /api/v1/payments/pos` es el contrato del cobro físico
  (`posSchema`, `method: cash|terminal`, preHandler `authorize('sales.manage')`),
  en lugar de reusar `POST /payments/checkout` con `kind='pos'`.
- **`metadata.kind` es el pegamento, NO `externalReference`**: el suscriptor de
  `payment.approved` interpreta `metadata` (`membershipId`, `orderId`, `kind`),
  no el `externalReference`. Ver la tabla `metadata.kind` en
  `docs/architecture/pagos-checkout.md`.
- **Suscripciones**: `POST /subscribe` usa `metadata: { kind:'subscription',
  membershipId, planId, userId }` (no `externalReference='suscripcion-…'`); la
  activación se hace por `metadata.membershipId`.
- **POS efectivo**: `createPosPayment` con `method:'cash'` aprueba **de forma
  inmediata** (`status:'approved'` + `paidAt` ahora + emite `payment.approved`),
  en lugar de quedar `pending` y requerir `mark-paid`. El modo `terminal` sí
  queda `pending` hasta el webhook del lector. Por tanto el cobro en efectivo
  **ya es automático** (el ADR lo daba como limitación en §3 y §Negativas).
- **`idempotencyKey`**: el ADR lo cita para idempotencia del checkout; en la
  práctica la conciliación se apoya en `transactionId` (constraint `@unique`) y
  en el webhook idempotente. `idempotencyKey` sigue existiendo en el modelo pero
  no es la clave principal de deduplicación.
- Documentación de referencia: `docs/architecture/pagos-checkout.md`.
