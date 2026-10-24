-- Sistema de tickets (ADR-0021): estados y prioridades + trazabilidad.
-- Columnas camelCase (convención Prisma sin @map por campo).

CREATE TYPE "TicketStatus" AS ENUM ('pending', 'in_progress', 'done');
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- Backfill de los valores legacy ('open'/'closed' del plugin de soporte anterior).
UPDATE "tickets" SET "status" = 'pending' WHERE "status" = 'open';
UPDATE "tickets" SET "status" = 'done' WHERE "status" = 'closed';
UPDATE "tickets" SET "status" = 'pending' WHERE "status" NOT IN ('pending', 'in_progress', 'done');

ALTER TABLE "tickets" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tickets" ALTER COLUMN "status" TYPE "TicketStatus" USING "status"::"TicketStatus";
ALTER TABLE "tickets" ALTER COLUMN "status" SET DEFAULT 'pending';

ALTER TABLE "tickets" ADD COLUMN "priority" "TicketPriority" NOT NULL DEFAULT 'normal';
ALTER TABLE "tickets" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "authorId" TEXT;
ALTER TABLE "tickets" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "tickets_status_idx" ON "tickets"("status");
