# Configuración versionada de dispositivos IoT — Webs

Cómo Webs edita la configuración de un dispositivo satélite (Invernadero o
SEMA) desde el panel y **cierra el loop con un ACK real**: el firmware responde
`{ "ok": true }` al `PUT /api/v1/config`, y recién entonces la versión pasa de
`draft` a `applied`. Si el dispositivo rechaza, la versión queda `failed` con el
error y **la versión anterior sigue aplicada**.

> La telemetría se describe en [Integración REST](integracion-rest.md) y los
> eventos/alarmas en [Eventos y alarmas IoT](iot-eventos-alarmas.md); esta guía
> cubre **solo** la configuración versionada.

## 1. Qué resuelve

El servidor PHP del Invernadero marca `applied = TRUE` al insertar la fila, sin
esperar a que el equipo confirme (`Api.php:375-390` del repo Invernadero). Eso
deja un estado «aplicado» que puede no ser real: si el `PUT` nunca llegó o el
firmware lo rechazó, la base dice otra cosa.

Webs cierra el loop con el ack real:

1. Se lee la config viva del dispositivo (`GET /api/v1/config` del equipo).
2. Se edita y se guarda un borrador (`draft`).
3. Se publica: Webs hace `PUT /api/v1/config` al dispositivo.
4. Si el firmware responde `{ "ok": true }` → la versión pasa a `applied`.
   Si falla → `failed` + `error`, **sin pisar** la versión previamente aplicada.
5. Una versión fallida se puede **reintentar** sin reeditar el payload.

## 2. Modelo de datos

`IotDeviceConfigVersion` (`apps/api/prisma/schema.prisma`, migración `0017`):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Clave primaria |
| `deviceId` | FK | Dispositivo (`IotDevice`); el tenant se hereda de él |
| `version` | int | Número incremental por dispositivo (`UNIQUE(deviceId, version)`) |
| `config` | Json | Payload completo de configuración |
| `hash` | string | sha256 del `config` con claves ordenadas (para comparar cambios) |
| `status` | enum | `draft` → `applied` · `failed` |
| `error` | string? | Mensaje de error cuando `status = failed` (máx. 500 caracteres) |
| `authorId` | string? | Usuario que publicó la versión |
| `appliedAt` | datetime? | Momento del ack del dispositivo (`null` hasta `applied`) |
| `createdAt` | datetime | Momento de creación |

> El **historial no incluye el payload**: `GET …/versions` devuelve metadatos
> (hasta 50) y el `config` se pide puntualmente por versión
> (`GET …/versions/:version`).

## 3. Rutas

Todas bajo el prefijo del plugin IoT — por ejemplo
`/api/v1/plugins/invernadero` (o `/api/v1/plugins/sema`):

| Método | Ruta | Permiso | Respuesta |
|--------|------|---------|-----------|
| GET | `/devices/:id/config` | `iot.write` | `{ config }` — lectura viva (proxy a `GET /api/v1/config` del dispositivo). Exige `write` porque el payload trae credenciales |
| POST | `/devices/:id/config` | `iot.write` | `{ version, deviceResponse?, ok }` — body `{ config, publish?: boolean }` |
| POST | `/devices/:id/config/:version/publish` | `iot.write` | `{ version, deviceResponse?, ok }` |
| GET | `/devices/:id/config/versions` | `iot.read` | `{ versions }` — 50 por defecto (`?limit=` hasta 200), sin payload |
| GET | `/devices/:id/config/versions/:version` | `iot.write` | `{ version }` — con `config` (credenciales) |

### Ejemplo con curl

```bash
# 0. Token: obtenelo con el login de tu instancia (identifier = email del admin).
TOKEN="<access token>"

# 1. Leé la config viva del dispositivo (proxy al GET /api/v1/config del equipo).
curl -s http://localhost:4000/api/v1/plugins/invernadero/devices/<id>/config \
  -H "Authorization: Bearer $TOKEN"

# 2. Guardá y publicá en un solo paso (publish: true).
curl -s -X POST http://localhost:4000/api/v1/plugins/invernadero/devices/<id>/config \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"config":{"zona1":{"temperatura":24}},"publish":true}'

# 3. O guardá un borrador y publicá después por versión.
curl -s -X POST http://localhost:4000/api/v1/plugins/invernadero/devices/<id>/config \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"config":{"zona1":{"temperatura":24}}}'          # -> { "version": 7 }
curl -s -X POST http://localhost:4000/api/v1/plugins/invernadero/devices/<id>/config/7/publish \
  -H "Authorization: Bearer $TOKEN"

# 4. Historial (metadatos, sin payload) y payload puntual.
curl -s http://localhost:4000/api/v1/plugins/invernadero/devices/<id>/config/versions \
  -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:4000/api/v1/plugins/invernadero/devices/<id>/config/versions/7 \
  -H "Authorization: Bearer $TOKEN"
```

## 4. Flujo y estados

```
leer → editar → guardar (draft) → publicar (PUT /api/v1/config) → ack
```

- `draft`: el payload se guardó en Webs pero **no** se envió al dispositivo.
- `applied`: el dispositivo respondió `{ "ok": true }` al `PUT /api/v1/config`.
- `failed`: el dispositivo rechazó o el `PUT` falló; se guarda el `error`.

### Qué pasa si el dispositivo rechaza

La versión queda `failed` con el `error` y **la versión anterior sigue
`applied`** (rollback implícito: no se pisa nada). Para reintentar, se publica de
nuevo la versión fallida sin reenviar el payload:

```
POST /devices/:id/config/:version/publish
```

## 5. Límites conocidos

- **Editor JSON, no schema-driven**: la UI expone un editor de JSON libre; no hay
  formulario generado a partir del schema del dispositivo.
- **`PUT /config` completo**: ambos firmwares (Invernadero y SEMA) aceptan
  `PUT /api/v1/config` con el objeto completo; no hay `PATCH` parcial.
- **Sin shadow ni `desired` por MQTT**: el push es **HTTP**
  (`PUT /api/v1/config`). No hay sincronización de estado deseado por MQTT ni
  shadow con revisión.
- **OTA de SEMA**: el OTA centralizado de SEMA sigue sin ser posible sin tocar el
  firmware; esta guía no lo cubre (no lo promete).
- **`hash`**: sha256 del `config` con claves ordenadas; sirve para comparar
  cambios entre versiones (mismo config → mismo hash). No es una firma.

## 6. Permisos

- `iot.write`: `GET /devices/:id/config`, `GET …/versions/:version`,
  `POST /devices/:id/config`, `POST …/:version/publish`.
- `iot.read`: solo `GET …/versions` (listado, sin payload).

El payload de la config del firmware incluye **credenciales** (`api_key`,
`server_key`, WiFi, MQTT), por eso las rutas que devuelven el `config` completo
—la lectura viva y la versión puntual— exigen `iot.write`, no `iot.read`. El
listado (`versions`) solo expone metadatos (sin `config`), por lo que sí queda en
`iot.read`.

Igual que el resto de las rutas IoT: prehandler `authenticate` +
`authorize('iot.read' | 'iot.write')` + `requireTenant`, con 404
cross-tenant/cross-kind.

## 7. Probar con Docker

1. `docker compose up -d --build`.
2. Entrá al panel de Invernadero o SEMA.
3. Seleccioná un dispositivo.
4. Abrí el panel **Configuración**: leé la config viva, editá el JSON, guardá un
   borrador o publicá, y seguí el estado (`draft → applied | failed`) y el
   historial de versiones.

## 8. Referencias

- [Integración REST (Invernadero y SEMA)](integracion-rest.md) — telemetría y endpoints consumidos.
- [Eventos y alarmas IoT](iot-eventos-alarmas.md) — ingesta de eventos/alarmas.
- [Ecosistema de repos](ecosistema.md) — mapa de repos y rol de Webs.
- `apps/api/prisma/schema.prisma` — modelo `IotDeviceConfigVersion` (migración `0017`).
- `plugins/{invernadero,sema}/src/server.ts` — rutas de configuración.
