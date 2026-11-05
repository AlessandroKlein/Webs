-- Fixes del review de task-20 (task-29):
--  1) `tsRaw` BIGINT: `millis()` de SEMA es uint32 (> Int32 a los ~24.8 días).
--  2) Dedupe por ventana en el collector (se quita el unique permanente deviceId+fingerprint;
--     un reinicio del equipo ya no descarta eventos nuevos durante la retención).
--  3) Índice de purga diaria por `receivedAt`.

ALTER TABLE "iot_device_events" ALTER COLUMN "tsRaw" TYPE BIGINT;

DROP INDEX "iot_device_events_deviceId_fingerprint_key";

CREATE INDEX "iot_device_events_receivedAt_idx" ON "iot_device_events"("receivedAt");
