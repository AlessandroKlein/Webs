# Serie temporal local IoT (spec técnica)

> **Estado:** Diseño aceptado (ADR-0027 + ADR-0028) — Milestone 13.
> Implementación: t169 (base `webs_iot` + pool), t170 (`IoTStore` + downsampling),
> t171 (plugin invernadero), t172 (plugin sema).

Esta spec describe la capa de serie temporal local para la integración IoT de
Webs: el modelo de datos, el flujo de recolección, el contrato de rutas de los
plugins y la matriz de mapeo de métricas para los dispositivos soportados
(**invernadero** v3.29.0 y **SEMA** v1.103.0).

## 1. Modelo de datos

### 1.1 Registro de dispositivos (schema Prisma principal)

Vive en `apps/api/prisma/schema.prisma`, scoped por organización (ADR-0006):

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

### 1.2 Histórico (base separada `webs_iot`, pool `pg`)

Fuera de Prisma. Ver ADR-0027 para justificación y DDL completo.

```sql
-- raw (retención 7 días)
CREATE TABLE measurements (
  ts         timestamptz NOT NULL DEFAULT now(),
  device_id  text        NOT NULL,
  metric     text        NOT NULL,
  value      double precision NOT NULL,
  unit       text        NOT NULL DEFAULT ''
);
CREATE INDEX measurements_device_metric_ts ON measurements (device_id, metric, ts DESC);

-- horario (retención 90 días) y diario (2 años) — columnas agregadas
CREATE TABLE measurements_hourly (
  ts timestamptz NOT NULL, device_id text NOT NULL, metric text NOT NULL,
  avg double precision, min double precision, max double precision, count bigint,
  unit text NOT NULL DEFAULT '',
  PRIMARY KEY (device_id, metric, ts)
);
CREATE TABLE measurements_daily ( /* misma forma que hourly */ );
```

- `device_id` = `IotDevice.id` (UUID) — el mapeo `uuid → baseUrl` vive en Prisma,
  no se duplica el host en la serie.
- TimescaleDB (`create_hypertable`) es upgrade opcional; v1 usa PostgreSQL estándar.

## 2. Contrato de rutas de los plugins

Ambos plugins exponen el mismo contrato bajo `/api/v1/plugins/<id>`:

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| POST | `/devices` | `iot.write` | Registrar dispositivo: `{ kind, name, baseUrl, token, pollIntervalMs? }` |
| GET | `/devices` | `iot.read` | Listar dispositivos de la org (token enmascarado) |
| PATCH | `/devices/:id` | `iot.write` | Editar (name/baseUrl/token/pollIntervalMs/enabled) |
| DELETE | `/devices/:id` | `iot.write` | Eliminar dispositivo |
| GET | `/devices/:id/status` | `iot.read` | Estado en vivo (sondeo inmediato del dispositivo) |
| GET | `/devices/:id/series` | `iot.read` | Histórico desde `webs_iot` |

**`GET /devices/:id/series`**

Query: `metric` (obligatorio), `from`, `to` (ISO 8601 o epoch), `agg`
(`avg`|`min`|`max`|`count`, opcional). Sin `agg` → serie cruda acotada (máx. 5000
puntos); con `agg` → bucket horario/diario según el rango.

```json
{
  "deviceId": "…",
  "metric": "temperature",
  "unit": "°C",
  "points": [ { "ts": 1760000000, "value": 23.4 } ]
}
```

**`POST /devices`** — cuerpo mínimo (token en claro, se cifra al guardar):

```json
{ "kind": "invernadero", "name": "Invernadero Norte", "baseUrl": "http://192.168.1.50/api/v1", "token": "…", "pollIntervalMs": 60000 }
```

Todas las rutas resuelven `organizationId` fail-closed: sin tenant → 403; un
`deviceId` de otra organización → 404.

## 3. Flujo de recolección

```text
┌──────────────┐   job cada pollIntervalMs   ┌──────────────────┐
│ IotDevice    │ ───────────────────────────▶│ collector plugin │
│ (enabled=1)  │                             │  invernadero/sema│
└──────────────┘                             └────────┬─────────┘
                                                       │ 1. descifrar token
                                                       │    (lib/crypto decrypt)
                                                       │ 2. SSRF-safe check baseUrl
                                                       │ 3. GET /status|/sensors
                                                       ▼
                                             ┌──────────────────┐
                                             │ mapear métricas  │  (matriz §4/§5)
                                             │ + INSERT batch   │
                                             └────────┬─────────┘
                                                       ▼
                                             ┌──────────────────┐
                                             │ webs_iot         │
                                             │ measurements raw │
                                             └──────────────────┘
                                                       │  job nocturno (t170)
                                                       ▼
                                             raw → hourly → daily (downsampling)
```

1. El collector itera los `IotDevice` con `enabled=true` de la organización.
2. Descifra `tokenCipher` → construye `IotDeviceClient` (Bearer/X-Auth-Token/X-API-Key
   según `kind`).
3. Valida el host (SSRF-safe, ADR-0028 §3).
4. Llama al endpoint de estado y mapea cada métrica a `(metric, value, unit)`.
5. `INSERT` en batch en `measurements` y actualiza `lastSeenAt`.
6. El downsampling nocturno agrega raw → horario (7→90 días) y horario → diario
   (90 días → 2 años), idempotente (`ON CONFLICT`).

## 4. Matriz de mapeo — Invernadero (v3.29.0)

- Base: `http://<IP>/api/v1` (puerto 80).
- Auth: lectura abierta; escritura `Authorization: Bearer <token>` o
  `X-Auth-Token`.
- Fuente primaria de recolección: `GET /status`.

| Métrica (`/status`) | `metric` | `unit` | Notas |
|---------------------|----------|--------|-------|
| `temperatura` | `temperature` | `°C` | — |
| `humedad` | `humidity` | `%` | humedad relativa |
| `suelo` | `soil_moisture` | `%` | humedad de suelo |
| `tanque` | `tank_level` | `%` | nivel de tanque |
| `luz` | `light` | `lux` | — |
| `bomba` | `pump` | `%` | salida 0..100 (estado) |
| `ventilador` | `fan` | `%` | salida 0..100 (estado) |

Endpoints de lectura adicionales (referencia completa en
[Docs/invernadero/API-REST](https://alessandroklein.github.io/Docs/invernadero/API-REST/)):

- `GET /sensors` — lista de sensores con calidad (puede alimentar métricas
  derivadas).
- `GET /weather` — estación meteorológica externa.
- `GET /alarms` — alarmas con severidad ≥ 2.
- `GET /actuators` — lista de actuadores (output, fault).
- `GET /device` — UID, id, perfil, firmware, causa de reinicio.
- `POST /actuators` — control `{ "role": "pump", "index": 0, "output": 100 }`
  (roles: `pump`, `valve`, `fan`, `extractor`, `heater`, `humidifier`, `light`,
  `roof`, `window`, `shade`, `alarm`).

## 5. Matriz de mapeo — SEMA (v1.103.0)

- Base: `/api/v1` (puerto 80, `WebServer` de Arduino-ESP32).
- Auth: lectura pública; escritura vía `Cookie: sema_auth` o `X-API-Key`
  (`server_key`/`api_key`/`extra_keys`). Para el collector alcanza `X-API-Key`.
- Fuente primaria de recolección: `GET /sensors` (catálogo + mediciones actuales).

`GET /sensors` devuelve `measurements[]` donde cada ítem es:

```json
{ "sensor_id": "EXT", "channel_id": "temperature", "measurement": "temperature",
  "value": 23.4, "unit": "°C", "quality": "VALID", "sequence": 123 }
```

Mapeo: `metric = measurement` (o `sensor_id.channel_id` si hay colisión), `value`
y `unit` directos, descartando `quality != VALID` (o guardando la calidad como
métrica aparte si se quiere telemetría de salud).

| `measurement` típica | `metric` | `unit` |
|----------------------|----------|--------|
| `temperature` | `temperature` | `°C` |
| `humidity` | `humidity` | `%` |
| `dew_point` | `dew_point` | `°C` |
| `pressure` | `pressure` | `hPa` |
| `wind_speed` | `wind_speed` | `m/s` |
| `wind_direction` | `wind_direction` | `°` |
| `rain` | `rain` | `mm` |
| `light` | `light` | `lux` |
| `battery` | `battery` | `V` |
| `clock` | `clock` | `epoch` |

Endpoints adicionales (referencia completa en
[Docs/sema/API-REST](https://alessandroklein.github.io/Docs/sema/API-REST/)):

- `GET /status` — identidad mínima `{ station, name, firmware, uptime_s }`.
- `GET /history` — histórico del dispositivo (`limit` 1–3000, `series=recent|aggregated`,
  `format=json|csv`); **no** tiene filtro por rango de fechas (se trae todo y se
  filtra en el collector).
- `GET /energy` — perfil energético y `wake_reason`.
- `GET /alarms` — alarmas (`severity`, `value` ×100).
- `GET /system` — identidad completa (board, flash, IP, `esp_temp`, etc.).
- `GET /diagnostics` — firmware, heap, health, tareas, dispositivos I²C.

> Nota de unidades: SEMA convierte según `system.units` (`metric`/`imperial`);
> el collector asume `metric` y normaliza a unidades canónicas de Webs (°C, %,
> m/s, hPa).

## 6. Seguridad y scoping

- **Token cifrado**: `tokenCipher` con `encrypt()`/`decrypt()` de
  `apps/api/src/lib/crypto.ts` (AES-256-GCM); nunca en claro ni en logs.
- **SSRF-safe**: denegar loopback/privados por defecto, allowlist explícita
  `IOT_SSRF_ALLOWLIST` (ADR-0028 §3).
- **Multi-tenant fail-closed**: `organizationId` obligatorio en toda consulta a
  `IotDevice` y en `querySeries` (validar pertenencia antes de leer `webs_iot`).
- **Permisos**: `iot.read` / `iot.write` sembrados (mismo patrón que
  `inventory.*`, ADR-0023).

## 7. Plan de implementación (trazabilidad)

| Tarea | Alcance |
|-------|---------|
| t169 | Base `webs_iot` + pool `pg` (`lib/iot-pool.ts`) + `IotDevice` en schema |
| t170 | `IoTStore` (`insert`/`querySeries`) + job de downsampling raw→horario→diario |
| t171 | Plugin `invernadero`: collector + mapeo §4 + contrato de rutas |
| t172 | Plugin `sema`: collector + mapeo §5 + contrato de rutas |
| t173 | UI conexión mínima (IP/URL + token) con test |
| t174/t175 | Dashboards + gráficos históricos (componentes compartidos) |
| t176/t177 | i18n es/en/pt + docs |
| t178/t179 | QA + release v2.11.0 |

## Ver también

- [ADR-0027 — Serie temporal local](adr/0027-iot-serie-temporal.md)
- [ADR-0028 — Patrón de plugins IoT](adr/0028-iot-plugin-pattern.md)
- [Backlog §3.10 (Milestone 13)](../backlog.md)
- [Escalabilidad](scalability.md) — Redis y despliegue de la API (el collector
  corre dentro de `apps/api` y escala horizontal igual que el resto).
