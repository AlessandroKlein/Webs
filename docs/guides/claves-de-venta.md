# Claves de licencia para la venta — flujo emisor → comprador → activación

Esta guía cubre el flujo **operativo** de venta de licencias como producto.
Todo es **local/offline**: no hay servidor de licencias ni pasarela de pago
(la «venta» es un registro local, no una transacción de cobro). El diseño
completo está en [`docs/architecture/claves-de-venta.md`](../architecture/claves-de-venta.md)
y la base criptográfica en [`docs/architecture/licensing-integration.md`](../architecture/licensing-integration.md)
(ADR-0007, `@licensify/core`).

## 1. Piezas y dónde vive cada una

| Pieza | Dónde vive | Nota |
|-------|-----------|------|
| **Clave privada Ed25519** | `LICENSE_PRIVATE_KEY` (solo entorno del **vendedor**). | **Nunca** se embebe en la app del cliente. |
| **Clave pública** | `LICENSE_PUBLIC_KEY` (instancia del **cliente**). | La app solo verifica. |
| **Emisión/firma** | `@licensify/cli issue`, o `POST /license/keys` con la privada. | Requiere la privada. |
| **Registro de ventas/claves** | Tablas `LicenseSale` / `LicenseKey` (API del vendedor). | Solo trazabilidad; **no firma**. |
| **Activación** | `POST /api/v1/license/activate` (instancia del cliente). | Verifica firma + fingerprint + vigencia localmente. |

La separación es clave: **firmar** exige la privada (fuera de la app), mientras
que **gestionar** el historial es una tabla local legible/revocable sin secretos.

## 2. Modelo de datos

- `LicenseSale`: `customerName`, `customerEmail?`, `productId`, `features`,
  `limits?`, `amount?` (centavos, `Int`), `currency` (default `ARS`), `notes?`,
  `soldAt`. Relación `keys[]`.
- `LicenseKey`: `productId`, `licensee`, `features`, `limits?`, `fingerprint?`
  (hash del host destino), `activationKey @unique`, `status`
  (`active | revoked | expired`), `issuedAt`, `expiresAt?`, `revokedAt?`,
  `revokedReason?`, `saleId?`.

> **Desviación de la spec:** `amount` es `Int?` (centavos), no `Decimal`, por
> convención del codebase (`Product.price`, `Invoice.amount`, `Payment.amount`
> son `Int`).

## 3. Flujo de venta (offline)

```
1. Propuesta     POST /license/sales            → registra el LicenseSale (cliente, productId, features, limits, monto).
2. Fingerprint   El cliente envía su GET /api/v1/license/fingerprint por un canal propio.
3. Emisión       POST /license/keys             → firma Ed25519 + cifra por fingerprint (con LICENSE_PRIVATE_KEY),
                                                o registra una clave ya emitida por @licensify/cli.
4. Entrega       La clave se entrega por correo/PDF/manual (fuera de banda).
5. Activación    El cliente pega la clave en POST /api/v1/license/activate { activationKey }.
6. Verificación  GET /api/v1/license            → estado (active/expired/…).
```

La venta y la activación están **desacopladas**: el vendedor puede emitir y
registrar la clave sin que el cliente la active todavía. El estado de la clave
en el vendedor (`active`) refleja «emitida y válida», no «activada» (la
activación solo se conoce en el host del cliente).

## 4. API de gestión (vendedor, solo lectura/revocación — sin firma)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/v1/license/sales` | `license.read` | Listado de ventas (+ sus claves). |
| `POST` | `/api/v1/license/sales` | `license.manage` | Registra un `LicenseSale` (no firma). |
| `GET` | `/api/v1/license/sales/:id` | `license.read` | Detalle de venta + claves. |
| `GET` | `/api/v1/license/keys` | `license.read` | Listado de claves emitidas. |
| `POST` | `/api/v1/license/keys` | `license.manage` | Emite (con `LICENSE_PRIVATE_KEY` + `fingerprint`) o registra una clave ya emitida (`activationKey`). |
| `POST` | `/api/v1/license/keys/validate` | `license.read` | Valida una clave contra la pública (sin activarla). |
| `POST` | `/api/v1/license/keys/:id/revoke` | `license.manage` | Marca `revoked` (+ motivo). |

**Ejemplo — registrar una venta:**

```bash
curl -X POST http://localhost:4000/api/v1/license/sales \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "customerName": "Gimnasio Norte SRL",
    "customerEmail": "admin@gimnasio-norte.ar",
    "productId": "webs",
    "features": ["payments", "inventory", "analytics"],
    "limits": { "users": 100, "locations": 3 },
    "amount": 1500000,
    "currency": "ARS"
  }'
```

**Ejemplo — emitir una clave node-locked** (requiere `LICENSE_PRIVATE_KEY`):

```bash
curl -X POST http://localhost:4000/api/v1/license/keys \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{
    "saleId": "<saleId>",
    "productId": "webs",
    "licensee": "Gimnasio Norte SRL",
    "fingerprint": "<fingerprint del comprador>",
    "features": ["payments", "inventory"],
    "limits": { "users": 100 },
    "expiresAt": "2027-12-31T00:00:00.000Z"
  }'
```

- Sin `LICENSE_PRIVATE_KEY`, `POST /keys` devuelve `400` con la guía (usá
  `@licensify/cli issue` o configurá la privada del vendedor).
- Sin `fingerprint`, no se puede emitir una clave node-locked (se exige).

**Ejemplo — validar sin activar:**

```bash
curl -X POST http://localhost:4000/api/v1/license/keys/validate \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{ "activationKey": "<clave>", "fingerprint": "<fingerprint>" }'
# → { "valid": true, "payload": {…}, "fingerprint": "…", "expiresAt": "…" }
```

## 5. Revocación (local, honesta)

Sin servidor de licencias, la revocación global instantánea es **imposible**.
Se apoya en tres niveles (del más fuerte al más débil):

1. **Re-emisión con `expiresAt` corto** (el mecanismo real): emitir una clave
   nueva con vencimiento próximo; la vieja caduca sola.
2. **Lista de revocación firmada** (opcional): un JSON firmado que lista claves
   revocadas, consumible vía la ruta de actualización (ADR-0010); no bloquea en
   tiempo real pero eleva el coste.
3. **Registro local del vendedor**: `POST /license/keys/:id/revoke` marca
   `status=revoked` (+ `revokedAt`/`revokedReason`) para trazabilidad y para
   **no re-emitir** a ese cliente/host. Es el mínimo honesto.

## 6. Coherencia con «sin modo de pago»

La venta es un **registro local** (`LicenseSale.amount` informativo), no un
cobro. No se integra MercadoPago/Stripe/PayPal para vender licencias; si se
quisiera cobrar, se hace **fuera** de la plataforma (o con un plugin de pago
opcional conectado por el vendedor) y luego se registra la venta aquí.

## Ver también

- [`docs/architecture/claves-de-venta.md`](../architecture/claves-de-venta.md) — spec completa.
- [`docs/architecture/licensing-integration.md`](../architecture/licensing-integration.md) — módulo `license`, feature-gating y anti-reloj.
- [`docs/adr/0007-licensing.md`](../adr/0007-licensing.md) — Licensify (`@licensify/core`).
- [`docs/architecture/politica-dependencias.md`](../architecture/politica-dependencias.md) — «todo nativo, sin modo de pago».
