# ADR-0014: Sistema de comprobantes (factura / receipt + impresión térmica)

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 4)
- **Decisión:** Generar automáticamente un comprobante (factura/receipt/nota) por cada pago aprobado, sobre el modelo `Invoice` extendido (`type`, `paymentId`, `orderId`, numeración correlativa por punto de venta y tipo, y `cae`/`caeExpiresAt`). La plantilla es editable por organización en dos formatos (HTML y ESC/POS), con impresión térmica nativa ESC/POS (80 mm / 58 mm) y render PDF desde el HTML.

## Contexto

Hoy el sistema de comprobantes es parcial y está dentro del plugin `facturacion`:

- `plugins/facturacion/src/server.ts` gestiona `Invoice` (`apps/api/prisma/schema.prisma:835-854`): `{ id, organizationId, number @unique, type (default "invoice"), amount, currency, status (draft|issued|paid), customerName, customerTaxId, vatCondition, cae, pdfUrl, paymentId }`.
- La numeración es **simulada**: `buildInvoiceNumber()` genera `F-<timestamp>-<4 dígitos>` (`plugins/facturacion/src/server.ts:11-14`), no una secuencia fiscal correlativa por punto de venta y tipo de comprobante.
- El template es un HTML por defecto (`DEFAULT_INVOICE_TEMPLATE`) con placeholders `{{number}} {{customerName}} {{amount}} {{date}} {{cae}} {{type}} {{currency}}`, configurable por `config.invoiceTemplate` y renderizado en `GET /invoices/:id/html`.
- No existe emisión de **receipt** separado ni impresión térmica ESC/POS; la "impresión" es la del navegador sobre el HTML.
- La creación de comprobantes es manual (`POST /invoices`); **no se emite automáticamente** al aprobarse un `Payment`.

## Decisión

### 1. Generación automática por pago aprobado

Cada `Payment` que pasa a `status: approved` (vía `POST /api/v1/payments/webhook/:provider` o `POST /api/v1/payments/:id/mark-paid`) dispara la creación de un comprobante, enlazado por `paymentId`:

- El núcleo ya emite el evento `payment.approved` (`apps/api/src/modules/payments/routes.ts:210-214`); el plugin `facturacion` (o el núcleo de comprobantes) se suscribe y genera el comprobante de forma **idempotente** (una vez por `paymentId`, clave única compuesta).
- Tipo de comprobante según la operación: venta de tienda → `invoice`, cobro de suscripción → `invoice` (o `receipt` para consumidor final), venta en caja → `receipt`; notas de crédito/débito para reembolsos.

### 2. Modelo de datos (extiende `Invoice`)

Se extiende `Invoice` (sin tabla nueva, reutilizando la existente) con campos para numeración fiscal y trazabilidad:

| Campo | Tipo | Uso |
|-------|------|-----|
| `type` | String | `invoice` \| `receipt` \| `credit_note` \| `debit_note` |
| `paymentId` | String? | FK al `Payment` origen (ya existe) |
| `orderId` | String? | FK a `Order` (venta en caja/tienda) |
| `number` | String @unique | Numeración correlativa compuesta `ptoVta-tipo-número` |
| `ptoVta` | Int | Punto de venta (1–4 dígitos) |
| `cbteTipo` | Int | Código de tipo de comprobante ARCA |
| `cae` | String? | CAE/CAEA (ya existe) |
| `caeExpiresAt` | DateTime? | Vencimiento CAE (10 días) |
| `caePeriodo`/`caeOrden` | String?/Int? | Rango CAEA (monotributo) |
| `template` | String? | Plantilla elegida (o hereda de settings) |

La **numeración correlativa** se genera en una transacción atómica (consulta de último número por `ptoVta + cbteTipo` + incremento) para evitar saltos y duplicados, reemplazando el `F-<timestamp>` simulado cuando hay punto de venta configurado; en modo local/simulado se conserva la numeración de prueba.

### 3. Plantilla editable (HTML + ESC/POS)

- **HTML** (A4/PDF): mantiene el mecanismo actual (`{{placeholders}}`), renderizado server-side en `GET /invoices/:id/html` y exportable a PDF (impresión del navegador o generación headless). Se permite una plantilla por organización (settings del plugin, ya existe `invoiceTemplate`).
- **ESC/POS** (térmica): nueva plantilla en **texto plano** con comandos ESC/POS (inicialización, `ESC @`, `GS !` para tamaño, corte de papel `GS V`, ancho de columna fijo). Dos anchos: **80 mm** (48 columnas) y **58 mm** (32 columnas). Se expone `GET /invoices/:id/escpos?width=80|58` que devuelve el documento listo para enviar a la impresora.

### 4. Impresión térmica ESC/POS

- Formato de salida: bytes/texto ESC/POS, con un **driver de impresora** en el plugin `pos` (o en un módulo `printing`) que soporte las conexiones habituales: USB, red/IP (socket RAW 9100) y, en el futuro, BLE.
- Anchos soportados 80 mm y 58 mm; el layout recorta/ajusta columnas según el ancho elegido.
- La impresión se dispara desde el flujo de caja (`pos`) y desde la UI de comprobantes (botón «Imprimir térmica»).

## Consecuencias

### Positivas

- Comprobante automático por pago, con trazabilidad `Payment ↔ Invoice ↔ Order` (conciliación).
- Numeración fiscal real por punto de venta y tipo de comprobante, lista para CAE/CAEA (ADR-0013).
- Plantilla editable por organización y salida dual (PDF y térmica ESC/POS 80/58 mm), cubriendo mostrador y facturación formal.

### Negativas

- La generación automática introduce acoplamiento entre el núcleo de pagos y el plugin de comprobantes (se mitiga con el evento `payment.approved` y un suscriptor idempotente).
- La numeración correlativa en clúster requiere secuencia atómica (transacción/lock) para no duplicar números.
- ESC/POS depende de hardware de impresión que no se puede probar en CI; el contrato de salida se verifica por unit tests sobre el texto generado.

## Notas

- El `Invoice` actual ya contempla `cae`, `pdfUrl`, `paymentId`, `customerTaxId` y `vatCondition`; la decisión lo extiende, no lo reemplaza.
- La impresión térmica es complementaria al HTML existente; el PDF del navegador sigue siendo la salida por defecto para comprobantes formales A4.
- Enlaces al estado actual: `plugins/facturacion/src/server.ts:11-14` (numeración), `:19-52` (template por defecto), `:136-159` (`GET /invoices/:id/html`); `apps/api/src/modules/payments/routes.ts:210-214` (evento `payment.approved`).

## Estado de implementación (M4)

Implementado (t72) **en el plugin `facturacion`** (el único que gestiona
`Invoice`; el task lo llamaba `plugins/invoices/`). Diferencias respecto al
diseño original:

- **Modelo `Invoice` extendido** (`schema.prisma:835-866`): `neto`/`iva` (Int?),
  `ptoVta` (Int @default 1), `cbteTipo` (Int @default 1), `orderId`/`userId`
  (String?), `caeExpiresAt` (DateTime?), `caePeriodo` (String?), `caeOrden`
  (Int?), `template` (String?) + índices `[ptoVta, cbteTipo]` y `[userId]`.
  Migración `0003_invoice_fiscal`.
- **Numeración correlativa** `nextInvoiceNumber`: formato **`pppp-tt-ssssssss`**
  (ptoVta a 4 + tipo a 2 + secuencia a 8), apoyada en la constraint
  `number @unique` (reintento ante colisión), reemplazando `F-<timestamp>`.
- **Generación automática**: `createInvoiceForPayment` idempotente por
  `paymentId`; crea `type: 'receipt'` + `status: 'paid'` (no `invoice` como
  sugería el ADR). Se conecta vía el bus de eventos en-proceso
  (`apps/api/src/plugins/events.ts` → `events.on('payment.approved', ...)`).
- **ESC/POS**: `plugins/facturacion/src/escpos.ts` (`renderEscPos`, 80 mm = 48
  col / 58 mm = 32 col, comandos `ESC @`/`GS !`/`ESC d`/`GS V`), expuesto en
  `GET /invoices/:id/escpos?width=80|58`. **No** hay driver de impresora física
  (USB/red/BLE): el endpoint devuelve el stream de texto listo para enviar.
- **Plantilla HTML editable**: `invoiceTemplate` (textarea) + `invoiceTemplateConfig`
  (logo/primaryColor/heading/footer/showCae/showCustomer) con `buildTemplate()`.
  `GET /invoices/:id/html?download=1` añade `Content-Disposition: attachment`.
- `POST /invoices` acepta `neto`/`iva`/`ptoVta`/`cbteTipo`/`orderId`/`userId`;
  `GET /invoices` filtra por `status`/`from`/`to`/`userId`.
- Documentación de referencia: `docs/architecture/comprobantes-facturas.md`.
