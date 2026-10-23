# Marketplace de plugins — fuente remota (GitHub)

Webs instala plugins desde un **catálogo** cuyo origen real es un registro
remoto (GitHub / npm). Desde M5 (ADR-0016), el catálogo **ya no muestra los
plugins del repo como «local»**: cada plugin declara su `repository` y, al
instalar, se **descarga y verifica** desde su fuente.

## Cómo se resuelve el origen

Cada plugin declara su origen en el `plugin.json`:

```json
{
  "id": "store",
  "name": "@webs/plugin-store",
  "version": "1.0.0",
  "type": "plugin",
  "repository": "https://github.com/AlessandroKlein/Webs",
  "source": "git",
  "subdir": "plugins/store"
}
```

| Campo | Descripción |
|-------|-------------|
| `repository` | URL del repositorio GitHub (origen canónico). |
| `source` | `git` (clonado) o `npm` (paquete). |
| `subdir` | Subdirectorio del repo que contiene el plugin (monorepos). |

La resolución del origen (helper `buildCatalog` en `apps/api/src/plugins/catalog.ts`) es:

1. `source` del manifiesto (`plugin.json`).
2. Si no, `source` de la entrada del registro (`catalog.json` / índice remoto).
3. Si no, `git` cuando el manifiesto declara `repository`.
4. `local` queda **solo como marcador interno** (paquete en disco, modo dev).

## Formato del índice

Un archivo JSON con una lista de plugins (el mismo registro de terceros):

```json
{
  "name": "Webs Plugin Registry",
  "plugins": [
    {
      "id": "store",
      "name": "@acme/plugin-store",
      "version": "1.0.0",
      "displayName": { "es": "Tienda", "en": "Store" },
      "description": { "es": "Catálogo de productos.", "en": "Product catalog." },
      "author": "Acme",
      "license": "MIT",
      "homepage": "https://github.com/acme/plugin-store",
      "icon": "https://acme.example/store.png",
      "source": "git",
      "url": "https://github.com/acme/plugin-store.git",
      "subdir": "plugin",
      "sha256": "…",
      "publicKey": "-----BEGIN PUBLIC KEY-----…",
      "signature": "…"
    }
  ]
}
```

| Campo | Descripción |
| ----- | ----------- |
| `id` | Identificador único (coincide con el `id` del `plugin.json`). |
| `name` / `version` | Nombre del paquete y versión. |
| `displayName` / `description` | Textos localizados (`es`, `en`, …). |
| `icon` / `author` / `license` / `homepage` | Metadatos del creador. |
| `source` | `git` (clonado) o `npm` (paquete). |
| `url` | URL del repositorio git (o paquete npm). |
| `downloadUrl` | URL directa de un tarball `.tgz`/`.tar.gz` (alternativa a git/npm). |
| `subdir` | Subdirectorio del repo que contiene el plugin (monorepos). |
| `sha256` | SHA-256 del `plugin.json` (integridad). |
| `publicKey` / `signature` | Clave pública Ed25519 (PEM) y firma base64 del `plugin.json` (autoría + integridad). |

## Dónde se sirve el índice

- **Remoto**: setea `PLUGIN_REGISTRY_URL` con la URL del JSON (GitHub raw, un
  sitio, etc.). Se cachea 5 minutos.
- **Local (fallback dev)**: el archivo `plugins/catalog.json` del monorepo.

```env
PLUGIN_REGISTRY_URL=https://raw.githubusercontent.com/tu-usuario/tu-registro/main/catalog.json
```

> `BLOCK_REGISTRY_URL` se conserva como alias `@deprecated` (ver
> `docs/architecture/plugin-system.md`, sección «Estado transitorio del rename»).

## Instalar un plugin

El flujo de instalación (`POST /api/v1/plugins/install`) ahora **prioriza la
fuente remota**:

1. `body.url` (URL directa firmada) o `findRemotePlugin(id)` → `installRemotePlugin`.
2. `installRemotePlugin` descarga (`downloadUrl`/`npm pack`/`git clone --depth 1`),
   **verifica `sha256` + firma Ed25519**, copia a `plugins/<id>` y ejecuta el
   flujo de instalación habitual (`onInstall`, permisos, menú, traducciones).
3. **Fallback dev**: si no hay entrada en el registro (catálogo vacío), instala
   el paquete local en disco.

```json
// POST /api/v1/plugins/install
{ "id": "store" }
// o directo firmado:
{ "id": "store", "url": "https://…/store-v1.0.0.tgz" }
```

> Las entradas firmadas de **primera parte** (sha256/Ed25519 por versión) las
> genera el CI de release; `plugins/catalog.json` permanece vacío hasta
> entonces (documentado en ADR-0016).

## Publicar un plugin

1. Creá un repositorio con un `plugin.json` (incluyendo `repository` y `source`)
   y su código (`src/server.ts`, `src/client.ts`, build).
2. Agregá la entrada al índice (`plugins/catalog.json` o tu índice remoto) con
   `sha256` + `publicKey` + `signature`.
3. En la UI, **Plugins → Catálogo → Instalar**: Webs descarga el repo, verifica
   la firma, lo ubica en `plugins/<id>` y ejecuta el flujo de instalación.

## API

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/v1/plugins/catalog` | Catálogo local + remoto (con `repository` y estado `installed`). |
| POST | `/api/v1/plugins/install` | Instala `{ id }` (remoto o local) o `{ id, source, url, subdir }`. |

> Seguridad: la instalación requiere el permiso `plugin.manage`; el `url` se
> valida (solo `http(s)` o `git@`) y el plugin descargado se **verifica**
> (sha256 + Ed25519) antes de ejecutarse (mismo aislamiento/permisos que un
> plugin local).

## Ver también

- [`docs/adr/0016-plugin-source-remoto.md`](../adr/0016-plugin-source-remoto.md) — decisión completa.
- [`docs/architecture/plugin-system.md`](../architecture/plugin-system.md) — contrato `plugin.json` y ciclo de vida.
- [`docs/guides/crear-un-plugin.md`](./crear-un-plugin.md) — cómo escribir un plugin.
