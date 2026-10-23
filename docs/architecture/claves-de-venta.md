# Claves de licencia para la venta — generación, validación y revocación local

> **Alcance:** diseñar el flujo de **venta** de licencias como producto, sobre `@licensify/core` ya
> integrado (ADR-0007 y `docs/architecture/licensing-integration.md`). Todo es **local/offline**, sin
> servidor de licencias ni pasarela de pago (coherente con
> `docs/architecture/politica-dependencias.md`): la «venta» es un **registro local**, no una transacción
> de cobro.

## 1. Idea en una frase

El vendedor genera una **clave de activación** firmada (Ed25519) ligada al `fingerprint` del host del
cliente, la registra localmente como «vendida», la entrega por un canal propio (correo, PDF, manual) y
el cliente la pega en `POST /api/v1/license/activate`. Validar y **revocar** claves es un proceso local
que no necesita ningún servidor externo.

## 2. Roles y dónde vive cada pieza

| Pieza | Dónde vive | Nota |
|-------|-----------|------|
| **Clave privada Ed25519** | Solo en el CLI/entorno del vendedor (`@licensify/cli`). | **Nunca** se embebe en la app (ADR-0007). |
| **Clave pública** | `LICENSE_PUBLIC_KEY` en la instancia del cliente. | La app solo verifica. |
| **Emisión/firma** | `@licensify/cli issue` (fuera de la API). | Requiere la privada. |
| **Registro de ventas y claves** | Nueva tabla local en la API del **vendedor** (`LicenseSale`, `LicenseKey`). | Solo seguimiento; no firma. |
| **Activación/verificación** | `apps/api/src/modules/licenses/*` (ya existe). | `fastify.license.activate/verify`. |

La separación es clave: **firmar** exige la privada (fuera de la app), mientras que **gestionar** el
historial de ventas/claves es una tabla local legible/revocable sin secretos.

## 3. Modelo de datos (nuevo, en la instancia del vendedor)

```prisma
model LicenseSale {
  id            String    @id @default(uuid())
  organizationId String   // org del vendedor (scoping multi-tenant)
  customerName  String
  customerEmail String?
  productId     String            // 'webs' o plantilla concreta
  features      Json              // flags firmados (payments, ai, …)
  limits        Json?             // { users: 100, locations: 3 }
  amount        Decimal?          // precio acordado (registro local, no cobro)
  currency      String  @default("ARS")
  notes         String?
  soldAt        DateTime @default(now())
  createdAt     DateTime @default(now())
  keys          LicenseKey[]
  @@map("license_sales")
}

model LicenseKey {
  id            String    @id @default(uuid())
  organizationId String
  saleId        String?
  sale          LicenseSale? @relation(fields: [saleId], references: [id])
  productId     String
  licensee      String
  features      Json
  limits        Json?
  fingerprint   String?           // hash del host destino (node-locking)
  activationKey String    @unique // cadena Crockford/base32 firmada (emitida por CLI)
  status        String    @default("active") // active | revoked | expired
  issuedAt      DateTime  @default(now())
  expiresAt     DateTime?
  revokedAt     DateTime?
  revokedReason String?
  createdAt     DateTime  @default(now())
  @@index([organizationId])
  @@index([productId])
  @@map("license_keys")
}
```

- `activationKey` es la **misma** cadena que el CLI emite y que el cliente pega en activar; se guarda
  solo como referencia de trazabilidad (el vendedor la custodia; en la app del cliente **no** se persiste
  la clave en claro, solo el estado `license.json`).
- `fingerprint` es el hash del host destino (el mismo que `GET /api/v1/license/fingerprint` devuelve).

## 4. Flujo de venta (offline)

```
1. Propuesta          El vendedor registra un LicenseSale (cliente, productId, features, limits, monto).
2. Fingerprint        El cliente envía su fingerprint (GET /api/v1/license/fingerprint) por un canal propio.
3. Emisión (CLI)      licensify issue --private-key priv.pem --payload '{id, productId, licensee,
                      features, limits, issuedAt, expiresAt?}' --fingerprint <fp>
                      → imprime la clave de activación (Crockford/base32).
4. Registro           El vendedor guarda la clave en LicenseKey (status: active, link a la venta).
5. Entrega            La clave se entrega por correo/PDF/manual (fuera de banda).
6. Activación         El cliente pega la clave en POST /api/v1/license/activate { activationKey }.
                      La API valida firma + fingerprint + vigencia localmente (sin red).
7. Verificación       GET /api/v1/license devuelve el estado (active/expired/…).
```

La venta y la activación están **desacopladas**: el vendedor puede emitir y registrar la clave sin que el
cliente la active todavía; el estado de la clave en el vendedor (`active`) refleja «emitida y válida»,
no «activada» (la activación solo se conoce en el host del cliente).

## 5. Validación y revocación

### Validación (previo a entregar / para soporte)

El vendedor puede re-verificar una clave emitida sin instalar la app: `@licensify/cli verify --public-key
pub.pem --activation-key <key>` decodifica/verifica firma + vigencia + fingerprint (cuando la clave está
node-locked). Es la misma lógica de `@licensify/core` que usa la API al activar.

### Revocación (local, honesta)

Como **no hay servidor de licencias** (ADR-0007), la revocación tiene tres niveles, del más fuerte al
más débil:

1. **Re-emisión con `expiresAt` corto** (el mecanismo real): el vendedor emite una clave nueva con
   vencimiento próximo y el cliente re-activa. La clave vieja caduca sola.
2. **Lista de revocación firmada** (opcional, para deployments que se actualizan): un JSON firmado con la
   privada que lista `activationKey.id`/`licenseId` revocados. La app puede consumirlo vía la ruta de
   actualización (ADR-0010) y, en la siguiente verificación periódica, pasar a `invalid`. **No** bloquea
   en tiempo real (offline), pero eleva el coste.
3. **Registro local del vendedor**: marcar `LicenseKey.status = 'revoked'` (+ `revokedAt`,
   `revokedReason`) para trazabilidad y para **no re-emitir** a ese cliente/host. Es el mínimo honesto.

> **Límite honesto (igual que licensing-integration.md):** sin un canal de red, la revocación global
> instantánea es imposible. La protección es en cliente y elevada (firma + node-lock + anti-reloj), no
> inviolable. La revocación se apoya en `expiresAt` corto + lista firmada + registro local.

## 6. API de gestión (vendedor, solo lectura/revocación — sin firma)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/v1/license/sales` | `license.read` | Listado de ventas (paginado, filtro por cliente/producto). |
| `POST` | `/api/v1/license/sales` | `license.manage` | Crea un `LicenseSale` (registro, no firma). |
| `GET` | `/api/v1/license/sales/:id` | `license.read` | Detalle de venta + sus claves. |
| `GET` | `/api/v1/license/keys` | `license.read` | Listado de claves emitidas (status, fingerprint, vencimiento). |
| `POST` | `/api/v1/license/keys` | `license.manage` | Registra una clave **ya emitida** por el CLI (no firma). |
| `POST` | `/api/v1/license/keys/:id/revoke` | `license.manage` | Marca `revoked` (+ motivo). |
| `GET` | `/api/v1/license/fingerprint` | `license.manage` | Fingerprint del host (para emitir contra esta instancia). |

- **No** se expone un endpoint de emisión/firma: firmar exige la privada, que vive en el CLI del vendedor.
- Permisos nuevos: `license.issue`/`license.revoke` son opcionales (pueden mapearse a `license.manage` para
  no inflar el catálogo); se registran en `PERMISSION_CATALOG` (ADR-0018) bajo `area: 'license'`.

## 7. Coherencia con «sin modo de pago»

- La **venta** es un registro local (`LicenseSale` con `amount` informativo), **no** un cobro ni una
  transacción de pasarela. No se integra MercadoPago/Stripe/PayPal para vender licencias.
- Si el vendedor quisiera cobrar, lo haría **fuera** de la plataforma (o con un plugin de pago opcional
  conectado por él, como cualquier comercio — ver política-dependencias.md §4), y luego registraría la
  venta aquí.
- `@licensify/core` sigue siendo la única pieza «de pago», local y autoalojada.

## 8. Relación con otros documentos

- ADR-0007 (Licensify) y `docs/architecture/licensing-integration.md` (módulo `license`, feature-gating,
  anti-reloj, `LicenseState`).
- ADR-0018 (catálogo canónico de permisos) para los permisos `license.*`.
- `docs/architecture/base-universal.md` (producto) y `docs/architecture/politica-dependencias.md`
  (sin SaaS de pago).
