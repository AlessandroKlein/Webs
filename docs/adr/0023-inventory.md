# ADR-0023: Modelo de inventario completo (variantes, multi-almacén, ledger y valoración)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 9 — v2.7.0)
- **Decisión:** Sustituir el inventario básico actual (modelo plano `InventoryItem`, sin variantes,
  sin almacenes, sin movimientos ni valoración) por un **sistema de gestión de stock completo**:
  productos con **variantes** (SKU + EAN/UPC), catálogo estructurado (`Category`/`Brand`/`Supplier`),
  **multi-almacén por sucursal** (`Warehouse` ligado a `Organization`), niveles de stock
  (`StockLevel` por producto+variante+almacén con umbrales mínimo/crítico), un **ledger inmutable
  de movimientos** (`StockMovement` entrada/salida/ajuste/transferencia con cantidad antes/después),
  **valoración por costo promedio ponderado** (base) con **FIFO** opcional, **alertas de stock bajo**
  por umbral, y una **API REST + reportes/CSV**, todo bajo **scoping multi-tenant fail-closed**
  (ADR-0006). Especificación detallada en `docs/architecture/inventory.md`.

## Contexto

El inventario actual es un plugin de control básico:

- `plugins/inventario/src/server.ts` (195 líneas) monta rutas bajo `/api/v1/plugins/inventario`
  y opera sobre el modelo `InventoryItem` (`apps/api/prisma/schema.prisma:488-506`): `id`,
  `organizationId`, `sku`, `name`, `quantity`, `minQuantity`, `unitPrice`, `category` (texto libre),
  `productId`, `barcode`. No hay variantes, ni almacenes, ni tabla de movimientos, ni valoración.
- `Product` (`schema.prisma:194-209`) tiene `stock Int` (denormalizado), `sizes Json`, `barcode
  String?`, `category String?` — pero **no** tiene SKU, variantes ni costo.
- `Organization` (`schema.prisma:422-443`) ya modela la jerarquía de cadenas (`type`, `parentId`,
  `chainId`) y el flag `shareInventory` (ADR-0006).
- El plugin implementa `syncProductStock()`: cuando `Organization.shareInventory === true`, el
  `Product.stock` se re-sincroniza como la suma de las cantidades de sus `InventoryItem` vinculados
  por `productId`. Con `false`, inventario y tienda son fuentes independientes.
- El scoping ya es **fail-closed** en el plugin (ADR-0006): `resolveScope`/`requireTenant` producen
  un fragmento `where` por tenant, con `ROOT_ORG_ID` como fallback single-tenant y un `AND` para
  filtrar por `organizationId` solicitada.

El objetivo M9 (`docs/backlog.md` §3.6, WB-35→WB-44) pide convertir esto en un inventario completo:
variantes con SKU/EAN-UPC, catálogo, multi-almacén por sucursal, movimientos con ledger auditable,
alertas por umbral, valoración (promedio/FIFO), reportes/CSV y reutilización de código de barras/QR
e impresión térmica ESC/POS de M4.

## Decisión

### 1. Modelo de datos

- **`Product`** se extiende: gana `categoryId`, `brandId`, `supplierId` (FK opcionales a las nuevas
  tablas de catálogo). El campo `category String?` (texto libre) se conserva transitoriamente por
  compatibilidad con el ecommerce; se migra y se elimina en un paso posterior. `sizes Json` y
  `barcode String?` quedan **deprecados** (se trasladan a `Variant`). `Product.stock` pasa a ser un
  **agregado denormalizado** (suma de `StockLevel` del producto dentro del alcance del tenant),
  mantenido por el servicio de inventario para no romper la tienda (`Product.stock`).
- **`Variant`** (nueva): `productId` (FK), `sku` (único por organización), `barcode` (EAN/UPC,
  único por organización), `attributes Json` (talla/color/tamaño), `name`, `active`. Cada variante es
  la unidad *almacenable*: el stock se contabiliza por variante (un producto sin variantes tiene una
  variante implícita).
- **`Category`** (nueva, jerárquica: `parentId` autorreferencia), **`Brand`**, **`Supplier`** — todas
  scoped por `organizationId`, con `name`, `active` y timestamps.
- **`Warehouse`** (nueva): `organizationId` (la sucursal dueña), `name`, `code`, `isDefault`,
  `active`, `address?`. Cada sucursal tiene al menos un almacén; con `shareInventory=true`
  (ADR-0006) el almacén se asocia a la raíz de la cadena.
- **`StockLevel`** (nueva): `organizationId` (denormalizado para scoping), `warehouseId`, `productId`,
  `variantId?`, `quantity Int`, `minQuantity Int` (umbral mínimo), `criticalQuantity Int` (umbral
  crítico), `averageCost Int` (costo promedio ponderado, en centavos, igual que `Product.price`).
  Restricción única compuesta `(warehouseId, productId, variantId)`.
- **`StockMovement`** (nueva, ledger): ver §2.

### 2. Movimientos de stock con ledger inmutable

- `StockMovement` registra `type` ∈ `entrada | salida | ajuste | transferencia`, `quantity` (delta,
  positivo para entrada/negativo para salida), `quantityBefore`, `quantityAfter`, `reason`, `userId`
  (auditoría), `referenceType`/`referenceId` (venta/compra/ajuste/transferencia), `unitCost Int?`
  (para valoración) y `createdAt`.
- El ledger es **inmutable**: no hay `update`/`delete` de `StockMovement`; toda corrección se hace
  con un **movimiento opuesto** (reverso), preservando el historial. La escritura de `StockMovement`
  y la actualización de `StockLevel` ocurren en una **transacción** (consistencia atómica).
- Una `transferencia` entre almacenes genera **dos** movimientos enlazados (salida en origen + entrada
  en destino) compartiendo `referenceId` (id de la transferencia), para que el stock por almacén
  siempre cuadre.

### 3. Valoración

- **Costo promedio ponderado (base):** cada `entrada` con `unitCost` recalcula
  `averageCost = (qtyAnterior * costoAnterior + qtyEntrante * costoEntrante) / (qtyAnterior + qtyEntrante)`
  y lo persiste en `StockLevel.averageCost`. Las `salidas` se valoran al costo promedio vigente.
- **FIFO (opcional):** se mantiene una tabla de capas de costo (`InventoryLot`: `stockLevelId`,
  `quantity`, `unitCost`, `receivedAt`) cuando la organización opta por FIFO; las salidas consumen de
  la capa más antigua. Selección por organización (o por producto), default `average`.

### 4. Alertas de stock bajo

- Umbrales **por `StockLevel`** (`minQuantity` y `criticalQuantity`), por almacén. Al cruzar
  `criticalQuantity` el ítem queda «crítico»; por debajo de `minQuantity`, «stock bajo». Un endpoint
  de alertas expone ambos; la notificación al responsable reutiliza la infraestructura existente de
  notificaciones (tabla `Notification` + email/WebSocket), sin acoplar al inventario.

### 5. API REST + reportes y CSV

- El inventario deja de ser solo un plugin para exponer una **API REST de primera clase** bajo
  `/api/v1/inventory/*` (con alias retrocompatible `/api/v1/plugins/inventario/*` durante M9):
  CRUD de productos/variantes, catálogo (`/categories`, `/brands`, `/suppliers`), almacenes
  (`/warehouses`), stock (`/stock`, `/stock/adjust`, `/stock/transfer`), movimientos
  (`/movements`, solo lectura), alertas (`/alerts`) y reportes/export (`/reports/*` + `/export.csv`
  + `/import`). Permisos nuevos `inventory.read`/`inventory.write` (patrón `<recurso>.<accion>` de
  ADR-0004), sembrados en roles admin.

### 6. Scoping multi-tenant fail-closed

- Toda consulta de inventario se filtra por `organizationId` y, cuando aplica, por `warehouseId` de la
  sucursal, vía el middleware `withTenant`/`resolveScope` de ADR-0006. Si no se resuelve tenant, la
  operación se **rechaza (403)**, nunca se degrada a una query global.
- Un `Warehouse` se opera solo desde su organización dueña; la casa matriz ve la vista **consolidada**
  de todos los almacenes de la cadena (agregación por `chainId`, solo lectura de finanzas/stock).

## Consecuencias

**Positivas:**

- Inventario profesional: stock por variante (SKU/EAN-UPC), multi-almacén por sucursal y trazabilidad
  total vía ledger inmutable.
- Valoración correcta (promedio/FIFO) y reportes/CSV habilitan contabilidad y migración de datos.
- El scoping fail-closed garantiza que una sucursal nunca lea/mueva stock de otra, con vista
  consolidada para HQ (coherente con ADR-0006 y WB-37).

**Negativas / costes:**

- **Migración de datos**: el `InventoryItem` plano actual debe migrarse a `Variant` + `StockLevel` +
  `Warehouse` (crear un almacén por defecto por organización y una variante implícita por ítem; los
  ítems con `productId` se vinculan a la variante del producto). `Product.stock`/`Product.barcode`
  quedan como agregados denormalizados que hay que mantener sincronizados.
- Más tablas y una transacción obligatoria (movimiento + nivel) encarecen las escrituras; se mitiga
  con índices por `(organizationId, warehouseId)` y `(warehouseId, productId, variantId)`.
- FIFO añade la tabla de capas y su complejidad de conciliación; por eso es opcional y default
  `average`.

## Notas

- Especificación técnica completa (tablas Prisma, endpoints, flujos de movimiento/valoración/alertas,
  formato CSV y plan de migración): `docs/architecture/inventory.md`.
- Implementación en las tareas M9 `t127` (modelo), `t128` (operaciones), `t129` (frontend/UI), con
  QA + i18n en `t130`/`t132` y documentación en `t131`.
- Relación con ADR-0006 (scoping fail-closed y granularidad `shareInventory`), ADR-0004 (permisos
  `inventory.*`) y reutiliza ESC/POS de M4 para impresión térmica (WB-42).
