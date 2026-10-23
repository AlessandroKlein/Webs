# ADR-0027: Serie temporal local (base separada `webs_iot`)

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 13 — IoT)
- **Decisión:** Guardar los históricos de telemetría IoT en una base de datos
  PostgreSQL **separada** (`webs_iot`), aislada del schema Prisma principal, con
  una tabla genérica `measurements(ts, device_id, metric, value, unit)` indexada
  por `(device_id, metric, ts)` y acceso vía un pool `pg` dedicado (sin Prisma).
  El registro de dispositivos vive en el schema Prisma principal (`IotDevice`),
  con scoping multi-tenant por organización.

## Contexto

El Milestone 13 introduce integración IoT con dispositivos locales (invernadero
y estación meteorológica SEMA) que reportan telemetría a intervalos regulares
(ver `docs/backlog.md` §3.10, WB-78 → WB-89). El volumen de escritura es alto
(decenas de métricas por dispositivo cada 60 s) y el patrón de acceso es
temporal (gráficos por métrica en un rango de tiempo), muy distinto del patrón
transaccional del resto de la plataforma.

El schema Prisma principal (`apps/api/prisma/schema.prisma`) ya concentra los
modelos de negocio (usuarios, organizaciones, productos, órdenes, pagos, etc.).
Meter una tabla de telemetría de alta frecuencia ahí:

1. Contaminaría el datasource con un volumen de filas desproporcionado.
2. Complicaría las migraciones (cada alteración del modelo de negocio bloquearía
   sobre una tabla que crece a millones de filas/mes).
3. Forzaría a Prisma a manejar `timestamptz` + `double` + particiones, algo que
   no es su fuerte.

Por eso se aísla el histórico en una base propia, manteniendo el modelo de
negocio intacto.

## Decisión

### 1. Base de datos separada `webs_iot`

- Una base PostgreSQL dedicada `webs_iot` (misma instancia del `docker-compose`
  existente, o instancia dedicada en producción), **fuera** del datasource de
  Prisma.
- Nueva variable de entorno `IOT_DATABASE_URL` (formato `postgres://…`), análoga
  a `DATABASE_URL`.
- En `docker-compose.yml` se agrega `POSTGRES_MULTIPLE_DATABASES: webs,webs_iot`
  (o un init-script equivalente) para crear ambas bases en el arranque.

### 2. Modelo genérico `measurements`

Tabla única, estilo ThingSpeak local:

```sql
CREATE TABLE measurements (
  ts         timestamptz NOT NULL DEFAULT now(),
  device_id  text        NOT NULL,   -- id del IotDevice (UUID) o device remoto
  metric     text        NOT NULL,   -- 'temperature', 'humidity', 'soil', ...
  value      double precision NOT NULL,
  unit       text        NOT NULL DEFAULT ''  -- '°C', '%', 'lux', 'V', ...
);
CREATE INDEX measurements_device_metric_ts
  ON measurements (device_id, metric, ts DESC);
```

- **Partición**: mensual por rango sobre `ts` (tabla particionada) como opción
  por defecto; alternativa ligera **BRIN** sobre `ts` para escenarios de menor
  cardinalidad. La decisión v1 es: índice compuesto `(device_id, metric, ts)` +
  **partición mensual** si el volumen lo exige; BRIN documentado como plan B.
- **TimescaleDB (hypertable)**: se evalúa como upgrade opcional — la tabla
  `measurements` está diseñada para poder convertirse en hypertable sin migrar
  datos (`SELECT create_hypertable('measurements','ts')`). **No bloquea v1**:
  v1 funciona con PostgreSQL estándar.

### 3. Acceso vía pool `pg` dedicado (NO Prisma)

- Un único pool `pg` (`apps/api/src/lib/iot-pool.ts`, `createIotPool(url)`)
  devuelve `Pool` o `null` si no hay `IOT_DATABASE_URL` (mismo patrón de
  degradación que `apps/api/src/lib/redis.ts` → `createRedis`).
- Capa de acceso `IoTStore` con operaciones de bajo nivel (ver ADR-0028 y
  `docs/architecture/iot-serie-temporal.md`):
  - `insert(deviceId, points[])` — batch insert.
  - `querySeries({ deviceId, metric, from, to, agg })` — con agregación
    `avg`/`min`/`max`/`count` y downsampling a bucket.
- **No** se registra en `prisma generate`: el histórico queda fuera del ORM a
  propósito (los dispositivos sí, ver punto 4).

### 4. Registro de dispositivos en Prisma (`IotDevice`)

El catálogo de dispositivos (baja cardinalidad, transaccional) **sí** vive en el
schema Prisma principal:

```prisma
model IotDevice {
  id             String   @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  kind           String        // "invernadero" | "sema"
  name           String
  baseUrl        String        // http://<IP>/api/v1
  tokenCipher    String?       // token cifrado AES-256-GCM (lib/crypto.ts)
  pollIntervalMs Int      @default(60000)
  enabled        Boolean  @default(true)
  lastSeenAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@index([kind])
  @@map("iot_devices")
}
```

- Scoping multi-tenant fail-closed por `organizationId` (patrón ADR-0006:
  `withTenant`/`requireTenant`).
- El `token` se guarda **cifrado** con `encrypt()` de `apps/api/src/lib/crypto.ts`
  (AES-256-GCM, clave derivada de `ENCRYPTION_KEY`); nunca en texto plano.

### 5. Retención + downsampling

Tres niveles (job nocturno en `apps/api`):

| Nivel | Granularidad | Retención | Destino |
|-------|--------------|-----------|---------|
| raw | 1 muestra | 7 días | `measurements` |
| horario | 1 h (avg/min/max/count) | 90 días | `measurements_hourly` |
| diario | 1 día (avg/min/max/count) | 2 años | `measurements_daily` |

- El downsampling es un `INSERT … SELECT` con `date_trunc` y `GROUP BY`, ejecutado
  por un job que puede correr en una única réplica (no es crítico que sea
  concurrente-safe; usa `ON CONFLICT` para idempotencia).
- `device_id` + `metric` + `ts` se conservan en los tres niveles; `value` en las
  tablas agregadas es `avg` y se guardan `min`/`max`/`count` como columnas extra.

## Consecuencias

### Positivas

- El datasource transaccional de Prisma no se ve contaminado por telemetría de
  alta frecuencia; las migraciones del negocio siguen siendo rápidas.
- Consultas de gráficos usan un índice dedicado y pueden delegar a TimescaleDB
  si el volumen crece.
- El `pg` pool permite `INSERT` en batch y agregación en SQL nativo, mucho más
  eficiente que el ORM para este patrón.
- Fallo de `webs_iot` no tumba la API principal (degradación a «sin históricos»).

### Negativas

- Dos bases que coordinar en backup/restore y en `docker-compose`.
- `pg` crudo obliga a SQL propio (sin type-safety de Prisma) para el histórico;
  se mitiga con la capa `IoTStore` acotada y testeada.
- La partición mensual añade complejidad operativa (crear particiones futuras);
  v1 puede arrancar sin particionar y particionar después.

## Notas

- Numeración ADR-0026 queda reservada para Milestone 12 (actualizaciones
  v2.10.0); este ADR usa 0027/0028 sin colisión con los existentes (0001–0025).
- Spec técnica completa: `docs/architecture/iot-serie-temporal.md`.
- Patrón de cliente HTTP / collector / SSRF-safe / contrato de rutas: ADR-0028.
- Referencias de API de los dispositivos (fuente de verdad del mapeo de
  métricas): `https://alessandroklein.github.io/Docs/invernadero/API-REST/` y
  `https://alessandroklein.github.io/Docs/sema/API-REST/`.
