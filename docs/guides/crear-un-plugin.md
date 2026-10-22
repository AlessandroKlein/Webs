# Guía completa: crear un plugin para Webs

Un **plugin** es la unidad de extensión de la plataforma Webs. Puede aportar:

- Lógica de **servidor** (rutas Fastify propias).
- Render de **cliente** (se monta en un *slot* del sitio).
- **Ítems de menú** nativos (aparecen en el panel como si fueran del núcleo).
- **Configuración** editable desde la UI (formulario generado desde JSON Schema).
- **Permisos** propios y **hooks** de ciclo de vida (instalar/desinstalar).

> **Nota de naming:** la unidad se llama **«Plugin»** (antes «Bloque»). El manifiesto
> canónico es `plugin.json` (se acepta `block.json` por retrocompatibilidad) y el SDK
> expone `definePlugin`/`defineClientPlugin` (con alias `@deprecated` `defineBlock`/
> `defineClientBlock`). El directorio físico y los paquetes npm conservan el prefijo
> `block`/`blocks` de forma transitoria (ver `docs/architecture/plugin-system.md`, sección
> «Estado transitorio del rename»).

Esta guía te lleva de cero a un plugin instalable desde la UI, usando
[`blocks/example-block`](../../blocks/example-block) como referencia.

---

## Estructura de un plugin

Cada plugin es un **paquete independiente** dentro de `blocks/` (el workspace
incluye `blocks/*`). Estructura mínima:

```text
blocks/mi-plugin/
├── plugin.json         # Manifiesto (contrato público con la plataforma)
├── package.json        # Dependencias y scripts de build
├── tsconfig.json       # Extiende tsconfig.base.json
└── src/
    ├── server.ts       # (opcional) lógica backend: definePlugin + register + hooks
    └── client.ts       # (opcional) render frontend: defineClientPlugin + mount
```

El contrato está definido en [`packages/plugin-sdk`](../../packages/plugin-sdk).
La versión actual del contrato es `PLUGIN_API_VERSION = "1.0.0"`.

---

## 1. `plugin.json` — el manifiesto

Es el archivo `PLUGIN_MANIFEST_FILENAME` que la plataforma lee para descubrir
el plugin y validarlo (`parsePluginManifest`). Campos completos:

| Campo          | Tipo                    | Requerido | Descripción                                                                 |
| -------------- | ----------------------- | --------- | --------------------------------------------------------------------------- |
| `name`         | string                  | ✅         | Nombre de paquete estilo npm (ej. `@acme/plugin-store`).                      |
| `id`           | string                  | ✅         | Identificador único (slug). Regex: `^[a-z0-9][a-z0-9-_]*$`.                  |
| `version`      | string                  | ✅         | Versión semántica (`x.y.z`, con sufijo `-pre` opcional).                     |
| `type`         | `"plugin"`              | ✅         | Tipo de extensión. Usá `plugin` (se acepta `block` por retrocompatibilidad). |
| `displayName`  | `LocalizedString`       | ✅         | Nombre visible por locale. Al menos un locale.                               |
| `description`  | `LocalizedString`       | ✅         | Descripción por locale.                                                      |
| `author`       | string                  | ✅         | Autor(es).                                                                   |
| `apiVersion`   | string                  | ✅         | Versión del contrato contra la que se escribió (usar `"1.0.0"`).             |
| `license`      | string                  | no         | Licencia SPDX (ej. `MIT`).                                                   |
| `homepage`     | string (URL)            | no         | URL del proyecto.                                                            |
| `icon`         | string                  | no         | Clave de icono o nombre de archivo.                                          |
| `keywords`     | string[]                | no         | Palabras clave para el catálogo.                                             |
| `category`     | string                  | no         | Categoría para el catálogo.                                                  |
| `entry`        | string                  | no         | Punto de entrada del servidor (relativo). Default `./dist/server.js`.        |
| `clientEntry`  | string                  | no         | Punto de entrada del cliente (relativo). Default `./dist/client.js`.         |
| `settings`     | `JsonSchema`            | no         | JSON Schema de la configuración (genera el formulario de admin).             |
| `permissions`  | string[]                | no         | Permisos que el plugin declara (se registran al instalar).                   |
| `slots`        | string[]                | no         | Slots donde el plugin puede ubicarse (ej. `["content"]`).                    |
| `menu`         | `PluginMenuItem[]`      | no         | Ítems de menú nativos que el plugin aporta al panel/sitio.                   |
| `dependencies` | Record<string, string>  | no         | Dependencias npm (peers).                                                    |
| `pluginDependencies` | string[]         | no         | `id`s de otros plugins de los que depende (instalación en orden).            |
| `provides` / `requiresProviders` | string[] | no | Capacidades que aporta/requiere (ej. `payments`).                       |
| `events`       | string[]                | no         | Eventos de negocio que emite/consume (ej. `order.created`).                  |

**`LocalizedString`** es un objeto `{ "<locale>": "<texto>" }` con al menos una
entrada, por ejemplo `{ "es": "Mi plugin", "en": "My plugin" }`.

### Ejemplo completo (`plugin.json`)

```json
{
  "name": "@acme/plugin-store",
  "id": "store",
  "version": "1.0.0",
  "type": "plugin",
  "displayName": {
    "en": "Store",
    "es": "Tienda"
  },
  "description": {
    "en": "A product catalog plugin.",
    "es": "Un plugin de catálogo de productos."
  },
  "author": "ACME",
  "license": "MIT",
  "homepage": "https://acme.example.com",
  "icon": "store",
  "keywords": ["store", "catalog"],
  "category": "commerce",
  "entry": "./dist/server.js",
  "clientEntry": "./dist/client.js",
  "apiVersion": "1.0.0",
  "slots": ["content", "sidebar"],
  "permissions": ["store.admin"],
  "menu": [
    {
      "id": "store",
      "label": { "es": "Tienda", "en": "Store" },
      "path": "/admin/plugins/store",
      "icon": "store",
      "order": 200,
      "target": "admin",
      "permissions": ["store.admin"]
    }
  ],
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

### Ítems de menú (`menu`)

Cada ítem se declara con `id`, `label` (localizado), `path` y, opcionalmente, `icon`,
`order`, `section`, `parent`, `permissions` y `target` (`admin` | `public` | `both`).
Los ítems se fusionan con el menú del núcleo y aparecen **como si fueran nativos**,
sin una categoría «Plugins» separada. Ver
[`docs/architecture/plugin-system.md`](../architecture/plugin-system.md#6-menu-nativo).

---

## 2. `package.json`

El plugin depende de `@webs/plugin-sdk` y se compila con `tsup` a ESM:

```json
{
  "name": "@acme/plugin-store",
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
  "files": ["dist", "plugin.json"],
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

El servidor usa `definePlugin`, que valida el manifiesto y devuelve la
definición (`ServerPlugin`) que el loader consumirá.

### API disponible

```ts
import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    // `fastify` es una FastifyInstance real.
    // `config` son los ajustes del plugin (resueltos desde la BD).
    fastify.get('/', async () => ({ plugin: 'store', ok: true }));
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('plugin instalado'),
    onUninstall: async (ctx) => ctx.logger.info('plugin desinstalado'),
    onActivate: async (ctx) => ctx.logger.info('plugin activado'),
    onDeactivate: async (ctx) => ctx.logger.info('plugin desactivado'),
  },
});
```

### `register(fastify, config)`

Permite registrar **rutas y decoradores propios**. Las rutas del plugin se
montan bajo el prefijo:

```text
/api/v1/plugins/<id>/
```

Es decir, `fastify.get('/')` dentro del plugin queda disponible en
`GET /api/v1/plugins/store/`.

### Hooks del ciclo de vida

| Hook           | Cuándo se ejecuta                                              |
| -------------- | -------------------------------------------------------------- |
| `onInstall`    | Al instalar el plugin (`POST /plugins/install`).                |
| `onUninstall`  | Al desinstalar (`DELETE /plugins/:id`).                         |
| `onActivate`   | Al activar/cargar un plugin instalado en el arranque.           |
| `onDeactivate` | (definido en el contrato; ver `PluginHooks`).                   |

Cada hook recibe un `ServerPluginContext`:

```ts
interface ServerPluginContext {
  fastify: unknown;
  logger: PluginLogger;            // logger estructural con child()
  services: PluginServices;        // { db: Prisma, cache?: Redis, events?: Redis }
  config: Record<string, unknown>; // configuración validada
  installationId: string;          // id de la instalación
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

El cliente usa `defineClientPlugin`. El `mount` recibe un contexto y debe
montar el contenido en `container`, devolviendo opcionalmente una función de
limpieza.

```ts
import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container, config, i18n, theme, api }) => {
  const title = typeof config.title === 'string' ? config.title : 'Productos';

  const el = document.createElement('div');
  el.textContent = title;
  container.appendChild(el);

  return () => {
    el.remove(); // limpieza al desmontar
  };
});
```

### `ClientPluginContext`

```ts
interface ClientPluginContext {
  container: HTMLElement;         // nodo donde montar el plugin
  slot: string;                   // id del slot (ej. "content")
  locale: string;                 // locale activo (BCP-47)
  config: Record<string, unknown>; // configuración del plugin
  api: PluginApiClient;            // cliente HTTP (get/post/put/del) hacia la API
  i18n: PluginI18n;                // t(key) y locale
  theme: PluginTheme;              // { mode: 'light'|'dark', tokens }
}
```

> El `mount` puede ser **DOM puro, React, Vue** o cualquier librería: el
> contrato solo pide recibir el contenedor y devolver (opcionalmente) una
> función de limpieza.

---

## 5. Configuración (`settings`) — JSON Schema

El plugin **no necesita escribir UI de configuración**: declara un
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
instalar (ver `schemaDefaults` en `apps/api/src/plugins/loader.ts`). La
configuración se guarda en `BlockInstallation.config` y se expone/valida vía
`GET`/`PUT /api/v1/plugins/:id/settings`.

---

## 6. Permisos

Declará permisos propios en `manifest.permissions`. Al instalar, la plataforma
los registra en la tabla `permissions` (upsert) con descripción
`Permiso del plugin <id>`.

```json
{
  "permissions": ["store.admin"]
}
```

Podés luego proteger tus rutas de plugin con `fastify.authorize('store.admin')`.
Seguí la convención `<recurso>.<acción>` (ver
[`roles-permisos.md`](./roles-permisos.md)).

---

## 7. Slots

Un **slot** es una región del sitio (`header`, `content`, `sidebar`, `footer`)
donde el administrador coloca plugins. En `manifest.slots` declarás **en qué
slots puede ubicarse tu plugin**:

```json
{
  "slots": ["content", "sidebar"]
}
```

Los slots base están definidos en `apps/api/src/plugins/slots.ts`:

| Slot      | Español        | Inglés    |
| --------- | -------------- | --------- |
| `header`  | Cabecera       | Header    |
| `content` | Contenido      | Content   |
| `sidebar` | Barra lateral  | Sidebar   |
| `footer`  | Pie de página  | Footer    |

---

## 8. Registrar el plugin en el frontend

El frontend empaqueta los plugins en **tiempo de build**. Importá y registrá la
entrada de cliente en [`apps/web/src/plugins/index.ts`](../../apps/web/src/plugins/index.ts):

```ts
import { registerClientPlugin } from './registry';
import examplePlugin from '@webs/block-example/client';
import storePlugin from '@acme/plugin-store/client';

registerClientPlugin(examplePlugin);
registerClientPlugin(storePlugin);   // ← tu plugin

export { registerClientPlugin, getClientPlugin } from './registry';
```

> El `id` del plugin (del `plugin.json`) es la clave del registro. El import
> debe coincidir con el subpath exportado en el `package.json` del plugin
> (`"./client"`).

---

## 9. Compilar el plugin

```bash
# desde la raíz del monorepo
pnpm --filter @acme/plugin-store build
```

O para compilar todo el workspace (incluidos plugins y apps):

```bash
pnpm build
```

Esto genera `dist/server.js`, `dist/server.d.ts`, `dist/client.js` y
`dist/client.d.ts` (ESM).

---

## 10. Instalar desde la UI

1. Levantá la plataforma (`pnpm dev`) e iniciá sesión como admin.
2. Andá a **Plugins** en el panel (`/admin/plugins`).
3. En la sección **Catálogo** verás tu plugin (la API descubre los manifiestos
   de `blocks/*` a partir de `BLOCK_DIR`).
4. Pulsá **Crear** (instalar). Esto llama a `POST /api/v1/plugins/install` con
   `{ "id": "store" }`, crea la instalación y ejecuta `onInstall`.
5. Usá **Editar** para configurarlo (formulario generado desde `settings`),
   **Deshabilitar/Habilitar** para activarlo/desactivarlo, y **Eliminar** para
   desinstalarlo.
6. Colocá el plugin en un slot (p. ej. `content`) mediante la API o la UI de
   colocaciones (`PUT /api/v1/plugins/placements`).
7. Si declaraste `menu`, el ítem aparece en el menú principal del panel como
   un ítem nativo (sin categoría separada).

> ⚠️ Como los plugins de cliente se empaquetan estáticamente en el build del
> frontend, después de **añadir un plugin nuevo** tenés que recompilar el
> frontend (`pnpm --filter @webs/web build` o reiniciar `pnpm dev:web`) para
> que su `clientEntry` esté disponible en el navegador.

---

## Resumen del ciclo de vida

```text
plugin.json ──► descubrimiento (catálogo) ──► POST /plugins/install
                  │                              │
                  │                              ├─ registra permisos
                  │                              ├─ crea BlockInstallation
                  │                              ├─ registra menú (manifest.menu)
                  │                              └─ ejecuta onInstall
                  │
                  └─► activación (arranque): register() bajo /api/v1/plugins/<id>
                                                     │
clientEntry ──► apps/web/src/plugins/index.ts ──► mount() en PluginSlot
```

## Ver también

- [`blocks/example-block`](../../blocks/example-block) — plantilla de referencia.
- [`packages/plugin-sdk`](../../packages/plugin-sdk) — contrato y tipos.
- [`docs/guides/configuracion-desde-ui.md`](./configuracion-desde-ui.md) — uso desde la UI.
- [`docs/architecture/plugin-system.md`](../architecture/plugin-system.md) — documento central.
