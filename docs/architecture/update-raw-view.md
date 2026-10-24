# Vista RAW/Code de los datos de actualización

> **Spec técnica — ADR-0026 (M12, v2.10.0) — implementado.** Expone los metadatos verificados
> (sha256 + firma Ed25519) de una actualización de la **app** o de un **plugin** en un payload
> JSON/YAML auditable, con redacción de secretos, protegido por `update.manage`, y una vista
> `/admin/updates` con resaltado de sintaxis autohospedado y copiar/descargar.
>
> **Estado**: backend `apps/api/src/modules/update/raw.ts` (t161) + frontend
> `apps/web/src/features/updates/{RawUpdateView,SyntaxHighlight}.tsx` (t162), permiso
> `update.manage` sembrado. Guía de uso: `docs/guides/update-raw-view.md`.

## 1. Objetivo y alcance

El updater (ADR-0010) ya verifica integridad y firma, pero la evidencia queda **interna**. Esta
feature hace visible esa evidencia para que un **operador** pueda auditar qué se va a instalar
(manifiesto, changelog, archivos, hash, firma y clave pública) **sin filtrar secretos ni claves
privadas**, y sin introducir dependencias externas (CDN/lib de resaltado de pago).

- **In scope**: endpoint `GET /api/v1/system/update/raw` (app + plugin), redacción de campos
  sensibles, permiso `update.manage`, bloque «Datos crudos (RAW)» en `/admin/updates` (toggle
  JSON/YAML + resaltado autohospedado + copiar/descargar).
- **Out of scope**: modificar el flujo de apply/rollback (sigue en `setting.write`); re-descargar
  artefactos; migrar los permisos existentes de update a `update.manage`.

## 2. Contrato del endpoint

```
GET /api/v1/system/update/raw?target=app|plugin&id=<pluginId>&version=<semver>&format=json|yaml
```

| Parámetro | Obligatorio | Valores | Descripción |
|-----------|-------------|---------|-------------|
| `target` | sí | `app` \| `plugin` | Ámbito de la consulta. |
| `id` | solo `plugin` | `pluginId` | Identificador del plugin instalado. |
| `version` | no | semver sin `v` | Por defecto: última disponible (`latest` para app, `RegistryPluginEntry.version` para plugin). |
| `format` | no | `json` \| `yaml` | Default `json`. `yaml` devuelve `Content-Type: text/yaml` + `Content-Disposition: attachment`. |

- **Auth**: `authenticate` + `authorize('update.manage')` (nuevo permiso, §5).
- **Cache**: sin cache server-side (cada request resuelve la metadata en vivo); el cliente usa
  `react-query` (`queryKey: ['update-raw', target, id, version]`), que desduplica y cachea por
  sesión de UI.
- **Errores**: `400` (`target` inválido o `target=plugin` sin `id`), `403` (sin `update.manage`),
  `404` (release/plugin inexistente).

## 3. Payload (JSON canónico)

Forma común para app y plugin, discriminada por `kind`:

```jsonc
{
  "kind": "app",                       // "app" | "plugin"
  "id": null,                          // pluginId (plugin) o null (app)
  "name": "Webs",                      // name del plugin / "Webs"
  "version": "2.10.0",                 // versión consultada (sin 'v')
  "manifest": {                        // ver §4 (difiere app vs plugin)
    // ...
  },
  "changelog": "…",                    // markdown: release.body (app) / changelog del plugin
  "files": [                           // archivos que componen el artefacto
    { "path": "dist/index.js", "sha256": "…" }
  ],
  "integrity": { "sha256": "…" },      // digest del artefacto/manifiesto verificado
  "signature": {
    "algorithm": "ed25519",
    "encoding": "base64url",           // app/activación = base64url; manifiesto plugin = base64 std
    "value": "…",                      // la firma pública del release
    "publicKeyPem": "…"                // clave pública (la privada NUNCA está en runtime)
  },
  "source": { "url": "…", "releasedAt": "…" }
}
```

> **Sin claves privadas**: la privada nunca se embebe (ADR-0010 §3, ADR-0007). Aquí solo se
> re-expone la **pública** y la **firma**, que ya son datos públicos del release/manifiesto.

## 4. Fuente de `manifest` y `files` por ámbito

### 4.1 App (`target=app`)

- `manifest` = metadatos del release de GitHub (`tag_name`, `name`, `html_url`, `published_at`,
  `target_commitish`), sin redactar (son públicos).
- `changelog` = `release.body` (markdown del release).
- `files[]` = `release.assets[]` (`name`, `browser_download_url`, `size`) + el digest de cada
  sidecar `.sha256` cuando existe.
- `integrity.sha256` = contenido del sidecar `<asset>.sha256` (verificado en `runApply()`).
- `signature` = sidecar `<asset>.sig` (base64url) + `UPDATE_PUBLIC_KEY` (config).

Fuente implementada: `apps/api/src/modules/update/service.ts` `checkUpdate()` (GitHub API
`releases/latest` o `releases/tags/v<version>`, `AbortSignal.timeout(5000)`, fallback offline
`SYSTEM_VERSION`); `verify.ts` `sha256File()` + `verifyEd25519(digest, signature, UPDATE_PUBLIC_KEY)`.

### 4.2 Plugin (`target=plugin`)

- `manifest` = `PluginInstallation.manifest` persistido + `RegistryPluginEntry` del catálogo
  (`id`, `name`, `version`, `displayName`, `description`, `author`, `license`, `homepage`, `icon`,
  `source`, `url`, `feature`), **con los `settings` tipados secreto redactados** (§6).
- `changelog` = campo `changelog` del manifiesto si existe; si no, se omite.
- `files[]` = `entry`/`clientEntry` + listado del tarball/git (`subdir`) cuando esté disponible;
  si el índice no lo trae, se omite (`files: []`).
- `integrity.sha256` = `RegistryPluginEntry.sha256` (manifiesto verificado en la instalación).
- `signature` = `RegistryPluginEntry.signature` + `publicKey` (la verificación es sobre el
  `plugin.json` en **base64 estándar raw-bytes**, distinto del formato app).

Fuente implementada: `apps/api/src/plugins/catalog.ts` `RegistryPluginEntry` (líneas 36-65) +
`apps/api/src/modules/update/plugins.ts` `checkPluginUpdates()`.

## 5. Permiso `update.manage`

| Acción | Permiso |
|--------|---------|
| `GET /api/v1/system/update/raw` | `update.manage` (nuevo) |
| `POST /system/update/check`, `GET /system/update/status` | `setting.read` (existente, sin cambios) |
| `POST /system/update/apply`, `POST /system/update/rollback` | `setting.write` (existente, sin cambios) |

- Añadir `update.manage` a: `packages/core/src/constants.ts`, `packages/core/src/permissions.ts`
  (área `update`), `packages/core/src/seed.ts` (sembrado a `super_admin` + `admin`).
- `AdminLayout` muestra el bloque RAW solo a `update.manage` (el nav `/admin/updates` actual usa
  `setting.read`, que se mantiene).

## 6. Redacción de campos sensibles

En el **serializador** del endpoint (no se muta la metadata guardada):

1. **Denylist de claves** (case-insensitive, coincidencia parcial): `secret`, `token`, `apiKey`,
   `password`, `privateKey`, `cert`, `key`, `credential` → valor sustituido por `"«redacted»"`.
2. **Heurística de patrón**: valores que empiecen con `-----BEGIN PRIVATE KEY-----`, `sk-`, `xox`,
   o base64 largos (> 64 chars) en campos de configuración → `"«redacted»"`.
3. **Manifiesto de plugin**: los `settings` tipados `x-ui.secret` (patrón ya usado en
   `facturacion`/`arca`) salen redactados.

Se documenta como mitigación **defensa en profundidad**, no como garantía (misma honestidad que
`docs/architecture/licensing-integration.md` → "Límites").

## 7. Frontend `/admin/updates` — bloque «Datos crudos (RAW)» (implementado)

- **Componentes** (bajo `apps/web/src/features/updates/`):
  - `RawUpdateView.tsx` (118 líneas): panel secundario que recibe `target`/`id`/`version`; hace
    `useQuery` a `GET /system/update/raw?…&format=json` (y, solo al elegir YAML, un segundo
    `useQuery` a `…&format=yaml` vía `getText`); renderiza **badge** `App · vX` / `Plugin · vX`,
    `sha256` truncado, `SegmentedControl` JSON/YAML y botones **Copiar**/`Descargar`. Los botones
    se abren/cierran con **«Ver datos (RAW)»**/«Ocultar datos (RAW)» (app, `AppUpdater.tsx:153`) y
    **«Datos (RAW)»**/«Ocultar datos (RAW)» (plugin, `PluginUpdater.tsx:147`).
  - `SyntaxHighlight.tsx` (90 líneas): tokenizador **autocontenido y sin dependencias** — regex
    JSON (`JSON_RE`) y YAML (`YAML_RE`) que emiten `<span class="tok-key|tok-string|tok-number|
    tok-keyword|tok-punct|tok-comment">`; clases `.tok-*` en `apps/web/src/styles.css`. Exporta
    `CodeBlock` (`<pre class="raw-code">` con `role="region"`) y el tipo `RawFormat`.
- **Toggle** `JSON | YAML` re-consulta con `?format=yaml`; **Copiar** usa `copyText()` +
  confirmación «Copiado»; **Descargar** usa `downloadFile()` con nombre `update-raw-<target>.<ext>`.
- **Estilo**: Tailwind CSS v4 + primitivas Shadcn UI (ADR-0009); tokens de espacio `var(--ws-space-*)`.
- **i18n**: claves `updates.raw.*` en `packages/i18n/src/locales/{es,en,pt}.ts` (t163).
- **Contrato TS**: `RawUpdatePayload`/`RawUpdateFile`/`RawUpdateSignature` en `updates-api.ts:150-173`.

## 8. Seguridad y rendimiento

- **Redacción** previa a la serialización (§6); nunca se exponen claves privadas (§3).
- **Gate por permiso** `update.manage` (solo operadores).
- **Sin SSRF**: el endpoint no descarga artefactos; solo re-expone metadata ya resuelta por el
  updater/catálogo (las URLs de `source.url`/`files[].url` se muestran, no se fetch).
- **CSP**: el resaltador es 100% local (sin inline eval), compatible con el CSP del shell.
- **`fetch` acotado**: `AbortSignal.timeout(10_000)` en las llamadas a GitHub y a los sidecars
  `.sha256`/`.sig`.

## 9. Trazabilidad M12 (docs/backlog.md §3.14)

| Work-item | Tarea | Entregable |
|-----------|-------|------------|
| WB-182 | t160 | ADR-0026 + esta spec. |
| WB-183 | t161 | Endpoint `/system/update/raw` + redacción + permiso `update.manage`. |
| WB-184 | t162 | UI `/admin/updates` bloque RAW (toggle JSON/YAML + resaltador + copiar/descargar). |
| WB-185 | t163 | i18n `updates.raw.*` (es/en/pt). |
| WB-186 | t164 | Docs (guía + referencia) sincronizadas a Docs.git. |
| WB-187 | t165 | QA end-to-end. |
| WB-188 | t166 | Release v2.10.0. |

## 10. Referencias

- `docs/adr/0010-update-system.md` (sistema de actualización, sha256 + Ed25519).
- `docs/adr/0026-update-raw-view.md` (esta decisión).
- `docs/adr/0007-licensing.md` + `docs/architecture/licensing-integration.md` (claves/firma, límites).
- `docs/architecture/politica-dependencias.md` (sin CDN/pago).
- `docs/adr/0009-ui-styling.md` (Tailwind + Shadcn).
