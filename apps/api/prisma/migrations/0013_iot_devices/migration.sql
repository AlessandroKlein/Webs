-- Dispositivos IoT (ADR-0027/0028): motor de telemetría @webs/iot.
-- Columnas camelCase (convención Prisma sin @map por campo).

-- CreateEnum
CREATE TYPE "IotDeviceKind" AS ENUM ('invernadero', 'sema');

-- CreateTable
CREATE TABLE "iot_devices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "IotDeviceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "tokenCipher" TEXT,
    "authMode" TEXT NOT NULL DEFAULT 'bearer',
    "pollIntervalMs" INTEGER NOT NULL DEFAULT 60000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "iot_devices_organizationId_idx" ON "iot_devices"("organizationId");

-- CreateIndex
CREATE INDEX "iot_devices_kind_idx" ON "iot_devices"("kind");
