# Checklist de cumplimiento del checkout

**Última actualización:** [FECHA]

Este checklist ayuda a verificar que el **proceso de pago (checkout)** de la plataforma
**Webs** cumple los requisitos mínimos de **transparencia de precios**, **información de
impuestos**, **resumen del pedido** y **consentimiento** exigidos por la normativa de
defensa del consumidor y de comercio electrónico, así como los requisitos de facturación de
**AFIP/ARCA**.

> ⚠️ **Importante**: es una **guía de referencia** y no reemplaza la revisión por un
> abogado habilitado en **[JURISDICCIÓN]**. Marcar todos los ítems **no garantiza** por sí
> solo el cumplimiento legal.

## 1. Precios claros y transparentes

- [ ] El precio final se muestra de forma **clara y destacada** antes de la confirmación.
- [ ] Se indica la **moneda** (ARS u otra) junto a cada importe.
- [ ] No existen **cargos ocultos**: todo costo (envío, servicio, comisión) se informa
      antes de confirmar.
- [ ] Los **descuentos y promociones** se muestran con su precio anterior y el descuento
      aplicado, sin inducir a error.
- [ ] El precio por **suscripción recurrente** indica claramente el **período** (mensual,
      anual) y el importe de cada renovación.

## 2. Impuestos y cargos

- [ ] Se informa si el precio **incluye o no** impuestos.
- [ ] Cuando corresponde, se discrimina **neto + IVA + total** (alícuotas aplicables).
- [ ] Se informan las **percepciones y retenciones** (IVA, Ingresos Brutos, etc.) antes de
      confirmar.
- [ ] El cálculo de impuestos usa **montos exactos en centavos**, sin redondeos indebidos
      (ver [`09-referencia-tecnica-facturacion.md`](09-referencia-tecnica-facturacion.md)).

## 3. Resumen del pedido

- [ ] Antes de confirmar se muestra un **resumen** con: producto/servicio, cantidad, precio
      unitario, subtotal, impuestos, descuentos y **total final**.
- [ ] El resumen es **editable** antes del pago (el usuario puede volver y corregir datos).
- [ ] El total mostrado en el resumen es **idéntico** al importe que se cobra.
- [ ] Se identifica el **proveedor de pago** (pasarela) que procesará la operación.

## 4. Consentimiento expreso

- [ ] La confirmación del pago es una **acción afirmativa e inequívoca** (botón «Pagar»,
      «Confirmar y pagar») — nunca una casilla premarcada.
- [ ] El usuario **acepta** los Términos del Servicio y los Términos de Pago antes de pagar
      (checkbox o vínculo visible con los textos).
- [ ] Se solicita **consentimiento separado** para la renovación automática, cuando aplique.
- [ ] Queda **registro** del consentimiento (fecha, hora y versión de los términos
      aceptados).

## 5. Medios de pago y seguridad

- [ ] Solo se muestran **medios de pago habilitados** y operativos.
- [ ] Los datos de tarjeta se **tokenizan** en la pasarela; la Plataforma **no recibe ni
      almacena el PAN** (ver [`docs/guides/pagos.md`](../guides/pagos.md)).
- [ ] Cada operación usa una **clave de idempotencia** (`idempotencyKey`) para evitar cobros
      duplicados.
- [ ] La transacción queda **auditada** con `transactionId` único y estado.

## 6. Comprobantes y facturación

- [ ] Se capturan los **datos de facturación** necesarios según el tipo de comprobante:
  - [ ] **Consumidor final / persona humana**: documento (DNI) y nombre.
  - [ ] **Empresa (Factura A)**: CUIT, razón social, condición frente al IVA y domicilio.
- [ ] Se emite el **comprobante fiscal electrónico** correcto (A/B/C/M) con su **CAE**.
- [ ] El comprobante se **envía por correo** y/o queda disponible en la cuenta del usuario.
- [ ] Los reembolsos generan la **nota de crédito** correspondiente.

## 7. Datos personales y privacidad

- [ ] La recolección de datos de facturación se limita a lo **necesario** y se informa en la
      [`03-politica-de-privacidad.md`](03-politica-de-privacidad.md).
- [ ] Los datos fiscales (CUIT, DNI, domicilio) se tratan conforme a la normativa de
      **protección de datos personales** aplicable.
- [ ] El tratamiento de datos de pago cumple los requisitos de **PCI-DSS** (a través de la
      pasarela).

## 8. Post-pago

- [ ] El usuario recibe una **confirmación** del pago (en pantalla y/o por correo).
- [ ] Se ofrece un **canal de soporte** para reclamos, reembolsos y errores de facturación
      ([EMAIL_CONTACTO]).
- [ ] Los **reembolsos** se procesan según lo publicado y generan la nota de crédito
      correspondiente.

## 9. Verificación técnica (equipo de desarrollo)

- [ ] Los montos se validan en el servidor (Zod, enteros positivos) para impedir la
      **manipulación de precios** desde el cliente.
- [ ] Los **webhooks** de las pasarelas validan la firma criptográfica antes de actualizar
      el estado.
- [ ] La numeración de comprobantes es **correlativa por punto de venta**, sin saltos ni
      duplicados.
- [ ] El **CAE/CAEA** se persiste como dato inmutable junto al comprobante.
- [ ] Ver detalle en [`09-referencia-tecnica-facturacion.md`](09-referencia-tecnica-facturacion.md).

---

*Plantilla adaptable. Reemplazar los placeholders y revisar con asesor legal y contable
local antes de su publicación.*
