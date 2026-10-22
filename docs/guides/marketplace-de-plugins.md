# Marketplace de plugins

Webs incluye un **catálogo de plugins** instalable desde la UI. Combina:

- **Plugins locales**: los que están en `blocks/` del monorepo (descubiertos al
  arrancar).
- **Índice remoto**: un JSON de registro (configurable) que lista plugins
  publicados por terceros, descargables e instalables con un clic.

## Formato del índice

Un archivo JSON con una lista de plugins:

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
| `id` | Identificador único (debe coincidir con el `id` del `plugin.json`). |
| `name` | Nombre del paquete. |
| `version` | Versión del catálogo. |
| `displayName` / `description` | Textos localizados (`es`, `en`, …). |
| `icon` | Imagen/logo del plugin (se muestra en el catálogo). |
| `author` / `license` / `homepage` | Metadatos del creador. |
| `source` | `git` (clonado), `npm` (paquete) o directo. |
| `url` | URL del repositorio git (o paquete npm). |
| `downloadUrl` | URL directa de un tarball `.tgz`/`.tar.gz` (alternativa a git/npm). |
| `subdir` | Subdirectorio del repo que contiene el plugin (monorepos). |
| `sha256` | (Opcional) SHA-256 del `plugin.json`. |
| `publicKey` / `signature` | (Opcional) Clave pública Ed25519 (PEM) y firma base64 del `plugin.json` (autoría + integridad). |

## Dónde se sirve el índice

- **Local (por defecto)**: el archivo `blocks/catalog.json` del monorepo.
- **Remoto**: setea `BLOCK_REGISTRY_URL` con la URL del JSON (GitHub raw, un
  sitio, etc.). Se cachea 5 minutos.

```env
BLOCK_REGISTRY_URL=https://raw.githubusercontent.com/tu-usuario/tu-registro/main/catalog.json
```

> La clave de cache y la env conservan el prefijo `block` de forma transitoria
> (ver `docs/architecture/plugin-system.md`, sección «Estado transitorio del rename»).

## Publicar un plugin

1. Creá un repositorio con un `plugin.json` y su código (`src/server.ts`,
   `src/client.ts`, build).
2. Agregá la entrada al índice (`catalog.json` o tu índice remoto).
3. En la UI, **Plugins → Catálogo → Instalar**: Webs clona el repo, ubica el
   plugin en `blocks/<id>` y ejecuta el flujo de instalación habitual
   (`onInstall`, permisos, menú, traducciones, etc.).

## API

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/v1/plugins/catalog` | Catálogo local + remoto (con estado `installed`). |
| POST | `/api/v1/plugins/install` | Instala `{ id }` (local o remoto) o `{ id, source, url, subdir }`. |

> Seguridad: la instalación requiere el permiso `block.manage`; el `url` se
> valida (solo `http(s)` o `git@`) y el plugin descargado se ejecuta como
> cualquier plugin local (mismo aislamiento/permisos).
