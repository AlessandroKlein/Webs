-- Eventos y alarmas de dispositivos IoT (ADR-0028): ingesta REST de /events y /alarms.
-- `tsRaw` es el timestamp crudo del dispositivo (uptime ms en SEMA, epoch s en Invernadero);
-- el orden y la retención se hacen por `receivedAt`, nunca por `tsRaw`.

-- CreateTable
CREATE TABLE "iot_device_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'event',
    "tsRaw" INTEGER NOT NULL,
    "type" TEXT,
    "source" TEXT,
    "rule" TEXT,
    "severity" TEXT,
    "value" DOUBLE PRECISION,
    "message" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "iot_device_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iot_device_events_deviceId_fingerprint_key" ON "iot_device_events"("deviceId", "fingerprint");

-- CreateIndex
CREATE INDEX "iot_device_events_deviceId_receivedAt_idx" ON "iot_device_events"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "iot_device_events_organizationId_receivedAt_idx" ON "iot_device_events"("organizationId", "receivedAt");

-- AddForeignKey
ALTER TABLE "iot_device_events" ADD CONSTRAINT "iot_device_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "iot_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iot_device_events" ADD CONSTRAINT "iot_device_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
