# Eventos y alarmas IoT — Webs

Cómo Webs recolecta y expone los **eventos** y **alarmas** de los dispositivos
satélite (Invernadero y SEMA). La lógica vive en `packages/iot/src/events.ts`
(`normalizeEvents` / `startEventCollector`) y el modelo `IotDeviceEvent`
(`apps/api/prisma/schema.prisma:1279`, migraciones `0015_iot_device_events` y
`0016_iot_events_review`).

> La telemetría (medidas) se describe en
> [Integración REST](integracion-rest.md); esta guía cubre **solo** eventos y
> alarmas.

## 1. Qué se recolecta

Cada plugin IoT levanta un **colector de eventos** independiente del colector de
medidas. Por ciclo sondea **dos** rutas del dispositivo en paralelo y normaliza
ambas a un mismo modelo:

- `GET /events` — bitácora completa de eventos.
- `GET /alarms` — subconjunto filtrado (solo alarmas).

| Dispositivo | Rutas leídas | Forma del payload |
|-------------|--------------|-------------------|
| SEMA | `GET /api/v1/events`, `GET /api/v1/alarms` | Envuelto: `{ "events": [ {ts,type,source,rule,severity,value} ] }` (o `{ "alarms": [...] }`) |
| Invernadero | `GET /api/v1/events`, `GET /api/v1/alarms` | Plano: `[ {t, sev, msg} ]` |

`normalizeEvents(kind, payload, deviceId)` decide la forma: si el payload es un
array (`Array.isArray`) lo trata como **Invernadero** (plano); si es un objeto,
busca la clave `events` o `alarms` y lo trata como **SEMA** (envuelto).

## 2. Las dos formas conviven (y no son compatibles)

### SEMA — `ts` = uptime ms, `value` = medido × 100

```json
{ "events": [ { "ts": 123456, "type": "alarm", "source": "EXT",
                "rule": "high_temp", "severity": "WARNING", "value": 4150 } ] }
```

- `ts` es **`millis()` (uptime en milisegundos)**, no epoch. Se asigna con
  `millis()` en el firmware (`Event.timestampMs`).
- `type` ∈ `sensor · rain · lightning · battery · network · alarm · system ·
  wake · sleep`.
- `severity` ∈ `DEBUG · INFO · NOTICE · WARNING · ERROR · CRITICAL`.
- `rule` es el `correlationId` (nombre de la regla).
- `value` es `int32_t` y, para alarmas disparadas por reglas, vale
  **`valor_medido × 100`** (`4150` = 41,50). La UI divide por 100 para mostrar.
- `GET /alarms` devuelve lo mismo pero **sin la clave `type`** (filtra
  `type == "alarm"`).

### Invernadero — `t` = epoch s, `sev` = 0..3

```json
[ { "t": 1730000000, "sev": 2, "msg": "Tanque bajo" } ]
```

- `t` es **epoch en segundos** (`time(nullptr)`).
- `sev` es numérico: `0` info, `1` warning, `2` error, `3` alarma. Se guarda como
  string (`String(m.sev)`).
- `msg` es el texto libre del evento.
- `type` / `source` / `rule` / `value` quedan **en `null`** (no existen en esta
  forma).

## 3. Normalización y guardado

El modelo `NormalizedIotEvent` unifica ambas formas:

| Campo | SEMA | Invernadero |
|-------|------|-------------|
| `tsRaw` | uptime ms (`millis()`) | epoch s (`time(nullptr)`) |
| `type` | `m.type` | `null` |
| `source` | `m.source` | `null` |
| `rule` | `m.rule` | `null` |
| `severity` | `m.severity` (string) | `String(m.sev)` (0..3) |
| `value` | `m.value` (×100 en alarmas) | `null` |
| `message` | `null` | `m.msg` |
| `kind` | `'event'` o `'alarm'` | `'event'` o `'alarm'` |

El `kind` canónico se decide en la normalización (`canonicalKind`): es `'alarm'`
cuando el origen ya es `/alarms` **o** cuando el evento indica alarma (`type ==
'alarm'` en SEMA; `sev >= 2` en Invernadero). Así un mismo hecho leído por
`/events` y por `/alarms` converge a la misma fila.

### `tsRaw` guarda la unidad cruda; `receivedAt` ordena y purga

El modelo `IotDeviceEvent` guarda `tsRaw` (**BIGINT**) **sin convertir**: para
SEMA es uptime ms, para Invernadero es epoch s. Por eso **no se puede ordenar ni
purgar por `tsRaw`** (mezclaría dos unidades distintas y un uptime que se
reinicia).

- `tsRaw` es `BigInt`, no `Int`: el `millis()` de SEMA es `uint32` y supera el
  rango de `Int32` a los ~24,8 días de uptime. La migración `0016` lo ensanchó a
  `BIGINT`.
- `receivedAt` (DateTime, `@default(now())`) es el momento en que Webs **recibió**
  el evento. Es lo que ordena la consulta (`orderBy: { receivedAt: 'desc' }`) y lo
  que decide la purga.
- Comentario del schema: `tsRaw` = «uptime ms (SEMA) o epoch s (Invernadero);
  ordenar por `receivedAt`, nunca por `tsRaw`».
- `value` = «SEMA: x100 en alarmas de regla (la UI divide)».
- `message` = «Invernadero: texto libre del evento».
- `serializeTsRaw` convierte `BigInt` → `number` en la respuesta de la API.

## 4. Dedupe por ventana de 300 fingerprints

`fingerprintOf` construye una clave estable a partir de la fila completa (sin
`deviceId` ni `kind`):

```
${tsRaw}|${type}|${source}|${rule}|${severity}|${value}|${message}
```

- `type` se **omite del fingerprint cuando vale `'alarm'`**, para que el mismo
  hecho leído por `/events` (con `type:'alarm'`) y por `/alarms` (sin `type`)
  converja al mismo hash.
- **No hay `UNIQUE` en la base** (la migración `0015` lo creó y la `0016` lo
  quitó). El dedupe es **por ventana**, en dos niveles, dentro del colector:
  1. **Intra-ciclo**: un `Set` de fingerprints del ciclo actual descarta
     duplicados dentro del mismo sondeo.
  2. **Por ventana**: antes de insertar se leen los últimos **300 fingerprints**
     del dispositivo (`readRecentFingerprints`) y se descartan los que ya están.

### Trade-off (aceptado)

Si la API del dispositivo cae mucho tiempo, pueden aparecer **duplicados
visibles** (la ventana de 300 ya no cubre el historial lejano). Es un trade-off
deliberado: **mejor duplicados visibles que pérdidas silenciosas** por un
`UNIQUE` permanente (que un reinicio del dispositivo —al resetear `millis()` a
cero— no descarte eventos nuevos durante la retención).

## 5. Retención

El colector de cada plugin purga los eventos con `receivedAt` mayor a **90 días**
(`deleteMany({ where: { receivedAt: { lt: now - 90 días } } })`), una vez al día
y también al arrancar el plugin. La migración `0016` añadió el índice sobre
`receivedAt` para que la purga y el `orderBy` no barran la tabla.

## 6. Ruta de lectura

Ambos plugins exponen la misma ruta para leer eventos desde la UI/API de Webs:

```
GET /api/v1/plugins/{sema|invernadero}/devices/:id/events?limit=&kind=
```

- **Permiso**: `iot.read` (prehandler `authenticate` + `authorize('iot.read')` +
  `requireTenant`).
- `limit`: 1..500, default 100.
- `kind`: `event` | `alarm` | ausente (ambos).
- **404 cross-tenant / cross-kind**: `getDevice` resuelve por `scope` de la
  organización **y** por el `kind` del plugin (`'sema'`/`'invernadero'`); un id
  de otra organización o de otro tipo devuelve
  `404 { error: 'Dispositivo no encontrado' }`.
- Devuelve `orderBy: { receivedAt: 'desc' }` con `id, kind, tsRaw, type, source,
  rule, severity, value, message, receivedAt`.

## 7. UI

`DeviceEventsCard` (`apps/web/src/features/iot/DeviceEventsCard.tsx`) se monta en
los dashboards de SEMA e Invernadero:

- Segmented control **Todas / Alarmas / Eventos** (`filter = 'all' | 'alarm' |
  'event'`), que traduce al parámetro `kind`.
- Muestra las **últimas 20** (`events.slice(0, 20)`) del total consultado
  (`limit: 100`).
- **Badge por severidad** (`severityTone(severity)`).
- La **fecha mostrada es `receivedAt`**, nunca `tsRaw`.
- Para SEMA (`valueIsScaled: true`) divide `value` por 100 antes de mostrar.
- Refresca cada **30 s** (`refetchInterval: 30000`).

## 8. Referencias

- [Integración REST (Invernadero y SEMA)](integracion-rest.md) — telemetría.
- [Ecosistema de repos](ecosistema.md) — mapa de repos y rol de Webs.
- `packages/iot/src/events.ts` — `normalizeEvents`, `startEventCollector`.
- `apps/api/prisma/schema.prisma:1279` — modelo `IotDeviceEvent`.
- `apps/api/prisma/migrations/0015_iot_device_events` + `0016_iot_events_review`.
