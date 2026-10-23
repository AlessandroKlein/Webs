-- AlterTable (ADR-0017): dominio/hostname único por organización para routing multi-sucursal.
ALTER TABLE "organizations" ADD COLUMN "domain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_domain_key" ON "organizations"("domain");
