# Vista RAW/Code de actualizaciones (guía de uso)

> **Guía operativa — ADR-0026 (M12, v2.10.0).** Cómo auditar, desde `/admin/updates`,
> los **datos crudos verificados** de una actualización de la **app** o de un **plugin**
> (manifiesto, changelog, archivos, `sha256`, firma Ed25519 y clave pública), sin filtrar
> secretos ni claves privadas.

## 1. Qué es y para quién

Antes de pulsar «Actualizar», la plataforma ya descarga y **verifica** cada artefacto
(sha256 + firma Ed25519). La vista RAW expone **esa misma evidencia** para que un
**operador/admin** pueda auditar de forma independiente qué se va a instalar, comparar el hash
y la firma contra la clave pública, y conservar una copia (copiar/descargar).

- **Quién**: roles con el permiso `update.manage` (`super_admin` y `admin` sembrados por
  defecto).
- **Qué NO expone**: la **clave privada** (nunca está en runtime) ni valores sensibles
  (tokens/claves, redactados como `«redacted»`).
- **Qué sí expone**: manifiesto, changelog, lista de archivos, `sha256` del artefacto/manifiesto,
  la **firma Ed25519** y la **clave pública**.

## 2. Dónde se usa

1. Entrá a **`/admin/updates`** (menú «Actualizaciones», permiso `setting.read`).
2. En el bloque **Plataforma** (app) o en cada tarjeta de **plugin**, pulsá el botón
   **«Ver datos (RAW)»** (app) o **«Datos (RAW)»** (plugin). Se abre el panel secundario; el
   mismo botón cambia a **«Ocultar datos (RAW)»** para cerrarlo.

> La vista resumida (estado, changelog renderizado y botones de acción) sigue siendo la
> predeterminada; el panel RAW es un complemento de auditoría.

## 3. Qué muestra el panel RAW

El panel (`RawUpdateView`) muestra un **badge** con el ámbito y la versión (`App · v2.10.0` /
`Plugin · v1.2.0`), el `sha256` truncado del artefacto, y debajo el payload crudo en un bloque
de código con:

- **Toggle `JSON | YAML`** (`SegmentedControl`): JSON por defecto; YAML se obtiene re-consultando
  el endpoint con `format=yaml`.
- **Copiar** (`navigator.clipboard.writeText`, con confirmación «Copiado»).
- **Descargar** (`Blob` + `download`, nombre `update-raw-<target>.json|.yaml`).

El resaltado de sintaxis es **autocontenido y sin dependencias** (`SyntaxHighlight.tsx`):
colorea claves, strings, números, booleanos/null, puntuación y comentarios YAML mediante clases
`.tok-*` definidas en `apps/web/src/styles.css` (sin CDN ni librerías de pago).

## 4. Endpoint

```
GET /api/v1/system/update/raw?target=app|plugin[&id=<pluginId>][&version=<semver>][&format=json|yaml]
```

| Parámetro | Obligatorio | Descripción |
|-----------|-------------|-------------|
| `target` | sí | `app` o `plugin`. |
| `id` | solo `plugin` | `pluginId` (por ejemplo `mercadopago`). |
| `version` | no | Versión a auditar (sin `v`). Por defecto la última disponible (`latest` para app, la del catálogo para plugin). |
| `format` | no | `json` (default) o `yaml`. `yaml` devuelve `Content-Type: text/yaml` + `Content-Disposition: attachment`. |

- **Auth**: `authenticate` + `authorize('update.manage')` (permiso nuevo, sembrado a
  `super_admin`/`admin`).
- **Errores**: `400` (`target` inválido, `target=plugin` sin `id`), `403` (sin permiso), `404`
  (release/plugin inexistente).

**Nota**: el endpoint **no re-descarga** el artefacto; solo re-expone la metadata ya resuelta por
el updater/catálogo.

### 4.1 Ámbito `app`

Resuelve contra GitHub Releases (`releases/latest` o `releases/tags/v<version>`):

- `files[]` = `assets[]` (`name`, `browser_download_url`, `size`).
- `integrity.sha256` = sidecar `<asset>.sha256`.
- `signature.value` = sidecar `<asset>.sig` (`base64url`), `publicKeyPem` = `UPDATE_PUBLIC_KEY`.
- `changelog` = `body` del release (markdown).

### 4.2 Ámbito `plugin`

Resuelve contra `findRemotePlugin(id)` + `PluginInstallation.manifest` persistido:

- `integrity.sha256` = `RegistryPluginEntry.sha256`.
- `signature.value` = `RegistryPluginEntry.signature` (`base64` estándar sobre bytes raw del
  `plugin.json`), `publicKeyPem` = `publicKey`.
- `files[]` = `entry`/`clientEntry` del manifiesto.

## 5. Forma del payload

```jsonc
{
  "kind": "app",                  // "app" | "plugin"
  "id": null,                     // pluginId (plugin) o null (app)
  "name": "Webs",                 // name del plugin / "Webs"
  "version": "2.10.0",            // versión consultada (sin 'v')
  "manifest": { /* … */ },        // redactado (§6)
  "changelog": "…",               // markdown (app) o null (plugin)
  "files": [ { "path": "dist/index.js", "url": "…", "size": 123, "sha256": "…" } ],
  "integrity": { "sha256": "…" },
  "signature": {
    "algorithm": "ed25519",
    "encoding": "base64url",      // app/activación = base64url; plugin = base64
    "value": "…",
    "publicKeyPem": "…"
  },
  "source": { "url": "…", "releasedAt": "…" }
}
```

## 6. Redacción de campos sensibles

Antes de serializar, `redact()` aplica:

1. **Denylist de claves** (`isSensitiveKey`): `secret`, `token`, `password`, `passphrase`,
   `privateKey`, `cert`, `key` (y variantes `apikey`/`secretkey`/`signingkey`/`accesskey`/
   `clientsecret`). Excepción explícita: `publicKey` **no** se redacta (es pública).
2. **Heurística de patrón** (`redactStringValue`): valores `BEGIN … PRIVATE KEY`, `sk-…`,
   `xox…`, `ghp_…`/`ghs_…`, `AIza…` → `«redacted»`.

Es una mitigación **defensa en profundidad**, no una garantía (misma honestidad que
`docs/architecture/licensing-integration.md` → «Límites»).

## 7. Verificación rápida

```bash
# App (última release)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/v1/system/update/raw?target=app" | jq .

# Plugin, versión concreta, en YAML
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/v1/system/update/raw?target=plugin&id=mercadopago&format=yaml"
```

- Con `update.manage` → `200` con el payload.
- Sin token → `401`; con rol sin `update.manage` → `403`.

## 8. Referencias

- `docs/adr/0026-update-raw-view.md` (decisión) y `docs/architecture/update-raw-view.md` (spec).
- `docs/adr/0010-update-system.md` (sha256 + Ed25519, formatos de firma).
- Código: `apps/api/src/modules/update/raw.ts` (endpoint + `redact`/`toYaml`) y
  `apps/web/src/features/updates/{RawUpdateView,SyntaxHighlight}.tsx`.
