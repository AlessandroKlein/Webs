-- Endurecimiento IoT/M13 (ADR-0028): FK IotDevice.organizationId -> Organization.
-- No destructivo: solo añade la constraint (los índices organizationId/kind ya existen en 0013).
ALTER TABLE "iot_devices" ADD CONSTRAINT "iot_devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
