# Plugin ARCA (ex-AFIP)

Facturación electrónica argentina vía ARCA (ex-AFIP). Implementa el flujo
completo **WSAA** (autenticación con certificado X.509 → Ticket de Acceso) y
**WSFE v1** (`FECAESolicitar` → CAE). Corre como *service local* en el proceso
Fastify, activable por organización (multi-tenant).

## Endpoints

- `POST /api/v1/plugins/arca/cae` — solicita CAE/CAEA para un comprobante.
- `GET  /api/v1/plugins/arca/estado` — configuración + credenciales + Ticket de Acceso.

Ambos también responden bajo el shim retrocompatible `/api/v1/blocks/arca/*`.

## Proveedores / modos

| Modo | Condición fiscal | Estado |
|------|------------------|--------|
| WSFE (`FECAESolicitar`) | Responsable inscripto | **Funcional** (requiere certificado X.509 + clave privada + CUIT). En homologación (`wswhomo`) devuelve CAE de prueba; en producción (`servicios1`) CAE real. |
| WSMTXCA (`AutorizarComprobante`) | Monotributo (CAEA) | **Documentado, no integrado**: requiere solicitud previa de rango CAEA (`SolicitarCAEA`). Cae a CAE simulado hasta integrarlo. |
| Sin credenciales | — | CAE **simulado** (`simulated: true`), igual que los adaptadores `afip`/`facturante`/`tsd`. |

## Configuración (por organización)

- `environment` — `homologacion` (default) o `produccion`.
- `cuit` — CUIT del emisor.
- `puntoVenta` — punto de venta (default `1`).
- `condicionFiscal` — `responsable_inscripto` (WSFE) o `monotributo` (WSMTXCA).
- `cert` — certificado X.509 (PEM, clave pública). Nunca se expone al cliente.
- `key` — clave privada (PEM). Nunca se expone al cliente.

> **Seguridad**: `cert`/`key` se marcan con `x-ui.secret`; almacenarlos cifrados en
> reposo (el endpoint `GET /plugins/:id/settings` del core aún no redacta secretos —
> deuda registrada fuera de este plugin).

## Integración con `facturacion`

`issueInvoice('arca', config, invoice)` despacha al adaptador `arca`
(`apps/api/src/integrations/arca.ts`). El plugin `facturacion` expone
`taxProvider: arca` y mapea `arcaCert`→`cert` y `arcaKey`→`key`.

## Nota de implementación

El CMS/PKCS#7 `SignedData` de WSAA se firma con `node:crypto` (`RSA-SHA256`,
PKCS#1 v1.5) + un encoder DER mínimo. Es una implementación de referencia: validar
el DER contra el entorno de homologación de ARCA antes de producción; el camino
recomendado para endurecer es `node-forge` (mismo enfoque que `afip.js`).
