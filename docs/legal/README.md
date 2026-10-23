# Documentos legales de la plataforma Webs

Este directorio contiene los **templates legales** de la plataforma **Webs**, listos
para adaptar a la empresa, jurisdicción y dominio que despliegue la plataforma.

> ⚠️ **Importante**: estos documentos son **plantillas generales de referencia** y **no
> constituyen asesoramiento legal**. Antes de publicarlos, deben ser revisados y, en su
> caso, validados por un abogado habilitado en la jurisdicción donde opere la empresa.
> Los requisitos de protección de datos y de comercio electrónico varían por país.

## Contenido

| Archivo | Qué es |
| ------- | ------ |
| [`01-terminos-de-servicio.md`](01-terminos-de-servicio.md) | Términos y Condiciones / Términos del Servicio (ToS). |
| [`02-aviso-legal.md`](02-aviso-legal.md) | Descargo de responsabilidad / Aviso legal (Disclaimer). |
| [`03-politica-de-privacidad.md`](03-politica-de-privacidad.md) | Política de Privacidad, alineada con **GDPR** (UE) y **LGPD** (Brasil). |
| [`04-politica-de-cookies.md`](04-politica-de-cookies.md) | Política de Cookies. |
| [`05-cumplimiento-componentes-sin-pago.md`](05-cumplimiento-componentes-sin-pago.md) | **Anexo de cumplimiento**: confirmación de que las dependencias del proyecto son open-source/sin costo, con listado de licencias. |

## Personalización desde la UI (Settings → Legal)

Los cuatro documentos (términos, aviso legal, privacidad y cookies) se pueden editar
**sin tocar estos `.md`** desde el panel de administración:

- **Sección de ajustes `legal`** (`apps/api/src/modules/settings/legal-templates.ts`): un
  textarea por documento (`rows: 28`) cuyo **valor por defecto es el template** de este
  directorio. El admin pega el texto ya personalizado (con los placeholders reemplazados).
- **Publicación automática**: el endpoint público `GET /public/legal/:slug` sirve el texto
  guardado; el frontend lo renderiza como Markdown (`apps/web/src/lib/markdown.ts`
  `renderMarkdown`) en `LegalPage.tsx`, con rutas `/legal/terminos`, `/legal/privacidad`,
  `/legal/cookies` y `/legal/aviso-legal` (enlazadas desde el pie de sitio `SiteFooter`).
- **i18n**: los títulos y textos de la sección usan claves `legal.*` (es/en/pt).

> Flujo recomendado: (1) revisar/adaptar los `.md` de este directorio como borrador;
> (2) copiar el texto final en **Settings → Legal**; (3) el sitio lo publica en
> `/legal/:slug` sin recompilar.

## Cómo personalizar estos documentos

### 1. Reemplazar los placeholders

Todos los documentos usan estos placeholders; sustitúyelos por los datos reales:

| Placeholder | Qué colocar | Ejemplo |
| ----------- | ----------- | ------- |
| `[NOMBRE_EMPRESA]` | Razón social o nombre comercial del titular. | `Acme S.A.` |
| `[JURISDICCIÓN]` | País y/o ciudad cuyas leyes y tribunales aplican. | `República Argentina, Ciudad Autónoma de Buenos Aires` |
| `[EMAIL_CONTACTO]` | Correo de contacto legal/soporte. | `legal@midominio.com` |
| `[URL]` | Dominio principal de la plataforma. | `https://midominio.com` |

Placeholders adicionales opcionales presentes en los documentos:

| Placeholder | Uso |
| ----------- | --- |
| `[FECHA]` | Fecha de entrada en vigor de cada documento. |
| `[REGISTRO_MERCANTIL]` | Datos de inscripción de la empresa (opcional). |
| `[IDENTIFICACION_FISCAL]` | NIF/CUIT/RUT/CNPJ u otro identificador fiscal (opcional). |
| `[DOMICILIO]` | Domicilio legal o fiscal (opcional). |
| `[AUTORIDAD_CONTROL]` | Autoridad de protección de datos competente (opcional). |

### 2. Elegir la jurisdicción

La sección de **ley aplicable y jurisdicción** de cada documento debe reflejar el
domicilio del titular y, cuando corresponda, la ley que proteja al consumidor:

- **Unión Europea / EEE**: aplicar GDPR (Reglamento (UE) 2016/679) y la Directiva de
  comercio electrónico; verificar requisitos de consentimiento y de representante UE.
- **Brasil**: aplicar LGPD (Lei nº 13.709/2018) y el Marco Civil da Internet.
- **Argentina**: Ley 25.326 (Protección de Datos Personales) y Ley 24.240 (Defensa del
  Consumidor).
- **Resto de Latinoamérica / otros**: verificar la normativa local aplicable y los
  requisitos de consentimiento, datos personales y comercio electrónico.

### 3. Revisar los supuestos técnicos

Los documentos describen el comportamiento real de la plataforma **Webs**:

- **Cookies**: la cookie de sesión (`refresh token`, `HttpOnly`/`Secure`/`SameSite=Lax`)
  y las cookies de preferencias `webs-theme` y `webs-locale`. Ver
  [`docs/guides/cookies.md`](../guides/cookies.md).
- **Sin modo de pago obligatorio**: la plataforma puede operar sin pasarela de pago; si
  se habilitan pagos, actualizar las secciones de precios/suscripciones y los anexos de
  pasarelas. Ver [`docs/guides/pagos.md`](../guides/pagos.md).
- **Dependencias open-source**: el anexo
  [`05-cumplimiento-componentes-sin-pago.md`](05-cumplimiento-componentes-sin-pago.md)
  lista las licencias de las dependencias directas.

### 4. Publicación

- Publica cada documento en su ruta dedicada del sitio: `/legal/terminos`,
  `/legal/privacidad`, `/legal/cookies` y `/legal/aviso-legal` (sirve el contenido de
  **Settings → Legal** vía `GET /public/legal/:slug`) y enlázalos desde el pie de página.
- Guarda una **versión con fecha** y conserva un histórico de cambios, ya que estos
  documentos pueden actualizarse.
- En la UE, el **consentimiento de cookies** debe solicitarse antes de instalar cookies
  no esenciales y debe quedar registrado.
