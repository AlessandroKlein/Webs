# Inventario completo (M9 — v2.7.0)

> **Estado:** Implementado (M9 — v2.7.0, tareas `t134` modelo, `t135` operaciones, `t136` UI).
> Este documento describe el **sistema de inventario completo** y su especificación técnica. La
> referencia de la API implementada (endpoints reales) está en `docs/api/inventory.md`; la guía de
> uso, en `docs/guides/inventario-completo.md`.

## 1. Resumen

El inventario actual (`plugins/inventario/src/server.ts`) es un control básico sobre el modelo plano
`InventoryItem`: un solo almacén implícito, sin variantes, sin movimientos, sin valoración. La M9 lo
convierte en un sistema completo: productos con variantes (SKU/EAN-UPC), catálogo
(categorías/marcas/proveedores), multi-almacén por sucursal, niveles de stock con umbrales, ledger
inmutable de movimientos, valoración (costo promedio + FIFO opcional), alertas de stock bajo y
reportes/CSV — todo bajo scoping multi-tenant fail-closed (ADR-0006).

## 2. Estado actual (anclaje)

| Artefacto | Ubicación | Descripción |
|-----------|-----------|-------------|
| Plugin | `plugins/inventario/src/server.ts` (195 líneas) | Rutas `/api/v1/plugins/inventario`: GET/POST/PATCH/DELETE `/inventory`, `/inventory/search`, `/inventory/:id/adjust`, `/inventory/low`. |
| Modelo | `apps/api/prisma/schema.prisma:488-506` `InventoryItem` | `id, organizationId, sku, name, quantity, minQuantity, unitPrice, category?, productId?, barcode?`. |
| Producto | `schema.prisma:194-209` `Product` | `id, organizationId, title, description?, price, stock, category?, imageUrl?, images, sizes, barcode?`. |
| Organización | `schema.prisma:422-443` `Organization` | `type (standalone/chain/branch), parentId, chainId, shareInventory`. |
| Sincronización | `syncProductStock()` en el plugin | Si `shareInventory=true`, `Product.stock = Σ InventoryItem.quantity` por `productId`. |

Rutas actuales del plugin (todas con `authenticate`, las de lectura con `requireTenant`):

- `GET /inventory` — listado scoped (`resolveScope`), filtro opcional por `organizationId` (AND).
- `GET /inventory/search?sku=&barcode=` — búsqueda por SKU/barcode dentro del scope, enriquecida con
  el nombre de la sucursal.
- `POST /inventory` — crea ítem (sku, name, quantity, minQuantity, unitPrice, category,
  organizationId, productId, barcode).
- `PATCH /inventory/:id`, `DELETE /inventory/:id` — edición/borrado + re-sync de `Product.stock`.
- `POST /inventory/:id/adjust` — ajuste por `delta` (validación no-negativo) + `reason`.
- `GET /inventory/low` — ítems con `quantity <= max(minQuantity, lowStockThreshold)` (threshold
  configurable, default 5).

## 3. Modelo de datos objetivo (Prisma)

> Los importes se expresan en **centavos** (`Int`), igual que `Product.price`. Las tablas nuevas son
> scoped por `organizationId` (fail-closed). `@@map` usa snake_case.

### 3.1 Product (extendido)

Se añaden `categoryId`, `brandId`, `supplierId` (FK opcionales). `category String?` queda como texto
libre legado (se migra y elimina después); `sizes Json` y `barcode String?` quedan deprecados (se
trasladan a `Variant`). `stock Int` se mantiene como **agregado denormalizado** para no romper el
ecommerce, mantenido por el servicio de inventario.

### 3.2 Variant

```prisma
model Variant {
  id          String   @id @default(uuid())
  organizationId String
  productId   String
  sku         String
  barcode     String?          // EAN/UPC
  name        String
  attributes  Json     @default("{}")  // { color, size, ... }
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  product     Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([organizationId, sku])
  @@unique([organizationId, barcode])
  @@index([productId])
  @@map("variants")
}
```

- Un producto sin variantes tiene una **variante implícita** (generada al crear el producto) para que
  el stock se contabilice siempre por variante.
- `sku` y `barcode` son **únicos por organización** (no globales), evitando colisiones entre tenants.

### 3.3 Category / Brand / Supplier

```prisma
model Category {
  id             String     @id @default(uuid())
  organizationId String
  parentId       String?
  name           String
  active         Boolean    @default(true)
  parent         Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: SetNull)
  children       Category[] @relation("CategoryTree")
  createdAt      DateTime   @default(now())

  @@index([organizationId])
  @@index([parentId])
  @@map("inventory_categories")
}

model Brand {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  @@index([organizationId])
  @@map("inventory_brands")
}

model Supplier {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  contactName    String?
  email          String?
  phone          String?
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  @@index([organizationId])
  @@map("inventory_suppliers")
}
```

### 3.4 Warehouse

```prisma
model Warehouse {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  code           String
  address        String?
  isDefault      Boolean  @default(false)
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("inventory_warehouses")
}
```

- Cada sucursal (`Organization`, `type: branch`) tiene al menos un `Warehouse` propio. Con
  `shareInventory=true` (ADR-0006), el almacén se asocia a la raíz de la cadena.
- `isDefault` marca el almacén que recibe el stock cuando la operación no especifica uno.

### 3.5 StockLevel

```prisma
model StockLevel {
  id              String   @id @default(uuid())
  organizationId  String
  warehouseId     String
  productId       String
  variantId       String?
  quantity        Int      @default(0)
  minQuantity     Int      @default(0)   // umbral mínimo (stock bajo)
  criticalQuantity Int     @default(0)   // umbral crítico
  averageCost     Int      @default(0)   // costo promedio ponderado (centavos)
  updatedAt       DateTime @updatedAt

  warehouse  Warehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  product    Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant    Variant?  @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@unique([warehouseId, productId, variantId])
  @@index([organizationId])
  @@index([warehouseId])
  @@map("inventory_stock_levels")
}
```

- La restricción única `(warehouseId, productId, variantId)` impide duplicar niveles de stock para el
  mismo producto/variante en el mismo almacén.
- `organizationId` se denormaliza para que el scoping por tenant sea directo (sin join al almacén).

### 3.6 StockMovement (ledger inmutable)

```prisma
model StockMovement {
  id              String   @id @default(uuid())
  organizationId  String
  warehouseId     String
  productId       String
  variantId       String?
  type            String   // entrada | salida | ajuste | transferencia
  quantity        Int      // delta: + entrada, - salida
  quantityBefore  Int
  quantityAfter   Int
  reason          String?
  userId          String
  referenceType   String?  // venta | compra | ajuste | transferencia
  referenceId     String?
  unitCost        Int?     // costo de la operación (centavos)
  createdAt       DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([warehouseId])
  @@index([productId, variantId])
  @@index([referenceType, referenceId])
  @@map("inventory_stock_movements")
}
```

- **Inmutable**: no hay `update`/`delete`; toda corrección se realiza con un movimiento **opuesto**
  (reverso) que referencia el original. El ledger conserva el historial completo.
- `quantityBefore`/`quantityAfter` permiten auditar cualquier punto del historial sin recalcular.

### 3.7 InventoryLot (solo FIFO opcional)

```prisma
model InventoryLot {
  id           String   @id @default(uuid())
  stockLevelId String
  quantity     Int
  unitCost     Int
  receivedAt   DateTime @default(now())

  @@index([stockLevelId, receivedAt])
  @@map("inventory_lots")
}
```

- Solo se crean capas cuando la organización opta por **FIFO**; las salidas consumen de la capa más
  antigua (`receivedAt` ascendente). En el modo base (`average`) esta tabla no se usa.

## 4. Movimientos de stock (flujos)

Todos los movimientos se ejecutan dentro de una **transacción Prisma** que (a) valida el estado,
(b) escribe el `StockMovement`, (c) actualiza el `StockLevel` y (d) re-sincroniza el `Product.stock`
agregado.

| Tipo | Semántica | Efecto |
|------|-----------|--------|
| `entrada` | Recepción de compra / devolución | `quantity += delta`; recalcula `averageCost` (o crea `InventoryLot` en FIFO). |
| `salida` | Venta / consumo | `quantity -= delta` (validación no-negativo); registra `referenceType='venta'`. |
| `ajuste` | Corrección manual / inventario físico | `quantity` al valor objetivo (delta = objetivo − actual), con `reason` obligatorio. |
| `transferencia` | Traslado entre almacenes | **Dos** movimientos enlazados por `referenceId`: salida en origen + entrada en destino. |

- La validación de **no quedar en negativo** se mantiene (hoy en `POST /inventory/:id/adjust`), salvo
  que la organización habilite `allowNegative` (off por defecto).
- `referenceId` + `referenceType` enlazan el movimiento con la venta/compra/transferencia de origen.

## 5. Valoración

- **Costo promedio ponderado (base):** en cada `entrada` con `unitCost`:
  `averageCost = (qtyAnterior × averageCostAnterior + qtyEntrante × unitCost) / (qtyAnterior + qtyEntrante)`.
  Las `salidas` descuentan al costo promedio vigente. El resultado se persiste en `StockLevel.averageCost`.
- **FIFO (opcional):** las entradas crean `InventoryLot` (capa de costo); las salidas consumen de la
  capa más antigua y el costo de la salida es el de esa capa. Se activa por organización (flag) o por
  producto.
- **Valor total** de un `StockLevel` = `quantity × averageCost` (o suma de lotes en FIFO). El reporte
  de valoración agrega por producto, variante, categoría o almacén.

## 6. Alertas de stock bajo

- `StockLevel.minQuantity` (umbral «stock bajo») y `criticalQuantity` (umbral «crítico»).
- Un `StockLevel` con `quantity <= criticalQuantity` se marca «crítico»; con
  `quantity <= minQuantity`, «stock bajo».
- Endpoint `GET /inventory/alerts` devuelve ambos grupos (scoped). La notificación al responsable es
  opcional y reutiliza la infraestructura de `Notification` + email/WebSocket existente; un movimiento
  que cruza el umbral genera la alerta y reponer stock la elimina.

## 7. API REST objetivo

> Permisos nuevos `inventory.read`/`inventory.manage` (ADR-0004), sembrados en roles admin. Todas las
> rutas pasan `authenticate` + `requireTenant` (fail-closed); las de escritura exigen `inventory.manage`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/inventory/products` | Listar productos (filtros: categoría, marca, proveedor, búsqueda). |
| POST/PATCH/DELETE | `/api/v1/inventory/products[/:id]` | CRUD de producto (+ variante implícita). |
| GET/POST | `/api/v1/inventory/products/:id/variants` | Listar/crear variantes (SKU/barcode/atributos). |
| PATCH/DELETE | `/api/v1/inventory/variants/:id` | Editar/archivar variante. |
| GET/POST/PATCH/DELETE | `/api/v1/inventory/categories[/:id]` | CRUD de categorías (jerárquicas). |
| GET/POST/PATCH/DELETE | `/api/v1/inventory/brands[/:id]`, `/suppliers[/:id]` | CRUD de marcas/proveedores. |
| GET/POST/PATCH/DELETE | `/api/v1/inventory/warehouses[/:id]` | CRUD de almacenes (scoped por sucursal). |
| GET | `/api/v1/inventory/stock` | Niveles de stock (filtro por almacén/categoría/producto). |
| POST | `/api/v1/inventory/stock/receive` | Entrada de compra (con `unitCost`). |
| POST | `/api/v1/inventory/stock/issue` | Salida/consumo (validación no-negativo). |
| POST | `/api/v1/inventory/stock/adjust` | Ajuste manual (objetivo o delta + motivo). |
| POST | `/api/v1/inventory/stock/transfer` | Transferencia entre almacenes (2 movimientos). |
| POST | `/api/v1/inventory/stock/receive` | Entrada de compra (con `unitCost`). |
| GET | `/api/v1/inventory/movements` | Ledger (solo lectura, filtrable por rango/almacén/tipo). |
| GET | `/api/v1/inventory/movements/:id` | Detalle de un movimiento. |
| GET | `/api/v1/inventory/alerts` | Ítems en stock bajo/crítico. |
| GET | `/api/v1/inventory/reports/stock-levels` | Reporte de niveles (JSON/CSV). |
| GET | `/api/v1/inventory/reports/movements` | Reporte de movimientos (rango de fechas). |
| GET | `/api/v1/inventory/reports/valuation` | Valoración de inventario (promedio/FIFO). |
| GET | `/api/v1/inventory/export.csv` | Export CSV (stock o movimientos). |
| POST | `/api/v1/inventory/import` | Import CSV validado (errores por fila, sin corromper datos). |

- Se conserva un **alias retrocompatible** `/api/v1/plugins/inventario/*` durante M9 para no romper
  el frontend actual; se retira en la limpieza post-M9.
- La **referencia de la API implementada** (endpoints reales, cuerpos de request, validaciones y
  códigos de respuesta) está en `docs/api/inventory.md`.

## 8. Scoping multi-tenant fail-closed

- Toda consulta se filtra por `organizationId` (del claim `orgId` del JWT o header `X-Org-Id`) y,
  cuando aplica, por `warehouseId` de la sucursal, mediante `withTenant`/`resolveScope` (ADR-0006).
- Sin tenant resuelto → **403** (nunca query global). Un `Warehouse` solo se opera desde su
  organización dueña.
- **Vista consolidada**: para `super_admin`/admin de cadena, las consultas agregan por `chainId`
  (closure de descendientes) y son de solo lectura (nunca escriben en nombre de las hijas).
- `shareInventory` (ADR-0006): `false` (default) = inventario por sucursal (almacén por rama); `true`
  = inventario a nivel de cadena (almacén asociado a la raíz). `syncProductStock` actual se reemplaza
  por el agregado `Product.stock = Σ StockLevel` dentro del scope.

## 9. Plan de migración (desde `InventoryItem`)

1. Crear las tablas nuevas (`Variant`, `Category`/`Brand`/`Supplier`, `Warehouse`, `StockLevel`,
   `StockMovement`, `InventoryLot`).
2. Por cada `Organization` crear un `Warehouse` por defecto (`isDefault=true`).
3. Por cada `InventoryItem`:
   - Crear la variante implícita de su producto (si tiene `productId`) o un producto mínimo.
   - Crear el `StockLevel` en el almacén por defecto con `quantity`, `minQuantity`,
     `averageCost = unitPrice`.
   - Replicar `category` (texto libre) como `Category` (o mapear) y `sku`/`barcode` a `Variant`.
4. Re-sincronizar `Product.stock` como agregado de `StockLevel`.
5. Mantener `InventoryItem` en modo solo lectura (deprecado) durante la transición; eliminarlo al
   final de M9.
6. Backfill de permisos `inventory.read`/`inventory.manage` en roles existentes.

## 10. Permisos y roles

- `inventory.read`: listados, búsquedas, niveles, movimientos, alertas y reportes.
- `inventory.manage`: CRUD de productos/variantes/catálogo/almacenes y movimientos (receive/issue/
  adjust/transfer).
- Sembrados en `admin` (y heredables por `super_admin`/admin de cadena); `manager`/`user` solo leen
  dentro de su organización (ADR-0006).
