# Ecosistema de repos — Webs

Mapa de los repositorios del ecosistema y cómo se relacionan con **Webs**
(este repositorio), que actúa como **servidor central** de los proyectos
satélite a través de plugins instalables.

## Mapa de repos

| Repositorio | Rol | Integración con Webs |
|-------------|-----|----------------------|
| `AlessandroKlein/Webs` (este repo) | **Servidor central / hub multi-tenant** | Plataforma base (API + web + plugins). |
| `AlessandroKlein/Docs` (repo `../Docs`) | Sitio de documentación publicado (MkDocs Material) | Espejo de `Webs/docs/` → `docs/es/webs/` vía `scripts/sync-docs-to-central.mjs` (no destructivo). |
| `git@github.com:AlessandroKlein/Licensify.git` | Sistema de licencias **offline** (activación, firma Ed25519, node-locking) | Integrado como `apps/api/src/modules/licenses`; ver [ADR-0007](../adr/0007-licensing.md) y [architecture/licensing-integration.md](../architecture/licensing-integration.md). |
| `git@github.com:AlessandroKlein/Invernadero.git` | Invernadero; tiene rama **`server`** (su propio servidor central) | Plugin [`plugins/invernadero`](../../plugins/invernadero). |
| `git@github.com:AlessandroKlein/SEMA.git` | Estación meteorológica / nodo de monitoreo ambiental y energía | Plugin [`plugins/sema`](../../plugins/sema). |

## Webs como servidor central

Webs no reimplementa la lógica de cada proyecto: cada satélite sigue teniendo su
propio repositorio y su propia API HTTP. Webs lo integra con un **plugin IoT** que
actúa como colector y consolidador central:

- El plugin sondea la API del dispositivo (`GET /status`), normaliza el payload a
  métricas y las guarda en la base de tiempo separada `webs_iot` (ver
  [ADR-0027](../adr/0027-iot-serie-temporal.md) y
  [architecture/iot-serie-temporal.md](../architecture/iot-serie-temporal.md)).
- La lógica compartida vive en el paquete `@webs/iot` (`createIotDeviceClient`,
  `createIotPool`, `startCollector`, `registerIotDeviceRoutes`); cada plugin solo
  aporta el **mapeo de payload** y la lista de `kinds`.

### Invernadero

- Plugin: [`plugins/invernadero`](../../plugins/invernadero) — `@webs/plugin-invernadero`.
- `plugin.json` lo define como «Integración de invernadero: telemetría REST, serie
  temporal local y control de actuadores».
- `plugins/invernadero/src/server.ts` registra `kinds: ['invernadero']`, sondea
  `GET /devices/:id/status`, y expone `POST /devices/:id/actuators` con roles
  `pump|valve|fan|extractor|heater|humidifier|light|roof|window|shade|alarm`
  (`ACTUATOR_ROLES`).
- El mapeo de payload cubre temperatura, humedad, humedad de suelo por zona, nivel
  de tanque, luz, bomba/ventilador y alarmas severas (`mapStatusToMeasurements`).

> Relación con la rama `server` del repo Invernadero: el repo Invernadero ya tiene
> su propio servidor central (rama `server`). El plugin de Webs integra la **API
> HTTP del dispositivo** (telemetría + actuadores) como colector central; **no
> reemplaza ni duplica** la rama `server`. Si el objetivo es que Webs sustituya a
> ese servidor, es una decisión **pendiente** de definir (no hay migración
> implementada en el repo).

### SEMA

- Plugin: [`plugins/sema`](../../plugins/sema) — `@webs/plugin-sema`.
- `plugin.json`: «Nodo de monitoreo ambiental/energía SEMA: telemetría REST y serie
  temporal local».
- `plugins/sema/src/server.ts` registra `kinds: ['sema']`, sondea `GET
  /devices/:id/status` y autentica con `X-API-Key` (`authMode: 'x-api-key'`; la key
  es opcional, la lectura puede ser pública). Cubre temperatura EXT/INT, humedad,
  energía y alarmas, además de sensores anidados (`mapSemaToMeasurements`).

### Licensify

- No es un plugin: es un sistema de licencias **local/offline** integrado en el
  núcleo (`apps/api/src/modules/licenses`). Webs consume su modelo de activación
  (clave + firma Ed25519 + node-locking + feature-gating) para habilitar features
  premium de los plugins. Ver [ADR-0007](../adr/0007-licensing.md) y
  [ADR-0019](../adr/0019-feature-gating.md).

## Cómo se integra un proyecto nuevo (resumen)

1. Crear un plugin en `plugins/<id>` con `plugin.json` (categoría `integracion`) y
   `src/server.ts`.
2. Reutilizar `@webs/iot`: `registerIotDeviceRoutes` + `startCollector` + un mapeo
   `parse: payload → Measurement[]`.
3. Registrar `kinds` y el `authMode` del dispositivo (Bearer / X-Auth-Token /
   X-API-Key), y ajustar `ssrfAllowlist` si hace falta.
4. El plugin queda gobernado por el CRUD de dispositivos y la serie temporal
   central de `webs_iot`.

> Pendiente: no hay aún documentación del contrato HTTP exacto de los repos
> externos (`Invernadero/server`, `SEMA`) en este repo; se conoce solo el mapeo
> tolerante de payload implementado en los plugins.
