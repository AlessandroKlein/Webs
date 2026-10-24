# Referencia de la API de inventario (M9 — v2.7.0)

> **Estado:** Implementado (ADR-0023). Módulo `apps/api/src/modules/inventory/`
> (`routes.ts` + `stock.ts`), montado bajo `/api/v1/inventory/*` (prefijo aplicado en `app.ts`).
> Spec del modelo de datos: `docs/architecture/inventory.md`; guía de uso:
> `docs/guides/inventario-completo.md`.

## 1. Convenciones

- **Base**: `/api/v1/inventory/*`.
- **Permisos**: lectura → `inventory.read`; escritura → `inventory.manage`. Toda ruta lleva
  `authenticate` + `requireTenant` (fail-closed, ADR-0006); las de escritura además
  `authorize('inventory.manage')`.
- **Scoping**: cada query se filtra por `organizationId` (vía `resolveScope`). Sin tenant
  resuelto la operación se rechaza (403); nunca se degrada a una query global. Para
  `super_admin` sin organización, el fallback es `DEFAULT_ORG_ID`.
- **Importes**: en **centavos** (`Int`), igual que `Product.price` y `StockLevel.averageCost`.
- **Alias retrocompatible**: `/api/v1/plugins/inventario/*` (plugin legacy) sigue disponible
  durante M9; se retira post-M9.
- **Errores**: `400` (validación), `404` (recurso no encontrado en el scope), `409` (SKU/barcode
  duplicado en la organización).

## 2. Productos

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/inventory/products` | read | Listado scoped. Query opcionales: `categoryId`, `brandId`, `supplierId`, `search` (title, `mode:insensitive`). Incluye `variants`. |
| POST | `/inventory/products` | manage | Crea producto (+ variante implícita + `StockLevel` en el almacén por defecto). |
| GET | `/inventory/products/:id` | read | Detalle (con `variants`); 404 si no está en el scope. |
| PATCH | `/inventory/products/:id` | manage | Actualización parcial (title/description/price/stock/categoryId/brandId/supplierId). |
| DELETE | `/inventory/products/:id` | manage | Elimina (cascada a variantes/stock vía FK). |

**POST /products** — cuerpo:

```jsonc
{
  "title": "Remera oversize",          // obligatorio
  "price": 189900,                     // obligatorio, centavos, >= 0
  "stock": 12,                         // cantidad inicial (crea StockLevel)
  "description": "…",
  "categoryId": "…", "brandId": "…", "supplierId": "…",  // opcionales
  "sku": "REM-OVS-L",                  // opcional; si no, auto `SKU-<productId>`
  "barcode": "7791234567890",          // opcional (EAN/UPC)
  "attributes": { "color": "negro", "size": "L" },
  "minQuantity": 5, "criticalQuantity": 2
}
```

- Crea el producto y una **variante implícita** (unidad almacenable) + su `StockLevel` en el
  almacén `MAIN` (creado si no existe). SKU/barcode duplicados en la organización → `409`.

## 3. Variantes

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/inventory/products/:id/variants` | read | Variantes del producto (orden `name asc`). |
| POST | `/inventory/products/:id/variants` | manage | Crea variante (SKU obligatorio) + `StockLevel` en el almacén por defecto. |
| PATCH | `/inventory/variants/:id` | manage | Actualiza `name`/`sku`/`barcode`/`attributes`/`active`. |
| DELETE | `/inventory/variants/:id` | manage | Elimina variante. |

**POST /products/:id/variants** — cuerpo: `{ "sku": "…" (obligatorio), "name": "…", "barcode": "…",
"attributes": {} }`.

## 4. Catálogo (categorías / marcas / proveedores)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/inventory/categories` | Listar (scoped) / crear (`name` obligatorio, `parentId` opcional, `active`). |
| PATCH/DELETE | `/inventory/categories/:id` | Editar / eliminar. |
| GET/POST | `/inventory/brands` | Listar / crear (`name` obligatorio). |
| PATCH/DELETE | `/inventory/brands/:id` | Editar / eliminar. |
| GET/POST | `/inventory/suppliers` | Listar / crear (`name` obligatorio, `contactName`/`email`/`phone` opcionales). |
| PATCH/DELETE | `/inventory/suppliers/:id` | Editar / eliminar. |

## 5. Almacenes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/inventory/warehouses` | Listar (scoped) / crear (`name` y `code` obligatorios, `address`/`isDefault`/`active` opcionales). |
| PATCH/DELETE | `/inventory/warehouses/:id` | Editar / eliminar. |

- Cada `Warehouse` pertenece a una `Organization` (sucursal dueña). Se crea un `MAIN` por defecto
  cuando una operación lo necesita (p. ej. primera variante/stock).

## 6. Niveles de stock

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventory/stock` | Niveles `StockLevel` (query opcionales `warehouseId`, `productId`). Incluye `product` y `variant` (id/title/sku). |

## 7. Movimientos de stock (ledger inmutable)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/inventory/stock/receive` | Entrada (compra). `delta = +quantity`, recalcula costo promedio (o crea `InventoryLot` en FIFO). |
| POST | `/inventory/stock/issue` | Salida (consumo/venta). `delta = -quantity`, validación no-negativo. |
| POST | `/inventory/stock/adjust` | Ajuste manual: `quantity` (objetivo absoluto) o `delta` (relativo); `reason` obligatorio. |
| POST | `/inventory/stock/transfer` | Transferencia entre almacenes: **dos** movimientos enlazados por `referenceId`. |
| GET | `/inventory/movements` | Ledger (solo lectura). Query: `warehouseId`, `type`, `from`, `to` (rango `createdAt`). `take 500`. |
| GET | `/inventory/movements/:id` | Detalle de un movimiento. |

**Cuerpos de las operaciones de stock** (`type` ∈ `entrada|salida|ajuste|transferencia`):

```jsonc
// receive / issue
{ "warehouseId": "…", "productId": "…", "quantity": 5, "variantId": "…?",
  "reason": "…?", "unitCost": 12000, "fifo": false }      // unitCost solo en receive

// adjust
{ "warehouseId": "…", "productId": "…", "variantId": "…?",
  "reason": "recuento físico", "quantity": 42 }            // o "delta": -3

// transfer
{ "fromWarehouseId": "…", "toWarehouseId": "…", "productId": "…",
  "variantId": "…?", "quantity": 5, "reason": "…?" }
```

- `recordMovement` (núcleo transaccional): valida no-negativo → escribe `StockMovement`
  (`quantityBefore`/`quantityAfter`) → actualiza `StockLevel.quantity`/`averageCost` → re-sincroniza
  el agregado `Product.stock = Σ StockLevel`. Todo en una transacción Prisma.
- **Valoración** (costo promedio ponderado): en cada entrada con `unitCost`,
  `averageCost = (qtyAnt × costAnt + qtyEnt × costEnt) / (qtyAnt + qtyEnt)`. Con `fifo:true`, las
  entradas crean capas `InventoryLot` y las salidas consumen de la más antigua.
- El ledger es **inmutable**: no hay update/delete; una corrección es un movimiento opuesto.

## 8. Alertas de stock bajo

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventory/alerts` | Ítems con `quantity <= criticalQuantity` (`level:'critico'`) o `<= minQuantity` (`level:'bajo'`). |

- Respuesta por ítem: `id, productId, variantId, warehouseId, quantity, minQuantity,
  criticalQuantity, level` (enriquecida con `product`/`variant`/`warehouse`).

## 9. Reportes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/inventory/reports/stock-levels` | Niveles por almacén (query `warehouseId`), enriquecidos. |
| GET | `/inventory/reports/movements` | Movimientos por rango (query `from`/`to`), `take 1000`. |
| GET | `/inventory/reports/valuation` | Valoración: `{ lines: [{ productId, title, warehouseId, quantity, averageCost, value }], totalValue, totalQuantity }`. |

- `value = quantity × averageCost` (centavos). `totalValue`/`totalQuantity` agregan todas las líneas
  con `quantity > 0`.

## 10. CSV (export / import)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/inventory/export.csv` | read | Exporta CSV. Query `type=movements` (movimientos) o por defecto `stock` (niveles). `Content-Disposition: attachment`. |
| POST | `/inventory/import` | manage | Importa entradas desde CSV. Cuerpo `{ "csv": "sku,warehouse,quantity,unitCost\n…", "fifo": false }`. |

**Formato CSV de stock** (export/import): columnas `sku, warehouse, quantity, unitCost`. Cada fila
valida que el `sku` y el `warehouse` (por `code`) existan en la organización y que `quantity > 0`;
las filas válidas generan un movimiento de `entrada` con `referenceType:'compra'`. La respuesta
reporta `{ imported, skus, errors: [{ row, error }] }` (por fila, sin corromper datos).

## 11. Scoping multi-tenant (fail-closed)

- Todas las rutas resuelven el scope con `resolveScope(fastify, request.tenant)`; el `organizationId`
  proviene del claim `orgId` del JWT o del header `X-Org-Id` (ADR-0006). Sin tenant → 403.
- Un `Warehouse` solo se opera desde su organización dueña. La vista **consolidada** de la cadena
  (agregación por `chainId`) es de solo lectura para `super_admin`/admin de cadena.
