# Guía de uso del inventario completo (M9 — v2.7.0)

> **Estado:** Implementado (ADR-0023). Esta guía explica cómo operar el inventario completo de
> Webs: variantes, catálogo, multi-almacén, movimientos con ledger, valoración, alertas y
> reportes/CSV. Referencia de la API: `docs/api/inventory.md`; especificación del modelo:
> `docs/architecture/inventory.md`.

## 1. Qué aporta el inventario completo

Antes, el inventario era un control plano (un ítem = un SKU, sin variantes ni almacenes). La M9 lo
convierte en un sistema de gestión de stock profesional:

- **Variantes** de producto con **SKU** y **EAN/UPC** (código de barras).
- **Catálogo** estructurado: categorías (jerárquicas), marcas y proveedores.
- **Multi-almacén por sucursal**, con un almacén por defecto `MAIN`.
- **Niveles de stock** con umbrales mínimo/crítico.
- **Movimientos** (entrada / salida / ajuste / transferencia) sobre un **ledger inmutable**.
- **Valoración** por costo promedio ponderado (base) con **FIFO** opcional.
- **Alertas** de stock bajo/crítico, **reportes** y **export/import CSV**.

Todo está **scoped por organización** (multi-tenant fail-closed): cada sucursal ve y mueve solo su
propio stock; la casa matriz ve la vista consolidada de la cadena.

## 2. Acceso y permisos

- Panel: **`/admin/inventory`** (ítem «Inventario» del menú admin), con 6 pestañas: **Productos**,
  **Stock + Almacenes**, **Movimientos**, **Alertas**, **Reportes** y **Catálogo**.
- **`inventory.read`**: ver productos, variantes, catálogo, almacenes, niveles, movimientos,
  alertas y reportes.
- **`inventory.manage`**: crear/editar/eliminar productos, variantes, catálogo, almacenes y
  registrar movimientos (entrada/salida/ajuste/transferencia) + import CSV.
- Roles sembrados: `admin` tiene ambos; `super_admin` hereda todo; `manager`/`user` solo leen dentro
  de su organización.

## 3. Productos y variantes

Cada producto tiene al menos una **variante** (la unidad *almacenable*). Al crear un producto sin
SKU, se genera automáticamente una **variante implícita** con SKU `SKU-<id>`.

- Campos de producto: título, descripción, **precio en centavos**, stock inicial, y referencias
  opcionales a categoría/marca/proveedor.
- Campos de variante: **SKU** (obligatorio), **barcode** (EAN/UPC), nombre y atributos (talla,
  color, tamaño…).
- **SKU y barcode son únicos por organización** (no globales): dos sucursales pueden usar el mismo
  código sin colisionar. Duplicado en la misma organización → error `409`.

> Ejemplo: una remera (producto) con variantes «L negra» (SKU `REM-L-N`, barcode `779…001`) y
> «M blanca» (SKU `REM-M-B`). El stock se contabiliza por variante.

## 4. Catálogo (categorías, marcas, proveedores)

En la pestaña **Catálogo** se gestionan:

- **Categorías** (jerárquicas: una categoría puede tener `parentId`), **marcas** y **proveedores**
  (con nombre de contacto, email y teléfono). Todas scoped por organización.

## 5. Almacenes y niveles de stock

- Cada sucursal tiene al menos un **almacén** (`Warehouse`), creado automáticamente como `MAIN`
  (default) la primera vez que se necesita.
- Pueden crearse almacenes adicionales (depósito, tienda física, etc.) con `code`, `address`,
  `isDefault` y `active`.
- Un **`StockLevel`** es la cantidad disponible de un producto+variante en un almacén, con
  **`minQuantity`** (umbral «stock bajo») y **`criticalQuantity`** (umbral «crítico»). La restricción
  única `(warehouseId, productId, variantId)` impide duplicar niveles.

## 6. Movimientos de stock

Cuatro operaciones, todas registradas en el **ledger inmutable** `StockMovement` (con cantidad
antes/después, motivo, usuario y referencia):

| Tipo | Uso típico | Efecto |
|------|-----------|--------|
| **Entrada** (`receive`) | Recepción de compra / devolución | `+quantity`; recalcula costo promedio (o crea capa FIFO). |
| **Salida** (`issue`) | Venta / consumo | `-quantity`; rechaza si quedaría negativo. |
| **Ajuste** (`adjust`) | Recuento físico / corrección | Fija un objetivo (`quantity`) o aplica un delta; **motivo obligatorio**. |
| **Transferencia** (`transfer`) | Traslado entre almacenes | Dos movimientos enlazados (salida en origen + entrada en destino). |

- Cada movimiento es **transaccional**: valida, escribe el ledger, actualiza el `StockLevel` y
  re-sincroniza el agregado `Product.stock` (para no romper la tienda). No se puede quedar en
  negativo.
- El ledger **no se edita ni borra**: toda corrección es un **movimiento opuesto** (reverso), así el
  historial queda íntegro para auditoría.

## 7. Valoración

- **Costo promedio ponderado (base):** cada entrada con `unitCost` recalcula el costo medio del
  nivel; las salidas se valoran a ese costo. El resultado se guarda en `StockLevel.averageCost`.
- **FIFO (opcional):** si la operación lleva `fifo:true`, las entradas crean capas de costo
  (`InventoryLot`) y las salidas consumen de la capa más antigua. Útil para productos con costos muy
  variables.
- El **valor** de un nivel = `quantity × averageCost` (centavos). El reporte de valoración agrega
  por producto/almacén.

## 8. Alertas de stock bajo

- Un nivel con `quantity <= criticalQuantity` se marca **crítico**; con `quantity <= minQuantity`,
  **stock bajo**.
- La pestaña **Alertas** (y `GET /inventory/alerts`) lista ambos grupos, con el nivel calculado
  (`critico`/`bajo`) y los datos del producto/variante/almacén. Reponer stock por encima del umbral
  saca el ítem de la lista.

## 9. Reportes y CSV

- **Reportes** (pestaña Reportes): niveles por almacén (`stock-levels`), movimientos por rango
  (`movements`) y valoración (`valuation`, con totales en valor y unidades).
- **Export CSV** (`/inventory/export.csv`): exporta niveles (`type` por defecto) o movimientos
  (`?type=movements`).
- **Import CSV** (`/inventory/import`): carga masiva de entradas con columnas `sku, warehouse,
  quantity, unitCost`. Cada fila se valida; la respuesta reporta `imported`, `skus` y `errors`
  (por fila), sin corromper datos si alguna fila falla.

## 10. Scoping multi-tenant (qué ve cada quien)

- Toda operación se filtra por `organizationId` (claim `orgId` del JWT o header `X-Org-Id`). Sin
  tenant resuelto → **403** (fail-closed).
- Un almacén solo se opera desde su organización dueña.
- **Casa matriz / admin de cadena**: ve la **vista consolidada** de todos los almacenes de la cadena
  (agregación por `chainId`), **solo lectura** de finanzas/stock — nunca escribe en nombre de las
  hijas.
- `shareInventory` (ADR-0006): `false` (default) = inventario por sucursal (almacén por rama);
  `true` = inventario a nivel de cadena (almacén asociado a la raíz).

## 11. Verificación rápida

1. Crear un producto con precio y stock → se genera variante implícita + `StockLevel` en `MAIN`.
2. `POST /inventory/stock/receive` con `unitCost` → sube el stock y recalcula el costo promedio.
3. `POST /inventory/stock/issue` → baja el stock; probar con cantidad excesiva → `400` (no-negativo).
4. `POST /inventory/stock/transfer` entre dos almacenes → dos movimientos enlazados.
5. Bajar un nivel por debajo de `criticalQuantity` → aparece en Alertas como `critico`.
6. `GET /inventory/export.csv` y `POST /inventory/import` para ida y vuelta de datos.
