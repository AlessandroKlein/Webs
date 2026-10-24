-- Operaciones de stock (M9 — ADR-0023 §3.6/§3.7): ledger inmutable de
-- movimientos + capas de costo FIFO opcional.

CREATE TABLE "inventory_stock_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "unitCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_stock_movements_organizationId_createdAt_idx" ON "inventory_stock_movements"("organizationId", "createdAt");
CREATE INDEX "inventory_stock_movements_warehouseId_idx" ON "inventory_stock_movements"("warehouseId");
CREATE INDEX "inventory_stock_movements_productId_variantId_idx" ON "inventory_stock_movements"("productId", "variantId");
CREATE INDEX "inventory_stock_movements_referenceType_referenceId_idx" ON "inventory_stock_movements"("referenceType", "referenceId");

CREATE TABLE "inventory_lots" (
    "id" TEXT NOT NULL,
    "stockLevelId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_lots_stockLevelId_receivedAt_idx" ON "inventory_lots"("stockLevelId", "receivedAt");
