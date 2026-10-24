-- Deduplica códigos de almacén duplicados dentro de una misma organización
-- (datos legacy previos al constraint). Mantiene la fila más antigua y renombra
-- las siguientes con sufijo -2, -3, ... para no perder registros.
WITH ranked AS (
  SELECT
    "id",
    "organizationId",
    "code",
    ROW_NUMBER() OVER (PARTITION BY "organizationId", "code" ORDER BY "createdAt" ASC, "id" ASC) AS "rn"
  FROM "inventory_warehouses"
)
UPDATE "inventory_warehouses" AS w
SET "code" = w."code" || '-' || r."rn"
FROM ranked AS r
WHERE w."id" = r."id"
  AND r."rn" > 1;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_warehouses_organizationId_code_key" ON "inventory_warehouses"("organizationId", "code");
