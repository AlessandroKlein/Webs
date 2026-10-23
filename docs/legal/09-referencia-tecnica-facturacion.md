# Referencia técnica — Datos obligatorios para facturación electrónica (equipo técnico)

**Última actualización:** [FECHA]

> **Audiencia**: este documento está dirigido al **equipo técnico** (backend, frontend/UX
> y datos) de la plataforma **Webs**. Traduce los requisitos legales de
> [`06-facturacion-electronica-afip-arca.md`](06-facturacion-electronica-afip-arca.md) a
> un **mapa de datos** concreto, indicando qué campos existen hoy en el modelo, cuáles hay
> que recolectar en el checkout y cuáles conviene agregar. **No es un documento legal.**

## 1. Propósito

Definir, de forma verificable, los **datos obligatorios** que la Plataforma debe:

1. **Configurar** a nivel del emisor (organización titular).
2. **Recolectar** en el checkout según el tipo de comprobante.
3. **Persistir** de forma inmutable y auditable junto a cada comprobante (CAE/CAEA).

## 2. Estado actual del modelo (snapshot)

Referencia de los modelos relevantes en `apps/api/prisma/schema.prisma` (verificar contra el
esquema vigente; puede existir drift entre variantes `.mysql`/`.sqlite`):

### 2.1. `Organization` (emisor potencial)

Campos actuales: `id`, `name`, `slug`, `plan`, `active`, `shareInventory`, `logoUrl`,
`type`, `parentId`, `chainId`, timestamps.

- **No** existen hoy campos fiscales del emisor (CUIT, condición IVA, domicilio fiscal,
  ingresos brutos, punto de venta). `name` puede usarse como razón social, pero conviene un
  campo explícito.

### 2.2. `User` (receptor persona humana)

Campos actuales: `id`, `email`, `username`, `displayName`, `firstName`, `lastName`,
`birthDate`, `profile` (JSON), timestamps, etc.

- **No** existe un campo dedicado de documento (DNI/CUIT). `profile` (JSON) es el lugar
  natural para persistir datos fiscales del usuario sin migrar el esquema.

### 2.3. `Payment` (transacción)

Campos actuales: `id`, `organizationId`, `provider`, `transactionId` (único), `amount`
(entero, **centavos**), `currency` (`ARS`), `status`, `userId`, `externalReference`,
`idempotencyKey`, `metadata` (JSON), `errorMessage`, `paidAt`, `refundedAt`, timestamps.

### 2.4. `Invoice` (comprobante)

Campos actuales: `id`, `organizationId`, `number` (único), `type` (default `"invoice"`),
`amount`, `currency`, `status`, `customerName`, `customerTaxId`, `vatCondition`, `cae`,
`pdfUrl`, `paymentId`, `createdAt`.

- `Invoice` **ya contempla** la mayoría de los campos fiscales del comprobante:
  `type` (A/B/C/M), `number` (número), `customerTaxId` (CUIT/DNI), `vatCondition`
  (condición IVA), `customerName` (razón social/nombre) y `cae`.

## 3. Mapa de datos AFIP/ARCA → modelo de la plataforma

### 3.1. Emisor (configuración por organización)

| Dato AFIP/ARCA | Campo actual | Estado |
| -------------- | ------------ | ------ |
| CUIT | — (no existe) | 🔴 Agregar (recomendado: `Organization.cuit`). |
| Razón social | `Organization.name` | 🟢 Existe (usar como razón social). |
| Domicilio fiscal/comercial | — (no existe) | 🔴 Agregar (`Organization.fiscalAddress`). |
| Condición frente al IVA | — (no existe) | 🔴 Agregar (`Organization.vatCondition`, enum `responsable_inscripto`/`monotributista`/`exento`/`no_responsable`). |
| Ingresos Brutos + fecha inicio | — (no existe) | 🔴 Agregar (`Organization.grossIncomeTaxId`, `Organization.activityStartDate`). |
| Punto de venta | — (no existe) | 🔴 Agregar (`Organization.pointOfSale`). |
| Tipo de comprobante por defecto | derivable de `vatCondition` | 🟡 Derivar de la condición IVA. |

### 3.2. Receptor (datos del checkout)

| Dato AFIP/ARCA | Campo actual | Estado |
| -------------- | ------------ | ------ |
| CUIT/DNI/CDI/CIE | `Invoice.customerTaxId` | 🟢 Existe. |
| Razón social / nombre | `Invoice.customerName` | 🟢 Existe. |
| Condición frente al IVA | `Invoice.vatCondition` | 🟢 Existe. |
| Domicilio (Factura A) | — (no existe dedicado) | 🔴 Agregar o persistir en `metadata`. |
| Correo de envío del comprobante | `User.email` | 🟢 Existe (vía `Payment.userId` → `User.email`). |

### 3.3. Comprobante (datos persistidos tras la emisión)

| Dato AFIP/ARCA | Campo actual | Estado |
| -------------- | ------------ | ------ |
| Tipo de comprobante (A/B/C/M) | `Invoice.type` | 🟢 Existe (cambiar default a A/B/C/M). |
| Punto de venta | — (no existe) | 🔴 Agregar (`Invoice.pointOfSale`). |
| Número de comprobante | `Invoice.number` | 🟢 Existe. |
| Fecha de emisión | `Invoice.createdAt` | 🟢 Existe (usar fecha de emisión). |
| **CAE** | `Invoice.cae` | 🟢 Existe. |
| Vencimiento del CAE | — (no existe) | 🔴 Agregar (`Invoice.caeExpiresAt`). |
| Neto gravado / IVA / exento / total | solo `Invoice.amount` | 🔴 Agregar discriminación (`metadata` o columnas). |
| PDF del comprobante | `Invoice.pdfUrl` | 🟢 Existe. |
| Vínculo con la transacción | `Invoice.paymentId` | 🟢 Existe. |

## 4. Datos que debe recolectar el checkout

### 4.1. Persona humana / consumidor final (Factura B o C)

- **Documento** (DNI u otro) → `Invoice.customerTaxId`.
- **Nombre y apellido** → `Invoice.customerName`.
- **Correo electrónico** para envío del comprobante → `User.email`.

### 4.2. Empresa / Responsable Inscripto (Factura A)

- **CUIT** → `Invoice.customerTaxId`.
- **Razón social** → `Invoice.customerName`.
- **Condición frente al IVA** → `Invoice.vatCondition`.
- **Domicilio** → persistir en `metadata` o columna dedicada.
- **Correo electrónico** → `User.email`.

> Regla de negocio: si el comprobante es **A**, todos los campos de empresa son
> **obligatorios**; si es **B/C**, se requiere documento y nombre (los demás son opcionales).
> Validar la condición IVA del receptor contra la constancia de inscripción de AFIP/ARCA
> antes de emitir un comprobante A.

## 5. Reglas de persistencia y numeración

1. **Numeración correlativa**: el número de comprobante debe ser **correlativo por punto de
   venta y tipo de comprobante**, sin saltos ni duplicados. Usar una secuencia atómica por
   `(organizationId, pointOfSale, type)`; el campo `Invoice.number` es único hoy, pero debe
   combinarse con `pointOfSale`.
2. **CAE inmutable**: una vez asignado, `Invoice.cae` y su vencimiento **no deben
   modificarse**. Un comprobante con CAE no se reutiliza ni se renumera.
3. **Idempotencia**: la emisión debe ser **idempotente** respecto de `(pointOfSale, type,
   number)` y de `Payment.idempotencyKey`, para evitar solicitar CAE duplicado ante
   reintentos.
4. **Montos exactos**: trabajar siempre en **centavos** (enteros). Al discriminar IVA,
   conservar la precisión exacta y aplicar el redondeo que determine la normativa, sin
   arrastrar errores de punto flotante.
5. **Auditoría**: registrar quién, cuándo y con qué request se generó cada CAE (reutilizar
   el `AuditLog` existente).

## 6. Flujo de emisión (referencia de integración WSFE)

```
checkout → Payment (pending, idempotencyKey)
        → validación de datos del receptor (constancia de inscripción)
        → solicitud de CAE a WSFE (homologación o producción)
        → persistir Invoice {type, pointOfSale, number, cae, caeExpiresAt, importes}
        → Payment → approved, Invoice.status → issued
        → enviar comprobante (pdfUrl) por correo
```

- **Homologación**: `wsaahomo.afip.gov.ar` / `wswhomo.afip.gov.ar` (CUITS y certificados de
  prueba).
- **Producción**: `wsaa.afip.gov.ar` / `servicios1.afip.gov.ar`.
- El **entorno** (homologación/producción) debe ser configurable y nunca hardcodeado.

## 7. Recomendaciones de evolución del esquema

> Estas son **recomendaciones** para una implementación futura; **no** se aplican en este
> documento (que no modifica código).

1. Agregar a `Organization`: `cuit`, `vatCondition`, `fiscalAddress`, `grossIncomeTaxId`,
   `activityStartDate`, `pointOfSale`.
2. Agregar a `Invoice`: `pointOfSale`, `caeExpiresAt`, `netAmount`, `vatAmount`,
   `exemptAmount`, `totalAmount` (o discriminación en `metadata`).
3. Normalizar `Invoice.type` a `A | B | C | M` (más notas de crédito/débito).
4. Persistir los datos fiscales del usuario en `User.profile` (JSON) para no forzar una
   migración de esquema en el corto plazo.

## 8. Verificación

- `grep` en el esquema: confirmar que `Invoice` tiene `number`, `type`, `customerTaxId`,
  `vatCondition`, `cae`, `pdfUrl`, `paymentId` (verificado en `apps/api/prisma/schema.prisma`).
- Revisar `docs/guides/pagos.md` para el flujo de `Payment` (checkout, webhook, idempotencia,
  tokenización PCI-DSS) y `docs/guides/plugin-mercadopago.md` para un ejemplo de pasarela.

---

*Documento de referencia técnica. Los nombres de campos y recomendaciones deben validarse
contra `schema.prisma` y la normativa vigente antes de implementar.*
