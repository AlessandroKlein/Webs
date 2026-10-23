-- CreateTable
CREATE TABLE "generated_resources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "description" TEXT,
    "feature" TEXT NOT NULL DEFAULT 'generator',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_records" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_resources_key_key" ON "generated_resources"("key");

-- CreateIndex
CREATE INDEX "generated_records_resourceId_organizationId_idx" ON "generated_records"("resourceId", "organizationId");
