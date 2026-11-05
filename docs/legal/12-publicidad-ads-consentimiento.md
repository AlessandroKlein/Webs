# Cumplimiento legal del plugin de publicidad (ads)

> ⚠️ **Importante**: este documento es una **plantilla de referencia** y **no constituye
> asesoramiento legal**. Debe ser revisado y validado por un abogado habilitado en la
> jurisdicción donde opere la empresa titular (`[NOMBRE_EMPRESA]`). Los requisitos de
> publicidad digital, protección de datos y de consumo varían por país y por red
> publicitaria.

Este documento define los **requisitos de cumplimiento legal** del plugin de publicidad
(Milestone 18 — v2.16.0) de la plataforma **Webs**: publicidad de terceros (AdSense /
Ad Manager / scripts genéricos), publicidad propia (self-serve de anunciantes) y
consentimiento publicitario. Complementa y no reemplaza los documentos generales:

- [`03-politica-de-privacidad.md`](03-politica-de-privacidad.md) — Política de Privacidad (GDPR/LGPD).
- [`04-politica-de-cookies.md`](04-politica-de-cookies.md) — Política de Cookies.
- [`07-terminos-suscripcion-pago.md`](07-terminos-suscripcion-pago.md) — Términos de suscripción y pago.

## 1. Cumplimiento de Google AdSense Program Policies y Ad Manager

La integración con **Google AdSense** y **Google Ad Manager** debe respetar las
**Program Policies** de Google. Requisitos mínimos:

| Regla | Aplicación |
| ----- | ---------- |
| **Sin clics incentivados** | No ofrecer recompensas ni pedir a los usuarios que hagan clic en anuncios. No usar lenguaje que incite al clic («haz clic», «apóyanos», «visita»). |
| **Sin clics propios / auto-clic** | El operador y el equipo no pueden hacer clic en sus propios anuncios ni usar bots, scripts o granjas para generar clics o impresiones (tráfico inválido). |
| **Ubicaciones no engañosas** | Los anuncios no pueden superponerse a controles, disfrazarse de contenido/navegación, ni colocarse de forma que induzcan clics accidentales (p. ej. pegados a botones o con contraste intencionalmente confuso). |
| **Contenido restringido** | No mostrar anuncios en páginas con contenido ilegal, para adultos, violento, que incite al odio, o material con derechos de autor sin licencia. |
| **Una cuenta por publisher** | Una única cuenta AdSense por editor/publisher; no crear cuentas duplicadas para evadir políticas. |
| **Política de consentimiento de usuarios de la UE** | Ver §2 (obligatorio para tráfico del EEE/UK/CH). |

> **Ad Manager** añade requisitos de **inventario y compradores**: las líneas de pedido y
> los creativos deben cumplir las mismas políticas de contenido y de tráfico válido, y las
> reglas de protección (bloqueos por categoría/URL) deben configurarse para no mostrar
> anuncios en contenido restringido.

## 2. Requisito de consentimiento de Google (EEE / UK / Suiza)

Para el tráfico del **Espacio Económico Europeo (EEE), Reino Unido (UK) y Suiza (CH)**,
Google exige un **consentimiento de usuario válido** antes de servir anuncios
personalizados. Requisitos:

- **CMP certificado por Google**: usar una **Consent Management Platform (CMP)** que
  integre el **IAB TCF v2.2** (Transparency and Consent Framework), **vigente desde enero
  de 2024** (Google dejó de aceptar versiones anteriores).
- **No personalizar sin consentimiento**: si no hay consentimiento, servir solo
  **anuncios no personalizados** (NPA) o **anuncios limitados** (Limited Ads), nunca
  anuncios basados en perfil del usuario.
- **Respetar las señales de consentimiento**: propagar el **TC String** (cadena de
  consentimiento TCF) y las señales de no-personalización del usuario a las llamadas de
  AdSense/Ad Manager; si el usuario **retira** el consentimiento, dejar de personalizar de
  inmediato.
- **Bloquear scripts hasta consentir** (WB-176): el tag de Google no debe cargarse ni
  escribir/leer cookies publicitarias antes de que el usuario consienta.

## 3. Cookies y tecnologías de seguimiento publicitario

### 3.1 Regímenes aplicables

- **UE/EEE — ePrivacy (Directiva 2002/58/CE, art. 5.3) + GDPR**: el almacenamiento o
  acceso a información en el equipo del usuario (cookies, `localStorage`, píxeles,
  fingerprinting) con fines publicitarios requiere **consentimiento previo e informado**,
  salvo las excepciones estrictamente necesarias del art. 5.3.
- **Argentina — Ley 25.326** (PDP) y normativa complementaria: tratamiento leal y
  transparente de datos personales, finalidad determinada, consentimiento del titular y
  derecho de acceso/rectificación/supresión.
- **Brasil — LGPD (Lei nº 13.709/2018)**: base legal (normalmente consentimiento) para
  cookies de publicidad y perfilado, y derechos de acceso, corrección y oposición.

### 3.2 Exigencias operativas

| Exigencia | Aplicación |
| --------- | ---------- |
| **Consentimiento previo** | Las cookies/scripts de publicidad solo se cargan **después** de consentir (no "implied consent", no casillas premarcadas). |
| **Granularidad** | Permitir aceptar/rechazar por **finalidad** (publicidad personalizada vs medición). |
| **Revocación** | El usuario puede **retirar** el consentimiento en cualquier momento, con un mecanismo accesible. |
| **Registro de consentimiento** | Conservar **evidencia** (qué, cuándo, qué versión del texto) para demostrar cumplimiento. |
| **Minimización** | Usar el mínimo de datos de seguimiento necesario; evitar fingerprinting innecesario. |

## 4. Transparencia y etiquetado de anuncios

- Los anuncios deben **etiquetarse** de forma clara como **«Publicidad»** o **«Anuncio»**,
  de modo que el usuario los distinga del contenido editorial.
- No se debe **confundir** publicidad con contenido: los formatos nativos o "in-content"
  deben **declararse** explícitamente como publicidad (no disfrazarse de artículo,
  recomendación editorial o enlace de navegación).
- Mantener **separación visual** (borde, fondo, rótulo) entre el espacio publicitario y el
  contenido de la plataforma.
- En el panel de administración (`/admin/ads`) debe quedar visible para el operador qué
  slots son publicidad y de qué origen (terceros vs propia).

## 5. Publicidad propia: términos para anunciantes

El módulo **self-serve** (anunciante → campaña → creatividad → slot → targeting →
rotación) requiere términos claros para el anunciante:

- **Facturación y presupuesto**: precio por impresión/clic (CPM/CPC), presupuesto máximo
  de campaña, moneda, impuestos aplicables y medios de pago. Las condiciones de pago se
  rigen por [`07-terminos-suscripcion-pago.md`](07-terminos-suscripcion-pago.md).
- **Moderación de creatividades**: el operador (`[NOMBRE_EMPRESA]`) **revisa y aprueba**
  cada creatividad antes de publicarla, y se reserva el **derecho de rechazo o retiro** de
  cualquier campaña sin previo aviso y sin devolución cuando la creatividad incumpla las
  políticas.
- **Contenido prohibido** en creatividades: contenido **ilegal**, **difamatorio**,
  **engañoso/fraudulento**, que **involucre menores** de forma indebida, que incite al odio
  o la discriminación, productos/servicios regulados sin licencia, o material con derechos
  de autor sin autorización.
- **Responsabilidad del anunciante**: el anunciante garantiza tener los derechos sobre la
  creatividad y responde por su contenido; el operador no es responsable del contenido de
  terceros más allá de la moderación realizada.
- **Transparencia del targeting**: informar al anunciante qué criterios de segmentación se
  aplican y que el operador decide las reglas de rotación y disponibilidad de slots.

## 6. Menores y contenido sensible

- **No dirigir publicidad personalizada a menores** (no perfilar por edad cuando el dato
  sugiera minoría de edad; respetar GDPR art. 8, COPPA y normativa local equivalente).
- **Contenido sensible** (salud, política, religión, orientación sexual, etc.) requiere un
  tratamiento especialmente cuidadoso: no usar categorías especiales de datos para
  segmentar publicidad sin consentimiento explícito adicional.
- **Categorías sensibles en redes publicitarias**: configurar los bloqueos por categoría
  (Ad Manager) para no mostrar anuncios de contenido restringido (apuestas, alcohol,
  contenido para adultos) donde no corresponda legalmente.
- Los slots publicitarios no deben aparecer en páginas o secciones destinadas a menores
  con contenido inapropiado para su edad.

## 7. Aviso legal y contacto

- **Titular / publisher**: `[NOMBRE_EMPRESA]`, `[DOMICILIO]`, `[JURISDICCIÓN]`.
- **Contacto de privacidad / publicidad**: `[EMAIL_CONTACTO]`.
- **Autoridad de control**: `[AUTORIDAD_CONTROL]`.
- **Vigencia**: `[FECHA]`.

---

> Este anexo se integra con la **Política de Privacidad** general
> ([`03-politica-de-privacidad.md`](03-politica-de-privacidad.md)) y la **Política de
> Cookies** ([`04-politica-de-cookies.md`](04-politica-de-cookies.md)). En caso de
> conflicto entre este anexo y los documentos generales, prevalecen los generales salvo
> indicación expresa.
