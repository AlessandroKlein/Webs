# ADR-0013: Plugin ARCA — Facturación electrónica Argentina

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 4)
- **Decisión:** Crear el plugin `arca` como proveedor fiscal dedicado (cliente del Web Service de ARCA/ex-AFIP), con autenticación WSAA mediante certificado X.509 (homologación vs producción), soporte de WSFE (CAE) y WSMTXCA (CAEA), y credenciales por organización. El plugin `facturacion` delega la emisión fiscal a un proveedor fiscal mediante la interfaz ya existente (`issueInvoice(provider, config, invoice)`), sin acoplar el cliente ARCA al núcleo.

## Contexto

Hoy la emisión fiscal está implementada como un *service local* en el núcleo:

- `apps/api/src/integrations/tax.ts` exporta `issueInvoice(provider, config, invoice)` con tres adaptadores SOAP: `afip` (WSFE v1 `FECAESolicitar`), `facturante` (TSD de Linkside) y `tsd` (genérico). Sin credenciales o ante error devuelve un CAE simulado (`crypto.randomUUID()`, `simulated: true`).
- El plugin `plugins/facturacion` (`apps/api/src/modules/plugins` lo carga) expone `POST /invoices/:id/issue`, que llama a `issueInvoice(...)` y persiste `status: 'issued'` + `cae` en el modelo `Invoice`.
- El adaptador `afip` actual tiene limitaciones reales frente a ARCA:
  1. **No firma CMS / no usa WSAA**: asume que `token` (TA) y `sign` ya fueron generados externamente; no implementa el intercambio de certificado X.509 → `LoginTicketRequest` → TA.
  2. **No distingue homologación de producción**: usa una URL de producción fija (`https://servicios1.afip.gob.ar/wsfev1/service.asmx`) y no soporta `wsaa-homo`/`wswhomo`.
  3. **Solo WSFE**: no implementa WSMTXCA (monotributo, CAEA) ni el catálogo de tipos de comprobante/puntos de venta.
  4. **Credenciales globales**: el `config` del plugin se resuelve por instalación, no por organización; en multi-tenant cada sucursal/cadena necesita su propio CUIT, punto de venta y certificado.

## Decisión

### 1. Arquitectura del plugin

Crear el plugin **`arca`** (directorio `plugins/arca`, `@webs/plugin-arca`, `type: "plugin"`) que se registra como **proveedor fiscal** y reemplaza al adaptador `afip` de `apps/api/src/integrations/tax.ts`.

- El plugin `facturacion` **no cambia su contrato**: sigue llamando `issueInvoice(provider, config, invoice)` con `provider = config.taxProvider`.
- `issueInvoice` delega `provider === 'arca'` al cliente del plugin `arca` (la misma función de enrutamiento que hoy despacha `afip`/`facturante`/`tsd`). Alternativa considerada y descartada: exponer un registro de proveedores fiscales análogo a `fastify.payments.register` — se descarta por ahora para no ampliar la superficie de núcleo; el despacho por `provider` string ya cumple la función de extensión.

**Decisión de arquitectura**: *service local dentro del plugin* (no un servicio externo). El plugin corre en el mismo proceso Fastify, accede a `fastify.prisma` y al scope multi-tenant, y versiona/actualiza el cliente ARCA de forma independiente del núcleo. Se rechaza un microservicio separado porque añade latencia y estado distribuido sin beneficio para el caso (la emisión es esporádica y de bajo volumen).

### 2. Servicios ARCA soportados

| Servicio | Régimen | Documento | Resultado |
|----------|---------|-----------|-----------|
| **WSFE v1** (`FECAESolicitar`) | Responsable inscripto | Factura A/B/C, Nota Crédito/Débito | **CAE** (vto. 10 días) |
| **WSMTXCA** (`AutorizarComprobante`) | Monotributista | Factura C, Recibo C | **CAEA** (con rango autorizado) |

La selección de servicio se decide por la **condición fiscal configurada por organización** (`ivaResponsableInscripto` vs `monotributo`). Operaciones de consulta auxiliares (catálogos): `FEParamGetTiposCbte`, `FEParamGetPtosVenta`, `FECompUltimoAutorizado`.

### 3. Autenticación WSAA con certificado X.509

Flujo de autenticación (WSAA):

1. Generar `LoginTicketRequest.xml` (TRA) firmado **CMS/PKCS#7** con el certificado X.509 (clave privada) emitido por ARCA.
2. `POST` a `wsaa.afip.gob.ar/ws/services/LoginCms` (producción) o `wsaa-homo.afip.gob.ar/ws/services/LoginCms` (homologación).
3. Obtener `token` (TA) + `sign` con validez ~12 h; cachearlos y re-emitir antes de vencer.

El certificado, la clave privada y el **alias del certificado** se guardan por organización (nunca en texto plano en el repositorio). El flag `environment: homologacion | produccion` selecciona los endpoints `wsaa-homo`/`wswhomo` o `wsaa`/`servicios1`.

> El adaptador `afip` actual (recibe `token`+`sign` ya firmados) queda como **fallback legado** y se marca `@deprecated` en favor del cliente `arca`, que genera el TA por sí mismo.

### 4. Credenciales por organización (multi-tenant)

- `CUIT`, `punto de venta` (1–4 dígitos), `condición fiscal`, `environment`, `certificado X.509` (+ clave + alias) se resuelven **por organización** (tabla o settings con scope por tenant, patrón fail-closed de ADR-0006), no global.
- En una **cadena** (ADR-0006), la casa matriz puede facturar por sí misma y cada sucursal conserva su propio punto de venta; la vista consolidada de comprobantes se agrega por `chainId`.

### 5. Tipos de comprobante y CAE/CAEA

- El catálogo de tipos de comprobante se obtiene de `FEParamGetTiposCbte` y se persiste como catálogo local (cache), expuesto por el plugin.
- `CAE`/`CAEA` y su vencimiento se persisten en el comprobante (ver ADR-0014): `cae`, `caeExpiresAt` (CAE) o `caePeriodo`/`caeOrden` (CAEA).
- El `simulated: true` se conserva **solo para homologación/local sin certificado**, con trazabilidad clara (`provider`, `simulated`).

## Consecuencias

### Positivas

- Cliente ARCA aislado y versionable (plugin), sin ensuciar el núcleo; activable/desactivable por organización.
- Soporte completo WSFE + WSMTXCA + WSAA con certificado, homologación vs producción.
- Credenciales y CUIT/punto de venta correctamente escopeados por organización en multi-tenant.
- `facturacion` conserva su contrato; no hay breaking change en el flujo de emisión.

### Negativas

- Complejidad de gestionar certificados X.509 y clave privada por organización (requiere UI segura + cifrado en reposo, análogo a `x-ui.secret`).
- El WSAA de ARCA introduce dependencia de red y de reloj (requiere validación de vencimiento del TA y reintentos).
- El camino de emisión real (no simulado) solo es verificable contra los entornos de homologación de ARCA; el CI no puede probar producción.

## Notas

- El plugin `facturacion` ya declara en su `plugin.json` las settings `taxProvider` (`local|afip|facturante|tsd`), `arcaCert`, `fiscalToken`, `fiscalSign`, `fiscalServiceUrl` y dependencia `ecommerce`. El plugin `arca` añade `environment`, `cuit`, `puntoVenta`, `condicionFiscal`, `cert`, `key`, `alias` y reutiliza el mismo mecanismo de settings por organización.
- Enlace al estado actual: `apps/api/src/integrations/tax.ts:73-136` (`issueAfip`), `plugins/facturacion/src/server.ts:197-226` (`POST /invoices/:id/issue`).
- El nombre del proveedor en `issueInvoice` pasa a admitir `arca` además de `afip|facturante|tsd`, manteniendo `afip` como alias legado.

## Estado de implementación (M4)

Implementado (t71). Diferencias respecto al diseño original:

- **WSFE FUNCIONAL** (responsable inscripto → CAE real); **WSMTXCA/CAEA
  documentado pero NO integrado** — `solicitarCaea` devuelve `null`, por lo que
  `monotributo` cae a CAE simulado hasta integrar `SolicitarCAEA`.
- Creado `apps/api/src/integrations/arca.ts` (505 líneas): `signLoginTicket`
  (CMS/PKCS#7 SignedData RSA-SHA256 con `node:crypto` + encoder DER mínimo),
  `loginCms` (WSAA → TA), `solicitarCae` (`FECAESolicitar`), `solicitarCaea`
  (stub), `getTiposCbte`/`getPtosVenta`/`getUltimoAutorizado`, `issueArca`
  (orquestación con fallback a CAE simulado).
- Creado `plugins/arca/` (`@webs/plugin-arca`): `POST /cae` + `GET /estado`;
  settings `environment`/`cuit`/`puntoVenta`/`condicionFiscal`/`alias`/`cert`/
  `key` (`cert`/`key` marcados `x-ui.secret`).
- `plugins/facturacion/plugin.json`: enum `taxProvider` + `arca`, campos
  `arcaCert`/`arcaKey` (secret). `issueInvoice` despacha `provider === 'arca'`
  a `issueArca`.
- **El adaptador `afip` NO se deprecó**: sigue existiendo junto a `arca` (el ADR
  proponía reemplazarlo; se optó por sumarlo sin romper retrocompat).
- Documentación de referencia: `docs/architecture/facturacion-electronica.md`.
