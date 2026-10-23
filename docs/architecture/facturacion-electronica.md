# Facturación electrónica (plugin ARCA / ex-AFIP)

> **Estado:** implementado (M4). Esta página describe la integración real del
> plugin `arca` con ARCA (ex-AFIP) para facturación electrónica argentina, y
> cómo se conecta con el sistema de comprobantes (`facturacion`). El diseño se
> decide en [ADR-0013](../adr/0013-arca-facturacion.md); los requisitos legales
> están en `docs/legal/06-facturacion-electronica-afip-arca.md` y
> `docs/legal/09-referencia-tecnica-facturacion.md`.

## Visión general

ARCA (ex-AFIP) exige facturación electrónica mediante servicios web. Webs lo
resuelve con un **cliente fiscal embebido en el proceso Fastify** (service
local, no microservicio), dividido en dos piezas:

| Pieza | Ubicación | Responsabilidad |
|-------|-----------|-----------------|
| Cliente core ARCA | `apps/api/src/integrations/arca.ts` | WSAA (X.509 → Ticket de Acceso), WSFE (`FECAESolicitar` → CAE), WSMTXCA (CAEA, documentado) y fallback a CAE simulado. |
| Plugin `arca` | `plugins/arca/` | Configuración por organización (certificado/clave/CUIT/punto de venta) y endpoints de operación (`POST /cae`, `GET /estado`). |
| Plugin `facturacion` | `plugins/facturacion/` | Genera el comprobante y delega la emisión fiscal vía `issueInvoice(provider, config, invoice)`. |

El cliente core vive en `apps/api/src/integrations/` (junto a los adaptadores
`afip`/`facturante`/`tsd`) para que `facturacion` y `arca` lo reutilicen sin
acoplar el núcleo a ARCA. Se descartó un microservicio separado: la emisión es
esporádica y de bajo volumen, y un servicio externo añadiría latencia y estado
distribuido sin beneficio.

## Servicios soportados

| Servicio | Régimen | Documento | Resultado | Estado real |
|----------|---------|-----------|-----------|-------------|
| **WSFE v1** (`FECAESolicitar`) | Responsable inscripto | Factura A/B/C, Nota Crédito/Débito | **CAE** (vto. ~10 días) | **Funcional** |
| **WSMTXCA** (`AutorizarComprobante`) | Monotributista | Factura C, Recibo C | **CAEA** (requiere rango previo) | **Documentado, no integrado** |

La selección se decide por `condicionFiscal` (setting del plugin):
`responsable_inscripto` → WSFE; `monotributo` → WSMTXCA. En este último caso,
`issueArca` devuelve un CAE **simulado** hasta integrar la solicitud del rango
CAEA (`SolicitarCAEA`), porque `solicitarCaea` aún no está implementado (ver
[Limitaciones](#limitaciones-estado-real)).

## Flujo de autenticación (WSAA con certificado X.509)

ARCA autentica con el servicio **WSAA**: el emisor firma un `LoginTicketRequest`
con su certificado X.509 y recibe un **Ticket de Acceso (TA)** (`token` + `sign`,
validez ~12 h) que luego viaja en cada llamada a WSFE.

1. `buildLoginTicketRequest(service, ttlHours)` genera el TRA XML.
2. `signLoginTicket(traXml, certPem, keyPem)` firma el TRA como
   **CMS/PKCS#7 SignedData** (RSA-SHA256) usando `node:crypto`
   (`createSign('RSA-SHA256')` + `X509Certificate`), con un encoder DER mínimo
   para `issuer`, `serialNumber`, `contentType`, `messageDigest`, `signingTime`
   y la firma. Devuelve el CMS en Base64.
3. `loginCms(config, service='wsfe')` hace `POST` al endpoint WSAA con el CMS y
   extrae `token`/`sign`/`generationTime`/`expirationTime` del XML de respuesta.

### Endpoints (homologación vs producción)

| Servicio | Homologación | Producción |
|----------|--------------|------------|
| WSAA (`LoginCms`) | `https://wsaa-homo.afip.gob.ar/ws/services/LoginCms` | `https://wsaa.afip.gob.ar/ws/services/LoginCms` |
| WSFE (`service.asmx`) | `https://wswhomo.afip.gob.ar/wsfev1/service.asmx` | `https://servicios1.afip.gob.ar/wsfev1/service.asmx` |

El flag `environment` (`homologacion` | `produccion`) selecciona el par de URLs;
ambos son sobrescribibles con `wsaaUrl`/`serviceUrl` (útil para testing).

## Flujo de emisión (WSFE → CAE)

`issueArca(config, invoice)` orquesta:

1. Si no hay credenciales (`cuit` + `cert` + `key`) → devuelve CAE simulado.
2. `loginCms(...)` → TA; si falla → CAE simulado.
3. `solicitarCae(config, auth, invoice)` → `FECAESolicitar` con `Auth`
   (`Token`/`Sign`/`Cuit`) y `FeCAEReq` (`FeCabReq` con `PtoVta`/`CbteTipo`,
   `FeDetReq` con `DocTipo`/`DocNro`/`CbteFch`/importes e `Iva` opcional).
4. Extrae `CAE` y `CAEFchVto` del XML de respuesta (regex `extractTag`).

`issueArca` devuelve `IssueArcaResult { cae, simulated, provider, caeExpiresAt, raw }`.

Operaciones auxiliares (disponibles, no expuestas aún por el plugin):
`getTiposCbte` (`FEParamGetTiposCbte`), `getPtosVenta`
(`FEParamGetPtosVenta`), `getUltimoAutorizado` (`FECompUltimoAutorizado`).

## Configuración (multi-tenant)

El plugin `arca` (`plugins/arca/plugin.json`) declara settings por organización:

| Setting | Tipo | Notas |
|---------|------|-------|
| `environment` | enum `homologacion`\|`produccion` | Selecciona URLs WSAA/WSFE. |
| `cuit` | string | CUIT del emisor. |
| `puntoVenta` | string (default `"1"`) | Punto de venta ARCA. |
| `condicionFiscal` | enum `responsable_inscripto`\|`monotributo` | Elige WSFE vs WSMTXCA. |
| `alias` | string | Alias del certificado (informativo). |
| `cert` | string (`x-ui.secret`) | Certificado X.509 (PEM, clave pública). |
| `key` | string (`x-ui.secret`) | Clave privada (PEM). |

El certificado y la clave privada se marcan `"secret": true` (`x-ui.secret`):
se cifran en reposo (mismo mecanismo que `apps/api/src/lib/crypto.ts`, AES-256-GCM)
y **nunca** se exponen al cliente; solo se usan en el servidor para firmar el TRA.

El plugin `facturacion` añade a su propio `plugin.json` el enum
`taxProvider` con el valor `arca` y los campos `arcaCert`/`arcaKey` (secret), de
modo que la emisión fiscal desde un comprobante use el certificado configurado.

## Integración con `facturacion`

`POST /api/v1/plugins/facturacion/invoices/:id/issue` llama a
`issueInvoice(provider, taxConfig, invoice)` de `apps/api/src/integrations/tax.ts`.
Ese despacho ya enruta `provider === 'arca'` a `issueArca` (el mismo switch que
hoy despacha `afip`/`facturante`/`tsd`). Si no hay credenciales o el webservice
falla, devuelve CAE simulado; el comprobante persiste `status: 'issued'` + `cae`.

El plugin `arca` expone además dos endpoints operativos:

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/plugins/arca/cae` | Solicita un CAE/CAEA ante ARCA para un comprobante dado (body con `amount`, `customerName`, `customerTaxId`, `vatCondition`, `type`, `number`, `neto`, `iva[]`). |
| GET | `/api/v1/plugins/arca/estado` | Estado de la integración: `configured`, `environment`, `condicionFiscal`, `cuit`, `puntoVenta` y `ta` (TA vigente si hay credenciales). |

## Seguridad y endurecimiento

- `cert`/`key` cifrados en reposo, resueltos por organización, nunca en texto
  plano en el repo.
- El CAE real solo es verificable contra los entornos de homologación de ARCA;
  el CI no puede probar producción.
- `signLoginTicket` es una **implementación de referencia** del SignedData de
  WSAA (`node:crypto`). Para producción se recomienda validar el DER contra
  homologación real o usar `node-forge` (mismo enfoque que `afip.js`).

## Limitaciones (estado real)

- **WSMTXCA / CAEA no integrado**: `solicitarCaea` devuelve `null`; monotributo
  cae a CAE simulado hasta implementar `SolicitarCAEA` (rango CAEA).
- El adaptador legado `afip` (recibe `token`+`sign` ya firmados) **sigue
  existiendo** junto a `arca`; `arca` no lo reemplaza todavía.
- Las credenciales se resuelven por instalación/plugin (settings), no por una
  tabla de credenciales por organización dedicada; el scoping multi-tenant de
  comprobantes se hace por `organizationId` en el `Invoice`.
- Numeración correlativa y discriminación neto/IVA viven en el comprobante
  (`facturacion`), no en `arca`; ver [Comprobantes y facturas](comprobantes-facturas.md).

## Enlaces

- [ADR-0013 — Plugin ARCA](../adr/0013-arca-facturacion.md)
- [Comprobantes y facturas](comprobantes-facturas.md)
- [Pagos y checkout unificado](pagos-checkout.md)
- Código: `apps/api/src/integrations/arca.ts`, `plugins/arca/src/server.ts`,
  `plugins/arca/plugin.json`, `plugins/facturacion/plugin.json`.
