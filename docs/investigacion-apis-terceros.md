# Integración de APIs y agentes de terceros — Notas de investigación

> Investigación técnica para integrar proveedores **reales** en los bloques de la plataforma **Webs** (backend Node.js/Fastify, frontend React, monorepo pnpm). Foco en el **mercado argentino** (plataforma en español, país de origen Argentina), con alternativas internacionales.
>
> **Patrón de integración ya existente en el backend:** `fastify.payments.register`, `fastify.storage.register`, `fastify.notifications.register`. Cada uno es un *provider registry*: **interfaz común + adaptadores por proveedor + proveedor por defecto "local/mock"**. Este documento sigue ese mismo patrón para envíos, IA, analytics y calendario.
>
> *Nota:* AFIP cambió su nombre a **ARCA** (Agencia de Recaudación y Control Aduanero) en octubre de 2024; los webservices siguen publicados bajo `afip.gob.ar`.

---

## 1. Facturación electrónica (AFIP/ARCA Argentina + LATAM)

### (a) Proveedores recomendados
1. **AFIP/ARCA directo (WSFE v1 / WSMTXCA)** — control total, sin costo de SaaS. Más trabajo: SOAP + firma CMS/PKCS#7.
2. **Facturante** (TSD de Linkside S.A.) — abstrae AFIP, emite comprobantes A/B/C/M/E, webhook de CAE, botones de pago (MercadoPago). Recomendado para arrancar rápido.
3. *(opcional)* otros TSD/agregadores: Vunabo, Facturica, Tango.
4. **Internacional:** SIAT (Bolivia), SUNAT (Perú), SII (Chile), SAT/PAC (México).

### (b) Endpoints + método + auth

#### AFIP/ARCA directo (SOAP/XML)

| Servicio | Endpoint producción | Endpoint homologación | Auth |
|---|---|---|---|
| **WSAA** (autenticación) | `https://wsaa.afip.gob.ar/ws/services/LoginCms` | `https://wsaahomo.afip.gob.ar/ws/services/LoginCms` | Certificado X.509 AFIP + clave privada; operación `loginCms` |
| **WSFE v1** (emisión) | `https://servicios1.afip.gob.ar/wsfev1/service.asmx` | `https://wswhomo.afip.gob.ar/wsfev1/service.asmx` | TA (`token` + `sign`) en header SOAP |
| **WSCDC** (consulta CAE) | `https://servicios1.afip.gob.ar/wscdcv1/service.asmx` | `https://wswhomo.afip.gob.ar/wscdcv1/service.asmx` | TA en header SOAP |

**Flujo de autenticación (WSAA):** generar un **TRA** (Ticket de Requerimiento de Acceso) XML con fecha/hora, firmarlo con el certificado (formato **CMS/PKCS#7**), enviarlo a `loginCms` → se recibe un **TA** (Token de Acceso) con `token`, `sign` y `expirationTime` (~12 h). El `token`+`sign` se incluyen en cada request de WSFE/WSCDC. El TA se cachea y se renueva antes de vencer.

**Operaciones WSFE v1 clave:** `FECAESolicitar` (autoriza un lote de comprobantes → devuelve CAE), `FEParamGetTiposCbte`, `FEParamGetPtoVenta`, `FEParamGetTiposDoc`, `FEParamGetTiposIva`, `FEParamGetTiposMonedas`, `FEParamGetTiposConcepto`, `FECompUltimoAutorizado`, `FEDummy` (health), `FERecuperaQty`.

**Qué necesito:** CUIT, **certificado digital** (generado en *Administrador de Relaciones de Clave Fiscal → Administrador de certificados digitales*), **clave privada**, **punto de venta** dado de alta, tipo de comprobante habilitado.

#### Facturante (TSD, SOAP)
- **Auth:** objeto `Autenticacion` dentro del request con `Usuario`, `Hash` (password) y `Reseller` (id provisto por Linkside).
- **Operaciones:** `CrearComprobante` (y variantes `SinImpuestos`, `ConPercepciones`, `FULL`, `Remito`), `DetalleComprobante`, `ListadoComprobantes`, `CrearPuntoVenta`, `CalcularPercepciones`; **webhook** asíncrono para recibir el CAE.
- **Entornos:** testing (comprobantes "NO FISCAL") y producción.
- Docs: [Facturante APIDoc](https://www.facturante.com/Developers/APIDoc) · [Autenticación](https://www.facturante.com/Developers/Autenticacion) · [Entornos](https://www.facturante.com/Developers/Entornos).

### (c) Campos clave

**Request WSFE (`FECAESolicitar`):**
```
Auth { Token, Sign, Cuit }
FeCAEReq {
  FeCabReq { CantReg, PtoVta, CbteTipo }        // CbteTipo 1=Factura A, 6=Factura B, 11/12/13=NC/ND A/B
  FeDetReq [{ Concepto, DocTipo, DocNro, CbteDesde, CbteHasta, CbteFch,
              ImpTotal, ImpTotConc, ImpNeto, ImpOpEx, ImpIVA, ImpTrib,
              MonId, MonCotiz, FchServDesde/Hasta,
              Iva: [{ Id, BaseImp, Importe }], Tributos[], Opcionales[] }]
}
```
**Response (`FeCAEResp`):** `FeCabResp { Resultado, FchProceso, Cuit }`, `FeDetResp [{ Resultado, CAE, CAEFchVto, CbteDesde, CbteHasta, Observaciones[] }]`. El **CAE** + vencimiento se imprimen en el comprobante y se consultan luego por **WSCDC** (`ConsultarComprobante`).

### (d) Arquitectura recomendada en Webs
`fastify.billing.register` (o `fastify.invoicing`):
- **Interfaz** `InvoicingProvider { authorize(comprobante) → {cae, caefchvto}; consultarCae(cae); listarPuntosVenta(); tiposComprobante() }`.
- **Adaptadores:** `AfipWsfeProvider` (SOAP directo, firma CMS + cache de TA), `FacturanteProvider` (TSD), `MockInvoicingProvider` (default local, devuelve CAE ficticio).
- **Cross-cutting:** cache de TA/CAE, cola de reintentos para autorización, webhook receptor de CAE (Facturante), guardado del comprobante + PDF en `fastify.storage`.

#### Internacional (resumen)

| País | Proveedor | Endpoint | Auth | Notas |
|---|---|---|---|---|
| Bolivia | **SIAT (SIN)** | SOAP `https://siat.impuestos.gob.bo`; REST nuevo `https://siatrest.impuestos.gob.bo`; prueba `https://pilotosiatservicios.impuestos.gob.bo` | Certificado digital + `cuis` (inicio de sistema) + `cufd` (diario) | Operaciones: `verificarComunicacion`, `sincronizarActividades`, `registroFacturaElectronica`, `anulacionFactura`. Docs [siatinfo.impuestos.gob.bo](https://siatinfo.impuestos.gob.bo) |
| Perú | **SUNAT** | SOAP `https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService` (beta `https://e-beta.sunat.gob.pe/...`) | Certificado + token (clave SOL) | `sendBill`, `sendSummary`, `getStatus`; respuesta **CDR** (Constancia de Recepción). Docs [cpe.sunat.gob.pe](https://cpe.sunat.gob.pe) |
| Chile | **SII** | SOAP DTE, certificación `https://maullin.sii.cl/DTEWS/...`, producción `https://palena.sii.cl/DTEWS/...` | Certificado + token 24 h (`getSeed` → `getToken`) | Envío de DTE firmado + TimbreElectronico. Docs [sii.cl](https://www.sii.cl/factura_electronica) |
| México | **SAT / PAC (CFDI 4.0)** | SOAP del **PAC** (no directo al SAT) | **CSD** (Certificado de Sello Digital) + e.firma | `timbrarCFDI`; respuesta CFDI timbrado (UUID + sello SAT). Docs [sat.gob.mx](https://www.sat.gob.mx) |

---

## 2. Envíos / cotización (Argentina + Courier internacional)

### (a) Proveedores recomendados
1. **Argentina:** Andreani, OCA (e-Pak), Correo Argentino (Paq.ar / API 2.0), y los agregadores multi-courier **Envíopack** y **Pickit** (recomendados si querés cotizar varios couriers con una sola API).
2. **Internacional:** **Shippo** (agregador, recomendado para arrancar), ShipStation, DHL Express, FedEx, UPS.

### (b) Endpoints + método + auth

| Proveedor | Protocolo | Endpoint base | Auth | Cotizar | Tracking |
|---|---|---|---|---|---|
| **Andreani** | REST/JSON | `https://api.andreani.com` | `POST /login` (username/password/clientId) → `Authorization: Bearer <token>` | `POST /v1/cotizacion` | `GET /v1/tracking/{nroAndreani}` |
| **OCA** | SOAP/XML | `https://webservice.oca.com.ar/ePak_tracking/Oep_TrackEPak.asmx` (QA `https://integraciones.ocadev.com.ar/...`) | usuario/contraseña e-Pak + CUIT (con guiones) | `Tarifar_Envio_Corporativo` | `Oep_Track.asmx` (paquetería) |
| **Correo Argentino** | REST/JSON | API Paq.ar v2 (`api.correoargentino.com.ar`, ver manual) | token | cotización | tracking |
| **Envíopack** | REST/JSON | `https://api.enviopack.com` | API key (Bearer) | `POST /cotizaciones` | `GET /seguimiento` |
| **Pickit** | REST/JSON | `https://apis.pickit.com.ar` | API key/token | `POST /api/cotizar` | `GET /api/rastreo` |
| **Shippo** | REST/JSON | `https://api.goshippo.com` | `Authorization: ShippoToken <API_KEY>` | `POST /shipments` | `GET /tracks/{carrier}/{tracking_number}` |
| **DHL Express** | REST/JSON | `https://express.api.dhl.com/mydhlapi` (sandbox `https://api-mock.dhl.com`) | Basic (API key : secret) | `POST /rates` | `GET /track/shipments?trackingNumber=` |
| **FedEx** | REST/JSON | `https://apis.fedex.com` | OAuth2 client_credentials (`/oauth/token`) → Bearer | `POST /rate/v1/rates/quotes` | `POST /track/v1/trackingnumbers` |
| **UPS** | REST/JSON | `https://onlinetools.ups.com` | OAuth2 client_credentials (`/security/v1/oauth/token`) → Bearer | `POST /api/rating/...` | `GET /api/track/v1/details/{nro}` |
| **ShipStation** | REST/JSON | `https://ssapi.shipstation.com` | Basic (API key : secret) | `GET /carriers` / orders | `GET /shipments?trackingNumber=` |

**OCA — crear envío (ejemplo clave):** `IngresoORMultiplesRetiros_v2` con `usr`, `psw`, `XML_Datos` (origen/destinatario/paquetes), `ConfirmarRetiro`. Etiquetas PDF/ZPL: `GetPdfDeEtiquetasPorOrdenOrNumeroEnvio` / `ObtenerEtiquetasZPL`. Anular: `AnularOrdenGenerada`. Docs [OCA e-Pak](https://developers.oca.com.ar/epak.html).

### (c) Campos clave
- **Cotización:** origen/destino (CP o dirección), `peso` (kg), dimensiones `alto/ancho/largo` (cm), `valor declarado`, `operativa`/servicio, cantidad de paquetes. → Response: `precio`, tiempo de entrega, courier/operativa, `id` de cotización.
- **Tracking:** `número de envío` → eventos `{ fecha, estado, detalle, ubicación }`.
- **Crear envío:** datos remitente/destinatario (nombre, dirección, CP, email/tel), paquetes (peso/medidas), operativa, retiro/admisión.

### (d) Arquitectura recomendada en Webs
`fastify.shipping.register`:
- **Interfaz** `ShippingProvider { quote(params) → Quote; createShipment(order) → Shipment; track(id) → TrackingEvent[]; cancel(id) }`.
- **Adaptadores:** `AndreaniProvider`, `OcaProvider`, `CorreoArgentinoProvider`, `EnviopackProvider`, `PickitProvider`, `ShippoProvider`, `DhlProvider`, `FedexProvider`, `UpsProvider`.
- **Default:** `MockShippingProvider` (precios/estados simulados para dev).
- **Normalización:** unificar a modelos `Quote` / `Shipment` / `TrackingEvent` comunes; cada adaptador traduce su JSON/SOAP. Un `quote()` multi-courier puede llamar a varios proveedores en paralelo y devolver comparativo.

Docs: [Andreani Developers](https://developers.andreani.com) · [Correo Argentino API v2 (PDF)](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiPaqAr-v2.pdf) · [Envíopack](https://www.enviopack.com/documentacion) · [Pickit](https://developers.pickit.net) · [Shippo](https://docs.goshippo.com) · [FedEx](https://developer.fedex.com) · [UPS](https://developer.ups.com) · [DHL](https://developer.dhl.com).

---

## 3. Proveedores de IA / chat

### (a) Proveedores recomendados
1. **OpenAI** (Chat Completions), **Anthropic Claude** (Messages), **Google Gemini** (generateContent), **Mistral** (OpenAI-compatible).
2. **Locales / open-source:** **Ollama** y **llama.cpp server** — ambos exponen un endpoint OpenAI-compatible (`/v1/chat/completions`), ideales para dev y para datos sensibles sin salir del servidor.

### (b) Endpoints + método + auth

| Proveedor | Endpoint | Auth |
|---|---|---|
| OpenAI | `POST https://api.openai.com/v1/chat/completions` | `Authorization: Bearer <key>` |
| Anthropic | `POST https://api.anthropic.com/v1/messages` | `x-api-key: <key>` + `anthropic-version: 2023-06-01` |
| Gemini | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` (stream: `:streamGenerateContent`) | `?key=` / `x-goog-api-key` / Bearer |
| Mistral | `POST https://api.mistral.ai/v1/chat/completions` | `Authorization: Bearer <key>` |
| Ollama | `POST http://localhost:11434/api/chat` (o `/api/generate`) | sin auth |
| llama.cpp | `POST http://localhost:8080/v1/chat/completions` | sin auth |

### (c) Campos clave (formato común)
```
{ model, temperature, max_tokens, stream,
  messages: [{ role: "system"|"user"|"assistant", content: "..." }] }
```
- **Streaming:** todos soportan SSE (`stream: true`). OpenAI emite `data: {choices[0].delta.content}`; Anthropic emite eventos `content_block_delta`; Gemini usa `streamGenerateContent`; Mistral es igual a OpenAI.
- **Respuesta no-streaming:** `choices[0].message.content` (OpenAI/Mistral) · `content[0].text` (Anthropic) · `candidates[0].content.parts[0].text` (Gemini) · `message.content` (Ollama).
- **System prompt / historial:** se pasan como mensajes con `role: system` (OpenAI/Mistral/Ollama) o como `system`/`systemInstruction` separado (Anthropic/Gemini).

### (d) Arquitectura recomendada en Webs
`fastify.ai.register` (o `fastify.llm`):
- **Interfaz** `ChatProvider { chat({ messages, options, onToken }) → AsyncIterable|stream }`.
- **Adaptadores:** `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, `MistralProvider`, `OllamaProvider` (local), `MockAiProvider` (default, respuesta fija/echo).
- **Cliente agnóstico:** normalizar mensajes a un formato interno `{ role, content }`; un *mapper* traduce a cada formato de proveedor; unificar el streaming con un callback `onToken(delta)` para servirlo al frontend como SSE. El system prompt y el historial los persiste la app (no el provider). El default local usa Ollama para no consumir créditos en dev.

Docs: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions) · [Anthropic Messages](https://platform.claude.com/docs/en/build-with-claude/working-with-messages) · [Gemini API](https://ai.google.dev/api) · [Mistral](https://docs.mistral.ai/api) · [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md) · [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/examples/server).

---

## 4. Analytics

### (a) Proveedores recomendados
1. **Google Analytics 4 (Measurement Protocol)** — para tracking server-side sin SDK.
2. **Plausible** (liviano, self-host o cloud), **Umami** (self-host simple), **Matomo** (self-host completo + reporting).

### (b) Endpoints + método + auth

| Proveedor | Endpoint | Auth |
|---|---|---|
| GA4 | `POST https://www.google-analytics.com/mp/collect?measurement_id=G-XXXX&api_secret=SECRET` (debug: `/debug/mp/collect`) | `measurement_id` + `api_secret` (sin OAuth) |
| Plausible | `POST https://plausible.io/api/event` | sin auth (identificado por `domain`); para stats: `Authorization: Bearer <token>` |
| Matomo | Tracking: `GET/POST https://<tu-matomo>/matomo.php?idsite=..&rec=1&..` | `token_auth` (reporting API) |
| Umami | `POST https://<tu-umami>/api/send` | reporting: `x-umami-api-key` |

### (c) Campos clave
- **GA4 MP body:** `{ client_id, user_id?, events: [{ name, params: {...} }] }`.
- **Plausible body:** `{ name, url, domain, props?, referrer? }` + headers `User-Agent`, `X-Forwarded-For`.
- **Matomo:** query params `idsite`, `rec=1`, `action_name`, `url`, `_id` (visitor), `e_c`/`e_n` (evento).
- **Umami body:** `{ type: "event", payload: { website, url, name, data } }`.

### (d) Arquitectura recomendada en Webs
`fastify.analytics.register`:
- **Interfaz** `AnalyticsProvider { track(event, props) }` (fire-and-forget).
- **Adaptadores:** `Ga4Provider`, `PlausibleProvider`, `MatomoProvider`, `UmamiProvider`; **default** `NullAnalyticsProvider` (no-op).
- Los eventos se encolan en un buffer/cola (no bloquean el request) y se flushean en batch; se registran eventos de negocio (`order_created`, `quote_requested`, `user_signed_up`).

Docs: [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4) · [Plausible Events API](https://plausible.io/docs/events-api) · [Matomo Tracking API](https://developer.matomo.org/api-reference/tracking-api) · [Umami send](https://docs.umami.is/docs/api-reference/send).

---

## 5. Calendarios

### (a) Proveedores recomendados
1. **Google Calendar** y **Microsoft Graph** (Outlook/365) — los dos grandes OAuth2.
2. **CalDAV** (estándar abierto: Nextcloud, Radicale, iCloud, Fastmail).
3. **Cal.com** para *booking* (slots de disponibilidad y reservas) sin OAuth complejo.

### (b) Endpoints + método + auth

| Proveedor | Endpoint | Auth |
|---|---|---|
| Google Calendar | `GET/POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` (`calendarId` = `primary`) | OAuth2 Bearer; scopes `https://www.googleapis.com/auth/calendar` (rw) / `.readonly` / `calendar.events` |
| Microsoft Graph | `GET/POST https://graph.microsoft.com/v1.0/me/events` | OAuth2 Bearer; scopes `Calendars.Read`, `Calendars.ReadWrite` |
| CalDAV | Descubrir colección vía `PROPFIND` en `.well-known/caldav`; leer con `REPORT calendar-query` / `calendar-multiget`; crear con `PUT` (iCalendar `.ics`) | Basic o Bearer (Nextcloud app-passwords); iCalendar RFC 5545 |
| Cal.com | `POST https://api.cal.com/v2/bookings`, `GET /v2/bookings`, `GET /v2/slots` | `Authorization: Bearer <api_key>` (`CAL-API-KEY`) |

### (c) Campos clave
- **Evento:** `summary` (título), `start`/`end` con `dateTime` + `timeZone`, `attendees[]`, `description`, `location`, `reminders`.
- **Response Google:** `id`, `htmlLink`, `hangoutLink` (Meet), `iCalUID`. **Graph:** `id`, `webLink`, `iCalUId`.

### (d) Arquitectura recomendada en Webs
`fastify.calendar.register`:
- **Interfaz** `CalendarProvider { listEvents({from, to}); createEvent(ev); updateEvent(id, ev); deleteEvent(id); getAvailability() }`.
- **Adaptadores:** `GoogleCalendarProvider`, `MicrosoftGraphProvider`, `CaldavProvider`, `CalComProvider`; **default** `MockCalendarProvider`.
- **Normalización:** `CalendarEvent { id, title, start, end, timezone, attendees, description, location }`. Almacenar tokens OAuth2 por usuario (access + refresh, cifrados) y refrescar automáticamente.

Docs: [Google Calendar API](https://developers.google.com/workspace/calendar/api/reference/rest) · [Microsoft Graph events](https://learn.microsoft.com/graph/api/calendar-list-events) · [CalDAV RFC 4791](https://www.rfc-editor.org/rfc/rfc4791) · [Cal.com API v2](https://cal.com/docs/api-reference/v2).

---

## 6. Login social (OAuth2)

### (a) Proveedores recomendados
1. **Google** y **GitHub** (los más simples y documentados), **Facebook Login**, **Apple Sign In** (obligatorio si hay app iOS con otros logins sociales).

### (b) Endpoints + auth (flujo *authorization code* + PKCE)

| Proveedor | Autorización | Token | Userinfo | Scopes |
|---|---|---|---|---|
| Google | `https://accounts.google.com/o/oauth2/v2/auth` | `https://oauth2.googleapis.com/token` | `https://openidconnect.googleapis.com/v1/userinfo` | `openid email profile` |
| Facebook | `https://www.facebook.com/v21.0/dialog/oauth` | `https://graph.facebook.com/v21.0/oauth/access_token` | `https://graph.facebook.com/me?fields=id,name,email,picture` | `email public_profile` |
| Apple | `https://appleid.apple.com/auth/authorize` | `https://appleid.apple.com/auth/token` | (claims en el `id_token`) | `name email` |
| GitHub | `https://github.com/login/oauth/authorize` | `https://github.com/login/oauth/access_token` | `https://api.github.com/user` + `/user/emails` | `read:user user:email` |

### (c) Campos clave
- **Request:** `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state` (anti-CSRF), `code_challenge` (PKCE).
- **Intercambio:** `code` + `client_secret` (o PKCE) → `access_token` (+ `refresh_token`/`id_token`).
- **Perfil normalizado:** `{ provider, providerId, email, emailVerified, name, avatar }`.
- **Apple:** `client_secret` es un **JWT ES256** firmado con la private key de "Sign in with Apple"; `name` se entrega **solo en el primer login** (vía `form_post`).

### (d) Arquitectura recomendada en Webs
Registry de login social (en el módulo de auth):
- **Interfaz** `SocialAuthProvider { getAuthUrl(state); exchangeCode(code) → tokens; getUser(accessToken) → profile }`.
- **Adaptadores:** `GoogleAuthProvider`, `FacebookAuthProvider`, `AppleAuthProvider`, `GithubAuthProvider`; **default** `MockSocialProvider` (dev).
- **Flujo:** redirigir al proveedor → callback con `code` → intercambiar → `getUser` → mapear/crear el usuario local por `(provider, providerId)` y email verificado.

Docs: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) · [Facebook Login](https://developers.facebook.com/docs/facebook-login) · [Apple Sign In](https://developer.apple.com/sign-in-with-apple) · [GitHub OAuth](https://docs.github.com/apps/oauth-apps/building-oauth-apps).

---

## 7. Notificaciones

### (a) Proveedores recomendados
1. **Twilio** (SMS + WhatsApp), **SendGrid** (email transaccional), **Brevo/Sendinblue** (email + SMS), **FCM/APNs** (push), **OneSignal** (push multi-plataforma).

### (b) Endpoints + método + auth

| Proveedor | Endpoint | Auth |
|---|---|---|
| Twilio | `POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json` | Basic (`AccountSid:AuthToken`) |
| SendGrid | `POST https://api.sendgrid.com/v3/mail/send` | `Authorization: Bearer <API_KEY>` |
| Brevo | Email: `POST https://api.brevo.com/v3/smtp/email` · SMS: `POST https://api.brevo.com/v3/transactionalSMS/sms` | header `api-key` |
| FCM | `POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send` (legacy `https://fcm.googleapis.com/fcm/send`) | OAuth2 Bearer (service account) / legacy `Authorization: key=<server_key>` |
| APNs | HTTP/2 `POST https://api.push.apple.com/3/device/{deviceToken}` | `authorization: bearer <JWT ES256>` (+ `apns-topic`, `apns-push-type`) |
| OneSignal | `POST https://onesignal.com/api/v1/notifications` | `Authorization: Basic <REST_API_KEY>` |

### (c) Campos clave
- **Twilio:** `To`, `From` (número o `whatsapp:+54...`), `Body`/`MediaUrl`. Response: `sid`.
- **SendGrid:** `{ personalizations:[{to}], from, subject, content:[{type, value}] }`.
- **FCM:** `{ message: { token|topic, notification:{title,body}, data:{...} } }`.
- **APNs:** JSON `{ aps: { alert: {title, body}, sound, badge } }`.
- **OneSignal:** `{ app_id, include_player_ids | included_segments, headings, contents, data }`.

### (d) Arquitectura recomendada en Webs
Ya existe `fastify.notifications.register` — reforzar con la misma estructura:
- **Interfaz** `NotificationProvider { sendEmail(); sendSms(); sendWhatsApp(); sendPush() }`.
- **Adaptadores:** `SendGridProvider`, `BrevoProvider`, `TwilioProvider`, `FcmProvider`, `ApnsProvider`, `OneSignalProvider`; **default** `MockNotificationProvider` (loguea en consola).
- **Cross-cutting:** cola de envío (p. ej. BullMQ) con reintentos, plantillas de mensaje con variables, y webhooks de estado (delivered/failed) por proveedor.

Docs: [Twilio Messaging](https://www.twilio.com/docs/messaging/api) · [SendGrid Mail Send](https://docs.sendgrid.com/api-reference/mail-send) · [FCM](https://firebase.google.com/docs/cloud-messaging/send-message) · [APNs](https://developer.apple.com/documentation/usernotifications) · [OneSignal](https://documentation.onesignal.com/reference/create-notification) · [Brevo](https://developers.brevo.com/reference/sendtransacemail).

---

## Resumen del patrón de integración (provider registry)

Todos los bloques comparten la misma receta, consistente con `fastify.payments.register` / `fastify.storage.register` / `fastify.notifications.register`:

```
interfaz.ts        → contrato del dominio (quote, track, chat, authorize, ...)
adapters/          → un archivo por proveedor (traduce JSON/SOAP/OAuth)
registry.ts        → fastify.<dominio>.register(provider, config)
provider default   → "local" o "mock" (dev sin dependencias externas)
```

- **Config por entorno** (`env`): `PROVIDER=afip|facturante|mock`, credenciales por adaptador.
- **Normalización** de request/response a modelos internos del dominio.
- **Secrets** en variables de entorno / gestor de secretos (nunca en código).
- **Retry + timeouts + circuit breaker** para proveedores externos; **webhooks** para eventos asíncronos (CAE de Facturante, estado de envío, entregas de notificación).

> Fuente primaria: documentación oficial de cada proveedor (enlaces en cada sección). Fecha de relevamiento: octubre de 2026.
