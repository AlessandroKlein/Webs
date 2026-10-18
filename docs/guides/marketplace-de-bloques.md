# Marketplace de bloques

Webs incluye un **catálogo de bloques** instalable desde la UI. Combina:

- **Bloques locales**: los que están en `blocks/` del monorepo (descubiertos al
  arrancar).
- **Índice remoto**: un JSON de registro (configurable) que lista bloques
  publicados por terceros, descargables e instalables con un clic.

## Formato del índice

Un archivo JSON con una lista de bloques:

```json
{
  "name": "Webs Block Registry",
  "blocks": [
    {
      "id": "store",
      "name": "@acme/block-store",
      "version": "1.0.0",
      "displayName": { "es": "Tienda", "en": "Store" },
      "description": { "es": "Catálogo de productos.", "en": "Product catalog." },
      "author": "Acme",
      "license": "MIT",
      "homepage": "https://github.com/acme/block-store",
      "source": "git",
      "url": "https://github.com/acme/block-store.git",
      "subdir": "block"
    }
  ]
}
```

| Campo | Descripción |
| ----- | ----------- |
| `id` | Identificador único (debe coincidir con el `id` del `block.json`). |
| `name` | Nombre del paquete. |
| `version` | Versión del catálogo. |
| `displayName` / `description` | Textos localizados (`es`, `en`, …). |
| `source` | `git` (clonado) o `npm` (próximamente). |
| `url` | URL del repositorio git (o paquete npm). |
| `subdir` | Subdirectorio del repo que contiene el bloque (monorepos). |

## Dónde se sirve el índice

- **Local (por defecto)**: el archivo `blocks/catalog.json` del monorepo.
- **Remoto**: setea `BLOCK_REGISTRY_URL` con la URL del JSON (GitHub raw, un
  sitio, etc.). Se cachea 5 minutos.

```env
BLOCK_REGISTRY_URL=https://raw.githubusercontent.com/tu-usuario/tu-registro/main/catalog.json
```

## Publicar un bloque

1. Creá un repositorio con un `block.json` y su código (`src/server.ts`,
   `src/client.ts`, build).
2. Agregá la entrada al índice (`catalog.json` o tu índice remoto).
3. En la UI, **Bloques → Catálogo → Instalar**: Webs clona el repo, ubica el
   bloque en `blocks/<id>` y ejecuta el flujo de instalación habitual
   (`onInstall`, permisos, traducciones, etc.).

## API

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/v1/blocks/catalog` | Catálogo local + remoto (con estado `installed`). |
| POST | `/api/v1/blocks/install` | Instala `{ id }` (local o remoto) o `{ id, source, url, subdir }`. |

> Seguridad: la instalación requiere el permiso `block.manage`; el `url` se
> valida (solo `http(s)` o `git@`) y el bloque descargado se ejecuta como
> cualquier bloque local (mismo aislamiento/permisos).
