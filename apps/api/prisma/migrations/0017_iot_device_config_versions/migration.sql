-- Fase 1 del servidor central: configuración versionada con ack real.
-- `status` es draft/applied/failed; `applied` solo lo marca el PUT exitoso al equipo.
-- No se pisa una versión applied anterior: el fallo deja la fila en `failed` y la última applied intacta.

-- CreateTable
CREATE TABLE "iot_device_config_versions" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "config" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "error" TEXT,
    "authorId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_device_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iot_device_config_versions_deviceId_version_key" ON "iot_device_config_versions"("deviceId", "version");

-- CreateIndex
CREATE INDEX "iot_device_config_versions_deviceId_createdAt_idx" ON "iot_device_config_versions"("deviceId", "createdAt");

-- AddForeignKey
ALTER TABLE "iot_device_config_versions" ADD CONSTRAINT "iot_device_config_versions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
