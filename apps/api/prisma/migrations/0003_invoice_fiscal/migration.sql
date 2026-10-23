-- Extiende Invoice para numeración fiscal + trazabilidad (ADR-0014).
-- Columnas camelCase (convención Prisma sin @map por campo, igual que el resto del modelo).

ALTER TABLE "invoices" ADD COLUMN "neto" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "iva" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "ptoVta" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoices" ADD COLUMN "cbteTipo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "invoices" ADD COLUMN "caeExpiresAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "caePeriodo" TEXT;
ALTER TABLE "invoices" ADD COLUMN "caeOrden" INTEGER;
ALTER TABLE "invoices" ADD COLUMN "orderId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "userId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "template" TEXT;

CREATE INDEX "invoices_ptoVta_cbteTipo_idx" ON "invoices"("ptoVta", "cbteTipo");
CREATE INDEX "invoices_userId_idx" ON "invoices"("userId");
