# Comprobantes y facturas (plugin `facturacion`)

> **Estado:** implementado (M4). Sistema de comprobantes con generación
> automática por pago aprobado, numeración correlativa por punto de venta,
> plantilla HTML editable e impresión térmica ESC/POS. El diseño se decide en
> [ADR-0014](../adr/0014-comprobantes.md).

## Visión general

El plugin `facturacion` (`@webs/plugin-facturacion`) es el **único** que gestiona
el modelo `Invoice`. Emite comprobantes de tres formas:

1. **Automática** — cada `payment.approved` genera un comprobante (idempotente
   por `paymentId`), suscribiéndose al bus de eventos en-proceso.
2. **Manual** — `POST /invoices` crea una factura `draft` con datos fiscales.
3. **Fiscal** — `POST /invoices/:id/issue` delega la emisión al proveedor fiscal
   (`arca`/`afip`/`facturante`/`tsd`/`local`) y persiste el CAE.

## Modelo de datos (`Invoice`)

`apps/api/prisma/schema.prisma:835-866`. El modelo se extendió (M4) sin crear
tablas nuevas:

| Campo | Tipo | Uso |
|-------|------|-----|
| `number` | String @unique | Numeración correlativa `pppp-tt-ssssssss`. |
| `type` | String (default `invoice`) | `invoice`\|`receipt`\|`credit_note`\|`debit_note`. |
| `amount` / `neto` / `iva` | Int | Total, neto gravado y discriminación de IVA (centavos). |
| `currency` | String (default `ARS`) | Moneda. |
| `status` | String (default `draft`) | Ciclo de vida `draft → issued → paid`. |
| `customerName` / `customerTaxId` / `vatCondition` | String? | Datos del receptor. |
| `ptoVta` | Int (default 1) | Punto de venta ARCA. |
| `cbteTipo` | Int (default 1) | Código de tipo de comprobante ARCA. |
| `cae` / `caeExpiresAt` | String? / DateTime? | CAE (WSFE) y vencimiento. |
| `caePeriodo` / `caeOrden` | String? / Int? | Rango CAEA (WSMTXCA). |
| `orderId` / `userId` | String? | Vínculo con la orden y el usuario (recibos por usuario). |
| `template` | String? | Plantilla elegida (o hereda de settings). |
| `paymentId` | String? | `Payment` origen (idempotencia). |

Índices añadidos: `[ptoVta, cbteTipo]` (numeración) y `[userId]` (recibos por
usuario).

## Numeración correlativa

`nextInvoiceNumber(db, ptoVta, cbteTipo)` (en `plugins/facturacion/src/server.ts`)
genera el formato **`pppp-tt-ssssssss`** (punto de venta a 4 dígitos, tipo a 2,
secuencia a 8):

1. Busca el último `Invoice` con ese `ptoVta` + `cbteTipo` (`orderBy number desc`).
2. Parsea la secuencia y la incrementa.
3. Reintenta ante colisión: la constraint `number @unique` revienta el duplicado
   y el caller reintenta.

Sustituye al `F-<timestamp>-<4 dígitos>` simulado. En modo local/simulado (sin
punto de venta) se conserva una numeración de prueba.

## Generación automática por pago aprobado

El bus de eventos (`apps/api/src/plugins/events.ts`) expone
`fastify.events.on(event, handler)` y `fastify.events.emit(event, payload)`:

- `emit` conserva el comportamiento previo (automatizaciones de correo vía
  `emitEvent`) y **además** despacha a los suscriptores registrados por plugins.
- Es un **bus en-proceso** (no persiste entre reinicios), adecuado para la
  generación de comprobantes y notificaciones live.

`facturacion` se suscribe a `payment.approved`:

```
events.on('payment.approved', async (payload) => {
  await createInvoiceForPayment(payload.payment.id);
});
```

`createInvoiceForPayment(paymentId)` es **idempotente**: si ya existe un
`Invoice` con ese `paymentId`, retorna sin hacer nada. Crea un comprobante
`type: 'receipt'` + `status: 'paid'` con `amount`/`currency`/`userId`/
`organizationId` del pago.

## Plantilla HTML editable

`GET /invoices/:id/html` devuelve el comprobante renderizado como HTML
(imprimible a PDF desde el navegador). Dos niveles de personalización:

1. **`invoiceTemplate`** (textarea): plantilla HTML libre con placeholders
   `{{number}} {{customerName}} {{customerTaxId}} {{vatCondition}} {{amount}}
   {{neto}} {{iva}} {{date}} {{cae}} {{caeExpiresAt}} {{type}} {{currency}}
   {{ptoVta}} {{cbteTipo}} {{heading}} {{footer}} {{logo}} {{primaryColor}}`.
   Los valores se escapan (`escapeHtml`) para evitar inyección.
2. **`invoiceTemplateConfig`** (objeto): apariencia editable sin tocar HTML —
   `logo` (URL/data-URI), `primaryColor`, `heading`, `footer`, `showCae`,
   `showCustomer`. Si `invoiceTemplate` está vacío, `buildTemplate(cfg)`
   construye una plantilla por defecto con esos parámetros.

`?download=1` añade `Content-Disposition: attachment` para descargar el HTML.

## Impresión térmica ESC/POS

`plugins/facturacion/src/escpos.ts` exporta
`renderEscPos(invoice, width: 80 | 58): string`, que produce un documento de
texto con comandos de control:

| Comando | Bytes | Efecto |
|---------|-------|--------|
| Init | `ESC @` (0x1B 0x40) | Inicializa la impresora. |
| Modo carácter | `GS ! n` (0x1D 0x21 n) | Doble ancho + doble alto (encabezado). |
| Avance | `ESC d n` (0x1B 0x64 n) | Imprime y avanza n líneas. |
| Corte | `GS V n` (0x1D 0x56 n) | Corte parcial (n=1) / total (n=0). |

Anchos: **80 mm = 48 columnas**, **58 mm = 32 columnas**. Los importes se
formatean a 2 decimales y las líneas se recortan/ajustan al ancho.

`GET /invoices/:id/escpos?width=80|58` devuelve el stream listo para enviar a la
impresora (`Content-Type: text/plain`). El envío físico (USB/red socket RAW
9100/BLE) corresponde a un driver de impresora fuera de este módulo (pendiente).

## Endpoints del plugin

Base: `/api/v1/plugins/facturacion`. Todos con `authenticate` + `requireTenant`
(scoping fail-closed por `organizationId`, ADR-0006).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/invoices` | Lista comprobantes (filtros `status`, `from`, `to`, `userId`), `take 200`. |
| GET | `/invoices/:id/html` | Comprobante HTML (`?download=1` para descarga). |
| GET | `/invoices/:id/escpos` | Comprobante térmico ESC/POS (`?width=80|58`). |
| POST | `/invoices` | Crea comprobante `draft` con `customerName`/`customerTaxId`/`vatCondition`/`amount`/`neto`/`iva`/`type`/`ptoVta`/`cbteTipo`/`orderId`/`userId`. |
| PATCH | `/invoices/:id` | Transición de estado `draft → issued → paid` (sin regresión). |
| POST | `/invoices/:id/issue` | Emite fiscalmente (CAE) vía `issueInvoice(provider, config, invoice)`. |
| DELETE | `/invoices/:id` | Elimina un comprobante. |

## Ciclo de vida

```
draft ──(issue)──> issued ──(payment)──> paid
```

- `PATCH` valida `INVOICE_STATUS_ORDER = { draft: 0, issued: 1, paid: 2 }`; no
  permite regresar (`next < current` → error).
- `POST /invoices/:id/issue` persiste `status: 'issued'` + `cae`; devuelve
  `{ ok, cae, provider, simulated, caeExpiresAt, invoice }`.
- Los comprobantes automáticos se crean directamente en `paid`.

## Enlaces

- [ADR-0014 — Sistema de comprobantes](../adr/0014-comprobantes.md)
- [Facturación electrónica ARCA](facturacion-electronica.md)
- [Pagos y checkout unificado](pagos-checkout.md)
- Código: `plugins/facturacion/src/server.ts`, `plugins/facturacion/src/escpos.ts`,
  `apps/api/src/plugins/events.ts`, `apps/api/prisma/schema.prisma:835-866`.
