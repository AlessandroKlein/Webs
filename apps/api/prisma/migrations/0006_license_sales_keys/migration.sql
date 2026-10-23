-- CreateTable
CREATE TABLE "license_sales" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "productId" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '[]',
    "limits" JSONB,
    "amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "notes" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleId" TEXT,
    "productId" TEXT NOT NULL,
    "licensee" TEXT NOT NULL,
    "features" JSONB NOT NULL DEFAULT '[]',
    "limits" JSONB,
    "fingerprint" TEXT,
    "activationKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "license_sales_organizationId_idx" ON "license_sales"("organizationId");

-- CreateIndex
CREATE INDEX "license_sales_productId_idx" ON "license_sales"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "license_keys_activationKey_key" ON "license_keys"("activationKey");

-- CreateIndex
CREATE INDEX "license_keys_organizationId_idx" ON "license_keys"("organizationId");

-- CreateIndex
CREATE INDEX "license_keys_productId_idx" ON "license_keys"("productId");

-- CreateIndex
CREATE INDEX "license_keys_saleId_idx" ON "license_keys"("saleId");

-- AddForeignKey
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "license_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
