# ADR-0026: Vista RAW/Code de los datos de actualización

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 12 — v2.10.0)
- **Decisión:** Añadir un endpoint `GET /api/v1/system/update/raw` que exponga, para la **app** y
  para un **plugin**, los **datos crudos verificados** de una actualización — manifiesto, changelog,
  archivos cambiados, `sha256` y **firma Ed25519** (con la clave pública, **nunca** la privada) — en
  un payload **JSON canónico** (y **YAML** opcional), con **redacción de campos sensibles** antes de
  exponer, protegido por el permiso admin **`update.manage`**, y una vista `/admin/updates` con
  **toggle JSON/YAML**, **resaltado de sintaxis autohospedado** (sin CDN ni dependencias de pago) y
  **copiar/descargar**.

## Contexto

El sistema de actualización (ADR-0010) ya verifica **sha256 + firma Ed25519** de cada artefacto
antes de aplicarlo, pero esa evidencia queda **interna** y el operador no puede auditarla desde la
UI. Hoy:

- **App**: `apps/api/src/modules/update/service.ts` consulta GitHub Releases
  (`checkUpdate()` → `AppUpdateInfo { version, latest, hasUpdate, changelog, tag, releaseUrl,
  publishedAt }`); la verificación se hace en `runApply()` con `sha256File()` +
  `verifyEd25519(digest, signature, UPDATE_PUBLIC_KEY)` (`verify.ts`). Los artefactos publican
  sidecars `<asset>.sha256` y `<asset>.sig` (firma base64url sobre el digest hex).
- **Plugins**: `apps/api/src/modules/update/plugins.ts` compara
  `PluginInstallation.version` contra `findRemotePlugin(id)` (`RegistryPluginEntry`), que ya trae
  `sha256`, `publicKey` y `signature` del manifiesto (`apps/api/src/plugins/catalog.ts:55-60`).
- **Frontend**: `apps/web/src/features/updates/UpdatesPage.tsx` solo muestra un **Changelog
  renderizado** (`components/ui/Changelog.tsx` convierte el markdown del release en notas); no hay
  ninguna vista **RAW/code**, y **no existe** ningún resaltador de sintaxis en `apps/web` (grep
  `highlight|prism|hljs|shiki|monaco|codemirror` → 0 matches).
- **Permisos**: los endpoints de update usan `setting.read` (check/status) y `setting.write`
  (apply/rollback) — `apps/api/src/modules/update/index.ts:15,43,68,81`. **No** existe un permiso
  `update.manage`.

Problema a resolver: exponer los metadatos **verificados** (no re-verificados, sino los mismos que
el updater usó) de forma **auditable y legible**, sin filtrar secretos ni claves privadas, y con
una UI que resalte el código **sin depender de CDN ni servicios de pago** (coherente con
`docs/architecture/politica-dependencias.md`).

## Decisión

### 1. Formato del payload crudo: JSON canónico + YAML opcional

- **JSON canónico** es el formato primario (`Content-Type: application/json`): claves en orden
  estable y determinista, sin campos redundantes, derivado de la metadata verificada de ADR-0010.
- **YAML** es opcional y derivado del mismo objeto (`?format=yaml` → `Content-Type: text/yaml` +
  `Content-Disposition: attachment`), para operadores que versionan manifiestos en Git.

El payload es **el mismo objeto** para app y plugin (forma común), con `kind` que discrimina:

```jsonc
{
  "kind": "app",                    // "app" | "plugin"
  "id": null,                       // pluginId (plugin) o null (app)
  "name": "Webs",                   // name del plugin / "Webs" para app
  "version": "2.10.0",              // versión consultada (sin 'v')
  "manifest": { /* ... */ },        // ver §2
  "changelog": "…",                 // markdown (app: release.body; plugin: CHANGELOG/field)
  "files": [ { "path": "dist/index.js", "sha256": "…" } ],
  "integrity": { "sha256": "…" },   // digest del artefacto/manifiesto
  "signature": {
    "algorithm": "ed25519",
    "encoding": "base64url",        // app (y licencia) — base64 estándar para manifiesto de plugin
    "value": "…",                   // la firma pública
    "publicKeyPem": "…"             // clave pública (nunca la privada)
  },
  "source": { "url": "…", "releasedAt": "…" }
}
```

### 2. Endpoint `GET /api/v1/system/update/raw`

| Parámetro | Valores | Descripción |
|-----------|---------|-------------|
| `target` | `app` \| `plugin` | Ámbito de la consulta. |
| `id` | (plugin) `pluginId` | Obligatorio cuando `target=plugin`. |
| `version` | semver sin `v` | Opcional; por defecto la última disponible (`latest` / `RegistryPluginEntry.version`). |
| `format` | `json` \| `yaml` | Default `json`. |

Fuentes de datos (no se re-descarga el artefacto; solo se exponen los metadatos ya resueltos):

- **App**: GitHub Releases API (`releases/latest` o `releases/tags/v<version>`): `tag_name`,
  `html_url`, `published_at`, `body` (changelog), `assets[]` (archivos + `browser_download_url` +
  `size`) → `files[]`; los sidecars `.sha256`/`.sig` del asset dan `integrity.sha256` y
  `signature.value`. `publicKeyPem` sale de `UPDATE_PUBLIC_KEY` (config, ya presente en runtime).
- **Plugin**: `RegistryPluginEntry` (`catalog.ts`) + `PluginInstallation.manifest` persistido:
  `sha256` → `integrity.sha256`, `signature` → `signature.value`, `publicKey` → `signature.publicKeyPem`,
  `version`/`displayName`/`description`/`license`/`homepage` → `manifest`, y `files[]` del
  `entry`/`clientEntry` + listado del tarball/git (o campo `files` del índice si se añade).

> **Sin claves privadas**: la clave privada nunca está en runtime (ADR-0010 §3, ADR-0007). El
> endpoint solo re-expone la **pública** y la firma (que ya son datos públicos del release).

### 3. Redacción de campos sensibles

Antes de serializar, se **redacta** todo valor que luzca como secreto, para que la vista RAW sea
auditable sin filtrar credenciales:

- **Nunca** se exponen: `UPDATE_PUBLIC_KEY` es pública (OK), pero cualquier `secret`, `token`,
  `apiKey`, `password`, `privateKey`, `cert`, `key` se sustituye por `"«redacted»"`.
- Se aplica una **denylist de claves** + **heurística de patrón** (p. ej. valores base64 largos,
  `BEGIN PRIVATE KEY`, `sk-…`, `xox…`) — misma intención que la redacción de `pino`
  (`authorization`/`cookie`/`password`/`refreshToken`, ADR-0008).
- El `manifest` de plugin se serializa **redactado**: los `settings` tipados como secreto
  (`x-ui.secret`, patrón ya usado en `facturacion`/`arca`) salen como `"«redacted»"`.

La redacción ocurre **en el serializador** del endpoint (no se muta la metadata guardada).

### 4. Permisos admin: `update.manage`

- Se introduce el permiso **`update.manage`** (área `update`) en el catálogo canónico
  (`packages/core/src/permissions.ts` + `packages/core/src/constants.ts` + `seed.ts`), sembrado a
  `super_admin` y `admin`.
- `GET /api/v1/system/update/raw` requiere `authenticate` + `authorize('update.manage')`: el payload
  expone hashes/firmas/lista de archivos que solo un **operador** debería auditar.
- Los endpoints existentes de apply/rollback mantienen `setting.write` (no se migran en M12); la
  decisión deja abierto migrarlos a `update.manage` en un pase posterior para no romper RBAC vigente.

### 5. Render frontend: resaltado autohospedado + toggle + copiar/descargar

- **Resaltado autohospedado**: un tokenizador liviano propio en `apps/web/src/lib/` (regex
  orientado a JSON/YAML: claves, strings, números, booleanos, comentarios YAML, null) que emite
  `<span class="tok-…">`; **cero dependencias externas** y **sin CDN** (coherente con
  `politica-dependencias.md`).
- **Toggle JSON/YAML**: re-consulta el mismo endpoint con `format=yaml` (o serializa el objeto ya
  obtenido), manteniendo el estado en la URL (`?format=`).
- **Copiar** (`navigator.clipboard.writeText`) y **Descargar** (`Blob` + `download`), reusando el
  patrón de `ScalingPage` (export YAML) y `generated` (copiar/descargar SDK).
- Ubicación: dentro de `/admin/updates` (`UpdatesPage`), un tercer bloque «Datos crudos (RAW)» junto
  a «Plataforma» y «Plugins», visible solo a `update.manage`. Estilo Tailwind + Shadcn (ADR-0009).

## Consecuencias

**Positivas**

- **Auditabilidad**: el operador puede verificar de forma independiente `sha256` + `signature` +
  clave pública antes/después de actualizar (misma evidencia que usó el updater, no una copia).
- **Sin superficie de ataque nueva**: sin claves privadas, con redacción de secretos y gated por
  `update.manage`.
- **Coherencia**: reutiliza el formato de firma de ADR-0010/ADR-0007 y la política "sin CDN/pago".
- **Sin dependencias**: el resaltador es autohospedado, no añade paquetes ni carga remota.

**Negativas / costes**

- **Permiso nuevo** `update.manage` a sembrar y a mapear en `AdminLayout` (nav `setting.read` hoy).
- **Redacción heurística**: la denylist/patrón puede no capturar un secreto con nombre atípico; se
  documenta como mitigación "defensa en profundidad", no como garantía (honesto, igual que
  `licensing-integration.md` → "Límites").
- **`files[]` de plugins**: si el índice no trae listado, derivarlo del tarball añade un paso; se
  deja como campo opcional y se omite cuando no está disponible.

## Notas

- Solo se **documenta** la decisión; la implementación corresponde a backend (endpoint `raw` +
  redacción + permiso `update.manage`, **t161**) y frontend (toggle JSON/YAML + resaltador + copiar/
  descargar, **t162**), i18n (**t163**), docs (**t164**), QA (**t165**) y release v2.10.0 (**t166**).
- Trazabilidad M12: `docs/backlog.md` §3.14, WB-182→WB-188.
- Spec técnica: `docs/architecture/update-raw-view.md`.
- Relación con ADR-0010 (dos formatos de firma: app/activación = base64url; manifiesto de plugin =
  base64 estándar raw-bytes). El `signature.encoding` del payload refleja esa distinción.
- Relación con ADR-0007 (`@licensify/core`), ADR-0009 (estilo UI) y `politica-dependencias.md`
  (sin CDN/pago). La clave pública se embebe; la privada nunca está presente.
