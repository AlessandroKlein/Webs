# Facturación electrónica en Argentina — Requisitos AFIP/ARCA

**Última actualización:** [FECHA]

> ⚠️ **Importante**: este documento es una **guía de referencia general** y **no
> constituye asesoramiento legal ni contable**. La normativa de facturación electrónica
> cambia con frecuencia (resoluciones generales de **AFIP/ARCA**, regímenes de percepción
> y retención, provinciales de Ingresos Brutos, etc.). Antes de emitir comprobantes, la
> información debe ser validada por un **contador público** y un **abogado** habilitados
> en la República Argentina, y contrastada con la normativa vigente en la fecha de
> implementación.

## 1. Objeto y alcance

Este documento describe los **requisitos de facturación electrónica** aplicables al
operador de la plataforma **Webs** — **[NOMBRE_EMPRESA]**, CUIT **[CUIT]**, con domicilio
fiscal en [DOMICILIO_FISCAL] — cuando éste emita comprobantes por la venta de suscripciones,
servicios y/o productos a través de la Plataforma.

Complementa a [`07-terminos-suscripcion-pago.md`](07-terminos-suscripcion-pago.md) (términos
de suscripción y pago), [`08-checklist-cumplimiento-checkout.md`](08-checklist-cumplimiento-checkout.md)
(checklist del checkout) y [`09-referencia-tecnica-facturacion.md`](09-referencia-tecnica-facturacion.md)
(referencia de datos obligatorios para el equipo técnico).

## 2. Autoridad de aplicación y marco normativo

- **ARCA** (Agencia de Recaudación y Control Aduanero) es la autoridad que reemplazó a la
  ex-AFIP (Administración Federal de Ingresos Públicos) a partir de octubre de 2024. Sus
  resoluciones generales (RG) regulan la emisión de comprobantes electrónicos.
- El régimen principal es el de **emisión de comprobantes electrónicos** (web services de
  facturación electrónica, «WSFE»), junto con regímenes complementarios de percepción y
  retención de IVA y de Ingresos Brutos provinciales.
- Normativa de referencia (verificar siempre la vigencia y consolidado actualizado):
  - **RG 2485/2008** y modificatorias — régimen de factura electrónica y web service de
    facturación electrónica (WSFE).
  - **RG 2904/2010** — Código de Autorización Electrónico Anticipado (CAEA) para
    contingencia/emisores sin conectividad.
  - **RG 4291/2018** y resoluciones posteriores — régimen de emisión de comprobantes,
    libros y registros.
  - **RG 5617/2024** y normas de los años siguientes — incorporación del comprobante
    **«M»** y ajustes de regímenes de facturación.
  - Regímenes provinciales de **Ingresos Brutos** (percepciones y retenciones) de cada
    jurisdicción donde la empresa tenga actividad.

> El listado anterior es **orientativo** y no exhaustivo. La normativa aplicable debe
> confirmarse con asesor profesional a la fecha de implementación.

## 3. Tipos de comprobante (A, B, C y M)

El tipo de comprobante depende de la **condición frente al IVA** del emisor y del receptor.

| Comprobante | Emisor | Receptor | IVA |
| ----------- | ------ | -------- | --- |
| **Factura A** | Responsable Inscripto | Responsable Inscripto | Discriminado (neto + IVA por alícuota). |
| **Factura B** | Responsable Inscripto | Monotributista, Exento o Consumidor Final | Incluido (no se discrimina). |
| **Factura C** | Monotributista o Exento | Cualquier condición | No discrimina IVA (el monotributista no lo traslada). |
| **Factura M** | Responsable Inscripto | Operaciones de exportación de servicios y/o sujetos del exterior | Según normativa vigente; validar el alcance exacto del comprobante «M». |

A los comprobantes principales se suman los **documentos complementarios**:

- **Notas de Crédito** (A/B/C/M): anulan o reducen un comprobante anterior (devoluciones,
  descuentos, errores).
- **Notas de Débito** (A/B/C/M): aumentan el importe de un comprobante anterior.
- **Recibos** (A/B/C) y, en su caso, **facturas de crédito electrónicas MiPyME (FCE)**.

> La elección correcta del tipo de comprobante es responsabilidad del emisor y debe ser
> configurada en el sistema de facturación (ver la referencia técnica, sección de
> «comprobante»).

## 4. CAE y CAEA — validez y uso

### 4.1. CAE (Código de Autorización Electrónico)

- Es el código de **14 dígitos** que **AFIP/ARCA** otorga al aprobar la emisión de un
  comprobante electrónico a través del **web service de facturación electrónica (WSFE)**.
- El **CAE + fecha de vencimiento** identifican de forma única al comprobante; ambos deben
  constar en el documento entregado al receptor.
- **Validez**: el CAE tiene una **vigencia limitada** (habitualmente **10 días corridos**
  desde su otorgamiento). El comprobante debe emitirse (y, según el régimen, entregarse)
  dentro de ese plazo; transcurrido el mismo, el CAE pierde validez y debe solicitarse uno
  nuevo.
- Un comprobante **no puede reutilizar** un CAE ya consumido. Cada solicitud de CAE es
  idempotente respecto del par (punto de venta + tipo + número de comprobante).

### 4.2. CAEA (Código de Autorización Electrónico Anticipado)

- Es un código solicitado **por adelantado** para emitir comprobantes **sin conexión** con
  los servicios de AFIP/ARCA (modo contingencia) o para emisores en zonas sin conectividad
  estable.
- El CAEA se otorga por un **período determinado** (históricamente 15 días, prorrogable) y
  los comprobantes emitidos bajo CAEA deben ser **informados/comunicados** a AFIP/ARCA al
  restablecerse la conexión, dentro de los plazos del régimen.
- El emisor debe llevar un **registro cronológico** de los comprobantes emitidos bajo CAEA.

> La plataforma debe tratar el CAE/CAEA como **dato inmutable y auditable** una vez
> asignado (ver la referencia técnica, sección de persistencia).

## 5. Datos obligatorios del emisor

Todo comprobante electrónico debe identificar al **emisor** con, como mínimo:

| Dato | Descripción / ejemplo | Placeholder de la plataforma |
| ---- | --------------------- | ---------------------------- |
| **CUIT** | Clave Única de Identificación Tributaria (11 dígitos). | `[CUIT]` |
| **Razón social** (o apellido y nombre) | Denominación registrada ante AFIP/ARCA. | `[NOMBRE_EMPRESA]` / `[RAZON_SOCIAL]` |
| **Domicilio comercial/fiscal** | Domicilio declarado. | `[DOMICILIO_FISCAL]` |
| **Condición frente al IVA** | Responsable Inscripto, Monotributista, Exento, No responsable. | `[CONDICION_IVA]` |
| **Ingresos Brutos** | N° de inscripción y jurisdicción (si corresponde) y fecha de inicio de actividades. | `[INGRESOS_BRUTOS]`, `[FECHA_INICIO_ACTIVIDADES]` |
| **Punto de venta** | Código numérico (habitualmente 4 dígitos) habilitado por AFIP/ARCA. | `[PUNTO_DE_VENTA]` |
| **Tipo y número de comprobante** | Tipo (A/B/C/M) + número correlativo (habitualmente 8 dígitos). | — |
| **Fecha de emisión** | Fecha en que se emite el comprobante. | — |

## 6. Datos obligatorios del receptor

Según el tipo de comprobante, el **receptor** debe identificarse con:

| Dato | Comprobante A | Comprobante B/C (consumidor final) |
| ---- | ------------- | ---------------------------------- |
| **CUIT / CUIL / DNI / CDI / CIE** | CUIT (obligatorio). | DNI u otro documento; puede ser «consumidor final» con datos mínimos. |
| **Razón social / apellido y nombre** | Obligatorio. | Obligatorio (o «consumidor final»). |
| **Condición frente al IVA** | Obligatorio. | Obligatorio para determinar el tipo. |
| **Domicilio** | Obligatorio. | Habitualmente no obligatorio (validar régimen). |
| **Correo electrónico** (para envío del comprobante) | Recomendado. | Recomendado. |

> Para **consumidores finales**, AFIP/ARCA permite en muchos casos emitir con la condición
> «consumidor final» y datos reducidos (por ejemplo, DNI + nombre). El checkout debe, como
> mínimo, ofrecer la captura del **documento y nombre** cuando el receptor sea una persona
> humana, y exigir **CUIT + razón social + condición IVA + domicilio** cuando sea una
> empresa (factura A).

## 7. Importes: neto, IVA y total

El comprobante debe discriminar los importes según corresponda:

- **Neto gravado**: base imponible sobre la que se aplica el IVA.
- **IVA discriminado por alícuota**: 21 %, 10,5 %, 27 % u otras según el bien/servicio y
  la jurisdicción.
- **Importes exentos** y **no gravados**.
- **Percepciones y retenciones** (IVA, Ingresos Brutos, SIRCREB, etc.) cuando correspondan.
- **Total**: suma de todos los conceptos.

> La plataforma trabaja con montos **enteros en centavos** (tabla `Payment.amount`). Para
> facturación debe preservarse la **precisión exacta** y calcular el IVA con el redondeo
> que determine la normativa, sin pérdida de centavos.

## 8. Régimen fiscal: Monotributo vs Responsable Inscripto

| Aspecto | Monotributista | Responsable Inscripto |
| ------- | -------------- | --------------------- |
| **Comprobantes** | Emite **Factura C** (no discrimina IVA). | Emite **Factura A** (a RI) o **B** (a monotributo/exento/consumidor final). |
| **IVA** | No traslada IVA en el comprobante. | Traslada y discrimina el IVA. |
| **Obligaciones** | Cuota mensual unificada; facturación simplificada. | Declaraciones juradas mensuales de IVA; registros más amplios. |
| **Ingresos Brutos** | Según categoría y jurisdicción. | Según alícuota y jurisdicción. |
| **Límites** | Sujeto a topes de facturación/categorías vigentes. | Sin tope (sujeto a regímenes de retención/percepción). |

> La condición fiscal del emisor (`[CONDICION_IVA]`) define el **tipo de comprobante por
> defecto** y la forma de calcular los impuestos. Debe configurarse una sola vez y
> validarse al emitir cada comprobante.

## 9. Homologación vs Producción (guía para el equipo técnico)

AFIP/ARCA ofrece dos entornos para los **web services**:

| Entorno | Uso | Autenticación (WSAA) | Facturación (WSFE) |
| ------- | --- | -------------------- | ------------------ |
| **Homologación** | Pruebas y desarrollo. No genera comprobantes reales. | `wsaahomo.afip.gov.ar` | `wswhomo.afip.gov.ar` |
| **Producción** | Emisión de comprobantes reales. | `wsaa.afip.gov.ar` | `servicios1.afip.gov.ar` |

Pasos típicos para pasar de homologación a producción:

1. **Obtener certificado digital** (X.509) de AFIP/ARCA y autorizar el/los **servicios**
   (`wsfe`, `ws_sr_constancia_inscripcion`, etc.) para el CUIT del emisor.
2. **Probar en homologación** con un CUIT y certificado de prueba, verificando tipos de
   comprobante, cálculo de impuestos y persistencia de CAE.
3. **Habilitar producción** y verificar el/los **punto(s) de venta** autorizados.
4. **Ejecutar pruebas controladas en producción** con un comprobante de importe mínimo y
   validar la constancia de inscripción del receptor (web service
   `ws_sr_constancia_inscripcion` / `ws_sr_padron`) antes de emitir.
5. **Conservar** comprobantes, CAE y registros por los plazos legales.

> El entorno de homologación usa **CUITS de prueba** y certificados de prueba; nunca debe
> confundirse con producción. La referencia técnica ([`09-referencia-tecnica-facturacion.md`](09-referencia-tecnica-facturacion.md))
> detalla cómo persistir el CAE y los datos del comprobante en la plataforma.

## 10. Conservación y respaldo

- Los comprobantes electrónicos deben **conservarse** (formato electrónico) por los plazos
  que establezca la normativa vigente (típicamente 5 o 10 años según la obligación).
- Debe mantenerse un **registro de emisión** correlativo por punto de venta, sin saltos ni
  duplicados, y un **registro de CAE/CAEA** asignados.

## 11. Cumplimiento y mantenimiento

Este documento debe revisarse **al menos una vez por año** o ante cada modificación de la
normativa de AFIP/ARCA. Las alícuotas, tipos de comprobante, plazos de CAE y regímenes de
percepción/retención pueden cambiar; la plataforma debe permitir su **configuración sin
recompilar** (ajustes, constantes o parámetros de facturación).

---

*Plantilla adaptable. Reemplazar los placeholders y validar con contador público y abogado
habilitados en la República Argentina antes de su implementación.*
