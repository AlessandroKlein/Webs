# Guía completa: crear un bloque (plugin) para Webs

Un **bloque** es la unidad de extensión de la plataforma Webs. Puede aportar:

- Lógica de **servidor** (rutas Fastify propias).
- Render de **cliente** (se monta en un *slot* del sitio).
- **Configuración** editable desde la UI (formulario generado desde JSON Schema).
- **Permisos** propios y **hooks** de ciclo de vida (instalar/desinstalar).

Esta guía te lleva de cero a un bloque instalable desde la UI, usando
[`blocks/example-block`](../../blocks/example-block) como referencia.

---

## Estructura de un bloque

Cada bloque es un **paquete independiente** dentro de `blocks/` (el workspace
incluye `blocks/*`). Estructura mínima:

```text
blocks/mi-bloque/
├── block.json          # Manifiesto (contrato público con la plataforma)
├── package.json        # Dependencias y scripts de build
├── tsconfig.json       # Extiende tsconfig.base.json
└── src/
    ├── server.ts       # (opcional) lógica backend: defineBlock + register + hooks
    └── client.ts       # (opcional) render frontend: defineClientBlock + mount
```

El contrato está definido en [`packages/plugin-sdk`](../../packages/plugin-sdk).
La versión actual del contrato es `BLOCK_API_VERSION = "1.0.0"`.

---

## 1. `block.json` — el manifiesto

Es el archivo `BLOCK_MANIFEST_FILENAME` que la plataforma lee para descubrir
el bloque y validarlo (`parseBlockManifest`). Campos completos:

| Campo          | Tipo                    | Requerido | Descripción                                                                 |
| -------------- | ----------------------- | --------- | --------------------------------------------------------------------------- |
| `name`         | string                  | ✅         | Nombre de paquete estilo npm (ej. `@acme/block-store`).                      |
| `id`           | string                  | ✅         | Identificador único (slug). Regex: `^[a-z0-9][a-z0-9-_]*$`.                  |
| `version`      | string                  | ✅         | Versión semántica (`x.y.z`, con sufijo `-pre` opcional).                     |
| `type`         | `"block"`               | ✅         | Tipo de extensión (literal, siempre `block`).                                |
| `displayName`  | `LocalizedString`       | ✅         | Nombre visible por locale. Al menos un locale.                               |
| `description`  | `LocalizedString`       | ✅         | Descripción por locale.                                                      |
| `author`       | string                  | ✅         | Autor(es).                                                                   |
| `apiVersion`   | string                  | ✅         | Versión del contrato contra la que se escribió (usar `"1.0.0"`).             |
| `license`      | string                  | no         | Licencia SPDX (ej. `MIT`).                                                   |
| `homepage`     | string (URL)            | no         | URL del proyecto.                                                            |
| `icon`         | string                  | no         | Clave de icono o nombre de archivo.                                          |
| `keywords`     | string[]                | no         | Palabras clave para el catálogo.                                             |
| `entry`        | string                  | no         | Punto de entrada del servidor (relativo). Default `./dist/server.js`.        |
| `clientEntry`  | string                  | no         | Punto de entrada del cliente (relativo). Default `./dist/client.js`.         |
| `settings`     | `JsonSchema`            | no         | JSON Schema de la configuración (genera el formulario de admin).             |
| `permissions`  | string[]                | no         | Permisos que el bloque declara (se registran al instalar).                   |
| `slots`        | string[]                | no         | Slots donde el bloque puede ubicarse (ej. `["content"]`).                    |
| `dependencies` | Record<string, string>  | no         | Dependencias npm (peers).                                                    |

**`LocalizedString`** es un objeto `{ "<locale>": "<texto>" }` con al menos una
entrada, por ejemplo `{ "es": "Mi bloque", "en": "My block" }`.

### Ejemplo completo (`block.json`)

```json
{
  "name": "@acme/block-store",
  "id": "store",
  "version": "1.0.0",
  "type": "block",
  "displayName": {
    "en": "Store",
    "es": "Tienda"
  },
  "description": {
    "en": "A product catalog block.",
    "es": "Un bloque de catálogo de productos."
  },
  "author": "ACME",
  "license": "MIT",
  "homepage": "https://acme.example.com",
  "icon": "store",
  "keywords": ["store", "catalog"],
  "entry": "./dist/server.js",
  "clientEntry": "./dist/client.js",
  "apiVersion": "1.0.0",
  "slots": ["content", "sidebar"],
  "permissions": ["store.admin"],
  "settings": {
    "type": "object",
    "title": "Configuración de la tienda",
    "properties": {
      "title": {
        "type": "string",
        "title": "Título",
        "default": "Nuestros productos"
      },
      "columns": {
        "type": "integer",
        "title": "Columnas",
        "minimum": 1,
        "maximum": 4,
        "default": 3
      },
      "currency": {
        "type": "string",
        "title": "Moneda",
        "enum": ["USD", "EUR", "ARS"],
        "default": "USD"
      }
    }
  }
}
```

---

## 2. `package.json`

El bloque depende de `@webs/plugin-sdk` y se compila con `tsup` a ESM:

```json
{
  "name": "@acme/block-store",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.js"
    }
  },
  "files": ["dist", "block.json"],
  "scripts": {
    "build": "tsup src/server.ts src/client.ts --format esm --dts --clean",
    "dev": "tsup src/server.ts src/client.ts --format esm --dts --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@webs/plugin-sdk": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.3"
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["src"]
}
```

---

## 3. `src/server.ts` — lógica backend

El servidor usa `defineBlock`, que valida el manifiesto y devuelve la
definición (`ServerBlock`) que el loader consumirá.

### API disponible

```ts
import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    // `fastify` es una FastifyInstance real.
    // `config` son los ajustes del bloque (resueltos desde la BD).
    fastify.get('/', async () => ({ block: 'store', ok: true }));
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('bloque instalado'),
    onUninstall: async (ctx) => ctx.logger.info('bloque desinstalado'),
    onActivate: async (ctx) => ctx.logger.info('bloque activado'),
    onDeactivate: async (ctx) => ctx.logger.info('bloque desactivado'),
  },
});
```

### `register(fastify, config)`

Permite registrar **rutas y decoradores propios**. Las rutas del bloque se
montan bajo el prefijo:

```text
/api/v1/blocks/<id>/
```

Es decir, `fastify.get('/')` dentro del bloque queda disponible en
`GET /api/v1/blocks/store/`.

### Hooks del ciclo de vida

| Hook           | Cuándo se ejecuta                                              |
| -------------- | -------------------------------------------------------------- |
| `onInstall`    | Al instalar el bloque (`POST /blocks/install`).                |
| `onUninstall`  | Al desinstalar (`DELETE /blocks/:id`).                         |
| `onActivate`   | Al activar/cargar un bloque instalado en el arranque.          |
| `onDeactivate` | (definido en el contrato; ver `BlockHooks`).                   |

Cada hook recibe un `ServerBlockContext`:

```ts
interface ServerBlockContext {
  fastify: unknown;
  logger: BlockLogger;            // logger estructural con child()
  services: BlockServices;        // { db: Prisma, cache?: Redis, events?: Redis }
  config: Record<string, unknown>; // configuración validada
  installationId: string;         // id de la instalación
}
```

Ejemplo usando Prisma y el logger:

```ts
hooks: {
  onInstall: async ({ services, logger }) => {
    logger.info('creando tabla de productos…');
    // services.db es el cliente Prisma real.
  },
}
```

---

## 4. `src/client.ts` — render en el frontend

El cliente usa `defineClientBlock`. El `mount` recibe un contexto y debe
montar el contenido en `container`, devolviendo opcionalmente una función de
limpieza.

```ts
import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container, config, i18n, theme, api }) => {
  const title = typeof config.title === 'string' ? config.title : 'Productos';

  const el = document.createElement('div');
  el.textContent = title;
  container.appendChild(el);

  return () => {
    el.remove(); // limpieza al desmontar
  };
});
```

### `ClientBlockContext`

```ts
interface ClientBlockContext {
  container: HTMLElement;         // nodo donde montar el bloque
  slot: string;                   // id del slot (ej. "content")
  locale: string;                 // locale activo (BCP-47)
  config: Record<string, unknown>; // configuración del bloque
  api: BlockApiClient;            // cliente HTTP (get/post/put/del) hacia la API
  i18n: BlockI18n;                // t(key) y locale
  theme: BlockTheme;              // { mode: 'light'|'dark', tokens }
}
```

> El `mount` puede ser **DOM puro, React, Vue** o cualquier librería: el
> contrato solo pide recibir el contenedor y devolver (opcionalmente) una
> función de limpieza.

---

## 5. Configuración (`settings`) — JSON Schema

El bloque **no necesita escribir UI de configuración**: declara un
`settings` (JSON Schema draft-07) y la UI de administración genera el
formulario automáticamente (`SchemaForm`).

Soportado (subconjunto, ver `packages/plugin-sdk/src/schema.ts`):

- `type`, `properties`, `required`, `additionalProperties`
- `items`, `minItems`, `maxItems`, `uniqueItems`
- `minLength`, `maxLength`, `pattern`, `format`
- `minimum`, `maximum`, `enum`, `const`, `default`
- `anyOf`, `oneOf`, `allOf`

**Extensión `x-ui`** (propia de Webs) para dar pistas de renderizado:

```json
{
  "properties": {
    "primaryColor": { "type": "string", "x-ui": { "widget": "color" } },
    "customCss": { "type": "string", "x-ui": { "widget": "textarea", "rows": 12 } },
    "body": { "type": "string", "x-ui": { "widget": "richtext" } }
  }
}
```

Los valores `default` del esquema se usan como configuración inicial al
instalar (ver `schemaDefaults` en `apps/api/src/blocks/loader.ts`). La
configuración se guarda en `BlockInstallation.config` y se expone/valida vía
`GET`/`PUT /api/v1/blocks/:id/settings`.

---

## 6. Permisos

Declará permisos propios en `manifest.permissions`. Al instalar, la plataforma
los registra en la tabla `permissions` (upsert) con descripción
`Permiso del bloque <id>`.

```json
{
  "permissions": ["store.admin"]
}
```

Podés luego proteger tus rutas de bloque con `fastify.authorize('store.admin')`.
Seguí la convención `<recurso>.<acción>` (ver
[`roles-permisos.md`](./roles-permisos.md)).

---

## 7. Slots

Un **slot** es una región del sitio (`header`, `content`, `sidebar`, `footer`)
donde el administrador coloca bloques. En `manifest.slots` declarás **en qué
slots puede ubicarse tu bloque**:

```json
{
  "slots": ["content", "sidebar"]
}
```

Los slots base están definidos en `apps/api/src/blocks/slots.ts`:

| Slot      | Español        | Inglés    |
| --------- | -------------- | --------- |
| `header`  | Cabecera       | Header    |
| `content` | Contenido      | Content   |
| `sidebar` | Barra lateral  | Sidebar   |
| `footer`  | Pie de página  | Footer    |

---

## 8. Registrar el bloque en el frontend

El frontend empaqueta los bloques en **tiempo de build**. Importá y registrá la
entrada de cliente en [`apps/web/src/blocks/index.ts`](../../apps/web/src/blocks/index.ts):

```ts
import { registerClientBlock } from './registry';
import exampleBlock from '@webs/block-example/client';
import storeBlock from '@acme/block-store/client';

registerClientBlock(exampleBlock);
registerClientBlock(storeBlock);   // ← tu bloque

export { registerClientBlock, getClientBlock } from './registry';
```

> El `id` del bloque (del `block.json`) es la clave del registro. El import
> debe coincidir con el subpath exportado en el `package.json` del bloque
> (`"./client"`).

---

## 9. Compilar el bloque

```bash
# desde la raíz del monorepo
pnpm --filter @acme/block-store build
```

O para compilar todo el workspace (incluidos bloques y apps):

```bash
pnpm build
```

Esto genera `dist/server.js`, `dist/server.d.ts`, `dist/client.js` y
`dist/client.d.ts` (ESM).

---

## 10. Instalar desde la UI

1. Levantá la plataforma (`pnpm dev`) e iniciá sesión como admin.
2. Andá a **Bloques** en el panel (`/blocks`).
3. En la sección **Catálogo** verás tu bloque (la API descubre los manifiestos
   de `blocks/*` a partir de `BLOCK_DIR`).
4. Pulsá **Crear** (instalar). Esto llama a `POST /api/v1/blocks/install` con
   `{ "id": "store" }`, crea la instalación y ejecuta `onInstall`.
5. Usá **Editar** para configurarlo (formulario generado desde `settings`),
   **Deshabilitar/Habilitar** para activarlo/desactivarlo, y **Eliminar** para
   desinstalarlo.
6. Colocá el bloque en un slot (p. ej. `content`) mediante la API o la UI de
   colocaciones (`PUT /api/v1/placements`).

> ⚠️ Como los bloques de cliente se empaquetan estáticamente en el build del
> frontend, después de **añadir un bloque nuevo** tenés que recompilar el
> frontend (`pnpm --filter @webs/web build` o reiniciar `pnpm dev:web`) para
> que su `clientEntry` esté disponible en el navegador.

---

## Resumen del ciclo de vida

```text
block.json ──► descubrimiento (catálogo) ──► POST /blocks/install
                 │                              │
                 │                              ├─ registra permisos
                 │                              ├─ crea BlockInstallation
                 │                              └─ ejecuta onInstall
                 │
                 └─► activación (arranque): register() bajo /api/v1/blocks/<id>
                                                    │
clientEntry ──► apps/web/src/blocks/index.ts ──► mount() en BlockSlot
```

## Ver también

- [`blocks/example-block`](../../blocks/example-block) — plantilla de referencia.
- [`packages/plugin-sdk`](../../packages/plugin-sdk) — contrato y tipos.
- [`docs/guides/configuracion-desde-ui.md`](./configuracion-desde-ui.md) — uso desde la UI.
