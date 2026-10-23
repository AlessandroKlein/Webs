# ADR-0010: Sistema de actualización zero-downtime (app + plugins)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 2)
- **Decisión:** Añadir un sistema de actualización **en caliente** con dos botones — uno para la
  **app** y otro para los **plugins** — que: verifica si hay versión nueva (GitHub Releases API
  para la app, `plugin.json`/índice para plugins), descarga el artefacto, valida integridad +
  autenticidad (**sha256** + **firma Ed25519**), y lo aplica **sin dejar de servir**: para la app
  mediante *cluster/reload graceful* (Node bare) o *rolling update* (Docker); para un plugin
  mediante *stage → swap atómico → hot-reload* de **metadata y hooks** (los handlers de ruta se
  refrescan en el próximo reinicio, ver §4). La firma Ed25519 distingue **dos formatos** (§3):
  app/activación = `@licensify/core` (base64url); manifiesto de plugin = raw-bytes + base64
  (node:crypto, mismo que `installRemotePlugin`). Se define un módulo/bootloader de update con
  endpoints `/api/v1/system/update/check|apply|status|rollback` y rollback preservando la
  versión previa.

## Contexto

El usuario pide poder actualizar la plataforma **sin que deje de funcionar**: un botón para la
app y otro para los plugins. Hoy el estado del código es parcial:

- **Versión de la app**: `apps/api/src/modules/system.ts:13` define
  `export const SYSTEM_VERSION = '1.58.0'`; el endpoint `GET /system/version` (línea 17) **ya**
  consulta `https://api.github.com/repos/AlessandroKlein/Webs/releases/latest`
  (`AbortSignal.timeout(5000)`) y devuelve `{ version, latest, hasUpdate }` (offline → fallback a
  `SYSTEM_VERSION`). Falta la **aplicación** de la actualización, no la detección.
- **Versión de plugins**: cada plugin declara `version` en su `plugin.json`; el registro en BD
  (`BlockInstallation.version`, `apps/api/prisma/schema.prisma:569-585`) guarda la instalada, y
  `CatalogItem.hasUpdate`/`installedVersion` (`apps/api/src/plugins/catalog.ts:84-86`) ya la
  compara contra el catálogo. Falta un flujo de actualización **por plugin** con zero-downtime.
- **Descarga + verificación**: `installRemotePlugin` (`loader.ts:363-441`) **ya** descarga
  (`git clone` / `npm pack` / tarball), y **ya exige** `sha256` del manifiesto (integridad) y
  `publicKey`+`signature` Ed25519 (autenticidad) antes de ejecutar código remoto — el mismo
  patrón que `@licensify/core` (ADR-0007) generaliza. `updatePlugin` (`loader.ts:447-480`) hoy
  solo **reescribe la fila en BD** (o reinstala remoto); **no** hace swap atómico ni hot-reload,
  así que el plugin nuevo recién se ve tras reiniciar el proceso (discrepancia ya anotada en
  `plugin-system.md`).

Problema central a resolver: `loadAndActivate` (`loader.ts:173-223`) registra las rutas Fastify
del plugin bajo un scope encapsulado (`app.register(...)`, prefijo `/api/v1/plugins/<id>` y el
shim `/api/v1/blocks/<id>`); para reemplazar un plugin en caliente hay que poder **cerrar ese
scope** y **re-importar** el entry sin que Node devuelva el módulo cacheado.

## Decisión

### 1. Verificación de versión

- **App**: reutilizar la detección de `GET /system/version` (GitHub Releases API). Se compara
  `SYSTEM_VERSION` contra `tag_name` del release (normalizando `v`). `hasUpdate = latest !==
  SYSTEM_VERSION`.
- **Plugins**: para cada plugin instalado, comparar `BlockInstallation.version` contra (a) la
  versión del manifiesto local si existe en `plugins/`, y (b) el `version` de la entrada del
  índice/catálogo remoto (`RegistryPluginEntry.version`, `catalog.ts:37`). Una actualización se
  aplica **solo si** la versión objetivo es estrictamente mayor (semver).

### 2. Descarga del artefacto de release

- **App**: descargar el asset del release (`zip`/`tarball`) señalado en el release de GitHub,
  reutilizando `fetch` con `AbortSignal.timeout` y streaming a disco (no a memoria).
- **Plugin**: reutilizar las tres fuentes de `installRemotePlugin` (`git clone`, `npm pack`,
  tarball directo vía `downloadUrl`), descargando a un **directorio de staging** aislado.

### 3. Integridad y autenticidad (sha256 + Ed25519, dos formatos)

Todo artefacto descargado se valida **antes** de tocarse o ejecutarse. La **integridad** (sha256)
es común; la **autenticidad** (firma Ed25519) usa **dos formatos distintos** que **no** deben
intercambiarse:

| Ámbito | Mensaje firmado | Codificación de la firma | Verificador |
|--------|-----------------|--------------------------|-------------|
| **App** (release) y **activación de licencia** (ADR-0007) | digest sha256 en hex (app) / payload canónico JSON (licencia) | **base64url** | `@licensify/core` `verifyEd25519` (o `verify.ts` del módulo update, que replica el mismo formato) |
| **Manifiesto de plugin** (`plugin.json`) | **raw bytes** del manifiesto | **base64** estándar | `node:crypto` `verify` directamente (`loader.ts:460`, mismo que `installRemotePlugin`) |

- El formato del plugin es el **original** de `installRemotePlugin`/`catalog.ts`: firma sobre los
  **bytes crudos** del manifiesto, codificada en **base64** estándar.
- `@licensify/core` **canonicaliza** el payload y usa **base64url**; por eso **no** sirve para
  verificar firmas de manifiestos de plugin: rechazaría firmas válidas (encoding y
  pre-procesado distintos). El updater de plugins (t28) reutiliza el `verify` de `node:crypto`
  del loader por esa razón.

En ambos casos: clave pública embebida/configurada, clave privada **nunca** en runtime, y
verificación **offline** (sin servidor de licencias/actualizaciones).

### 4. Actualización de PLUGIN (zero-downtime parcial)

La activación de plugins usa el patrón **"registrar-en-boot + gate"** (t46, F9): todas las rutas
de todos los plugins disponibles se registran en el arranque, y cada ruta queda *gateada* por el
estado de instalación (`pluginRegistry.loaded`). **Instalar/desinstalar** un plugin en runtime
sólo cambia ese estado, por lo que sus rutas responden (o vuelven a 404) **de inmediato, sin
reiniciar**. La **actualización** de un plugin (nueva versión) hace *stage → swap atómico →
hot-reload* sin reiniciar la app, pero con una **limitación honesta de Fastify 5**: las rutas
encapsuladas de un plugin **no se pueden des-registrar ni re-registrar en caliente**. En Fastify 5,
`child.close()` de un scope encapsulado es `parent.close()` (vía `plugin-override.js`), y
`route()`/`register()` tras `listen()` arrojan error ("already listening"/"Root plugin has
already booted"). Por tanto, el hot-reload refresca **metadata y hooks** en caliente, mientras que
los **handlers de ruta** de la versión nueva se renuevan en el **próximo reinicio**:

1. **Stage**: descargar/extraer el paquete nuevo a `pluginsDir()/.staging/<id>-<version>-<ts>`.
   Validar sha256 + firma Ed25519 del `plugin.json` (formato raw-bytes + base64, ver §3).
   Parsear el manifiesto.
2. **Pre-parada de hooks**: invocar `serverPlugin.hooks.onDeactivate(ctx)` si existe (se corrige
   el hueco actual, donde no se invoca).
3. **Swap atómico** (mismo filesystem, operación `rename`): mover el directorio actual a
   `pluginsDir()/.backup/<id>-<prevVersion>` y mover el staging a `pluginsDir()/<id>`. Ambas
   renames son atómicas en el mismo volumen; si la segunda falla, se revierte la primera.
   Nota Windows: `fs.rename` no sobrescribe un directorio existente, de ahí el orden
   `old→backup` y luego `staged→old` (no `staged→old` directo).
4. **Hot-reload (metadata + hooks)**: re-importar el entry con **cache-busting** —
   `import(pathToFileURL(entryPath).href + '?v=' + manifest.version)` — para que Node no
   devuelva el módulo cacheado, y re-ejecutar la activación limitada a lo que puede
   refrescarse en caliente: permisos, eventos, traducciones e **items de menú** (no las rutas).
   Las rutas ya estaban registradas desde el boot (gateadas); su *comportamiento HTTP* sigue
   siendo el de la versión booteada hasta el reinicio.
5. **Re-activar en el reinicio**: en el próximo arranque, `loadAndActivate` registra las rutas
   del plugin con la versión nueva (el manifiesto/entry ya quedaron intercambiados por el swap).
   Se actualiza `BlockInstallation` (`version`, `manifest`, `updatedAt`), preservando `config` y
   estado. Invalidar `cacheDel(app.redis, 'blocks:catalog')`.

Si la nueva versión falla el health-check del plugin (ver §6), se revierte automáticamente al
backup.

> **Caveat zero-downtime**: **instalar/desinstalar** activa/desactiva las rutas de inmediato
> (gate en `loaded`). En cambio, al **actualizar** un plugin, el swap y la metadata son inmediatos,
> pero el *comportamiento HTTP* de la versión nueva **no** está activo hasta el reinicio (los
> handlers se registraron en el boot). La app sí es zero-downtime real (rolling update/reload
> graceful); para plugins, el cambio de handlers de ruta requiere reinicio.

### 5. Actualización de APP (zero-downtime)

- **Docker (objetivo k8s, ADR-0008)**: *rolling update* — nueva imagen, `readiness`/`liveness`
  verdes y drenaje del contenedor viejo antes de derribarlo. El botón «actualizar app» dispara
  un deploy declarativo (imagen nueva + health-check), no una mutación en el proceso vivo.
- **Node bare (single-host)**: *cluster / reload graceful* — un **bootloader/supervisor** (módulo
  `apps/api/src/modules/update/`) descarga el asset, lo verifica (sha256 + Ed25519), lo stagea a
  `.update/<version>/`, y orquesta un reinicio graceful: el worker recibe `SIGTERM`, deja de
  aceptar conexiones, drena las peticiones en curso y el supervisor arranca el worker nuevo con
  el código nuevo. Con `cluster` se recicla un worker por vez; en modo single-worker se usa un
  mini-bootloader que re-spawnea el proceso.

### 6. Módulo/bootloader de update y endpoints

Nuevo módulo `apps/api/src/modules/update/` (bootloader + rutas) que expone:

| Endpoint | Método | Permiso | Función |
|----------|--------|---------|---------|
| `/api/v1/system/update/check` | `POST` | `setting.read` | Consulta versiones nuevas de app y plugins; devuelve `{app:{version,latest,hasUpdate,changelog}, plugins:[{id,current,target,hasUpdate}]}`. |
| `/api/v1/system/update/apply` | `POST` | `setting.write` | Aplica una actualización: `{target:'app'\|'plugin', pluginId?}`. Descarga, verifica y aplica (§4/§5). Devuelve un `updateId`. |
| `/api/v1/system/update/status` | `GET` | `setting.read` | Estado del `updateId` en curso: `checking|downloading|verifying|staging|applying|healthcheck|done|rolled_back|failed`. |
| `/api/v1/system/update/rollback` | `POST` | `setting.write` | Revierte a la versión previa preservada en `.backup/` (plugin) o imagen/asset previo (app). |

El estado de una actualización en curso se persiste (cola en memoria + marca en
`apps/api/src/lib/state.ts`) para que `status`/`rollback` sobrevivan a un reinicio parcial; la
aplicación es **idempotente** (re-aplicar sobre un stage ya verificado no re-descarga).

Health-check post-aplicación: antes de dar `done`, se consulta `/health/ready` (app) o el
`onActivate`+rutas (plugin); si no responde en un timeout, se marca `failed` y se ejecuta
rollback automático.

### 7. Rollback preservando la versión previa

- **Plugin**: el swap atómico deja la versión previa íntegra en `.backup/<id>-<prevVersion>`; el
  rollback re-renamea (backup→activo) y re-importa con cache-busting. La versión previa también
  queda registrada en `BlockInstallation` (campo `version` anterior no se borra hasta el
  siguiente update exitoso).
- **App**: se conserva el asset/imagen previo; en Docker el rollback es un redeploy a la imagen
  anterior; en bare se restaura `.update/<prev>/` y se re-spawnea.

### 8. Contrato UI (botones + progreso + changelog + estado + rollback)

- **Botón «Actualizar app»**: visible solo a `setting.write`; muestra versión actual vs. última,
  changelog (release notes de GitHub), y tras aplicar, progreso por fase.
- **Botón «Actualizar» por plugin** (fila del catálogo/panel `/admin/plugins`): si
  `hasUpdate`, muestra `installedVersion → target`, changelog, y aplica vía `apply`.
- **Indicador de progreso/estado** unificado consumiendo `status` (fases de §6), con
  **rollback** habilitado mientras `status ∈ {done, failed}` y haya versión previa.
- Estilo: Tailwind CSS + primitivas Shadcn UI (ADR-0009).

## Consecuencias

**Positivas**

- Actualizaciones **sin downtime para la app** (rolling update/reload graceful) y **casi sin
  downtime para plugins** (swap atómico + metadata/hooks en caliente; solo los handlers de ruta
  esperan al reinicio).
- Reutiliza primitivas ya existentes (`GET /system/version`, `installRemotePlugin`,
  `loadPluginEntry`, `cacheDel`, verificación sha256+Ed25519 del catálogo).
- Coherencia con ADR-0007: la **misma** firma Ed25519 de `@licensify/core` protege licencias y
  distribución de actualizaciones (anti-tamper de extremo a extremo).
- Rollback seguro: el swap atómico + backup hace reversible cada aplicación.

**Negativas / costes**

- **Hot-reload de Fastify 5 (limitación)**: las rutas encapsuladas no se pueden des-registrar en
  caliente (`child.close()` es `parent.close()` y cerraría toda la app); el hot-reload cubre
  metadata (menú/traducciones/permisos) y hooks, pero los handlers de ruta se refrescan en el
  próximo reinicio.
- **Cache-busting**: `import()` con query string funciona en ESM pero no en entradas CJS legadas;
  se prevé un fallback (borrar `require.cache`) o exigir ESM en plugins nuevos.
- **Windows**: `fs.rename` no sobrescribe directorios; el swap en dos pasos (`old→backup`,
  `staged→old`) exige que `.backup/` y `plugins/` estén en el mismo volumen (siempre lo están).
- **App en bare**: el *reload graceful* es más frágil que el rolling update de k8s; se documenta
  como soporte single-host y se prefiere Docker/k8s en producción.

## Notas

- Solo se **documenta** la decisión; la implementación corresponde a backend (módulo `update/` +
  swap atómico + hot-reload), devops (rolling update k8s / bootloader) y frontend (botones +
  progreso + changelog + rollback).
- Relación con ADR-0007: la **app** y la **activación de licencias** comparten el formato de
  `@licensify/core` (canonicalizado + base64url); el **manifiesto de plugin** usa el formato
  raw-bytes + base64 de `installRemotePlugin` (node:crypto). **No** intercambiar los dos
  verificadores (§3). La clave pública del vendor se embebe (nunca la privada).
- Relación con ADR-0008: el rolling update Docker y los health-checks ya descritos en
  `docs/architecture/scalability.md` (`/health`, `/health/ready`) son la base del §5.
- El naming interno `block` (Prisma `BlockInstallation`, `cache 'blocks:catalog'`, shim
  `/api/v1/blocks/<id>`) se mantiene transitorio (ADR-0005); el módulo de update opera con
  `pluginId` como clave de negocio y preserva ese naming interno.
- Riegos y mitigación (resumen): **firma offline** (clave pública embebida, verificación sin
  red; si la clave privada se filtra, rotar + `keyId`, igual que ADR-0007) · **corrupción**
  (sha256 antes de aplicar + swap atómico + backup) · **regresión** (health-check post-aplicación
  + rollback automático) · **reintento** (aplicación idempotente, stage verificado no se
  re-descarga, estado persistido para `status`/`rollback`).
