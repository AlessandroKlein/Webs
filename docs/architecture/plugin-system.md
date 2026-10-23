# Sistema de plugins

Este es el **documento central** de la arquitectura de extensibilidad de Webs. Describe el
mecanismo tipo *WordPress*: **plugins** autocontenidos que extienden la plataforma (rutas,
componentes de cliente, ítems de menú, ajustes, permisos, traducciones) sin modificar el núcleo.

> **Terminología (importante):** la unidad de extensión se denomina **«Plugin»** (antes
> «Bloque»). El rename se completó en la superficie de usuario y en la mayor parte del
> *naming interno* (manifiesto `plugin.json`, rutas `/api/v1/plugins/*`, SDK `definePlugin`,
> menú nativo, modelos Prisma, directorio físico y paquetes npm). Solo queda un residuo
> mínimo `block` por retrocompatibilidad. Ver la sección
> [Estado transitorio del rename](#8-estado-transitorio-del-rename-bloques-plugins) más abajo.

## Conceptos clave

| Concepto | Definición | Dónde se define |
|----------|------------|-----------------|
| **Plugin** | Paquete autocontenido con un manifiesto `plugin.json`, una entrada de servidor (`server.ts`) y una entrada de cliente (`client.ts`). | `plugins/*` (directorio físico) |
| **Manifiesto** | `plugin.json`: contrato público (metadatos, entradas, settings, permisos, slots, menú). | `packages/plugin-sdk/src/manifest.ts` |
| **SDK** | `@webs/plugin-sdk`: `definePlugin`, `defineClientPlugin`, tipos de contexto y hooks. | `packages/plugin-sdk/src/*` |
| **Slot** | Región nombrada del sitio (header, content, sidebar, footer) donde se colocan plugins. | `apps/api/src/plugins/slots.ts` |
| **Placement (colocación)** | Instancia concreta de un plugin dentro de un slot, con orden y configuración propia. | `packages/plugin-sdk/src/slot.ts` + modelo `PluginPlacement` |
| **Menú** | Ítems nativos del menú que cada plugin declara en `manifest.menu` y se fusionan con los del núcleo. | `packages/plugin-sdk/src/manifest.ts` + `apps/api/src/lib/plugin-menu.ts` |
| **Catálogo** | Plugins *disponibles* (descubiertos del directorio) pero no instalados. | `pluginRegistry.getAvailable()` |
| **Instalación** | Registro en BD (`PluginInstallation`) de un plugin instalado, con su `config`. | `apps/api/src/plugins/loader.ts` |

## 1. El manifiesto `plugin.json`

El manifiesto es la fuente de verdad estática de un plugin. Se valida en runtime con
**Zod** (`parsePluginManifest` en `packages/plugin-sdk/src/manifest.ts`).

### Campos del manifiesto

| Campo | Tipo | Requerido | Descripción / validación |
|-------|------|-----------|---------------------------|
| `name` | `string` | Sí | Nombre de paquete estilo npm, p. ej. `@webs/plugin-example`. |
| `id` | `string` | Sí | Slug único del plugin. Regex `^[a-z0-9][a-z0-9-_]*$`. |
| `version` | `string` | Sí | Versión semántica (`^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`). |
| `type` | `'plugin' \| 'block'` | Sí | Tipo de extensión. Canónico: `plugin`; `block` se acepta por retrocompatibilidad. |
| `displayName` | `LocalizedString` | Sí | Nombre visible; mapa locale BCP-47 → texto (al menos una localización). |
| `description` | `LocalizedString` | Sí | Descripción localizada. |
| `author` | `string` | Sí | Autor(es). |
| `license` | `string` | No | Licencia SPDX (p. ej. `MIT`). |
| `homepage` | `string` (URL) | No | URL del proyecto. |
| `icon` | `string` | No | Clave de icono o nombre de archivo. |
| `keywords` | `string[]` | No | Palabras clave para el catálogo. |
| `entry` | `string` | No | Entrada de servidor relativa al paquete. Default del loader: `./dist/server.js`. |
| `clientEntry` | `string` | No | Entrada de cliente relativa al paquete. Default del loader: `./dist/client.js`. |
| `settings` | `JsonSchema` | No | Esquema JSON de la configuración del plugin (genera el formulario de admin). |
| `permissions` | `string[]` | No | Permisos que el plugin declara (se registran en BD al instalar/cargar). |
| `slots` | `string[]` | No | Slots donde el plugin **puede** ubicarse (whitelist). |
| `menu` | `PluginMenuItem[]` | No | Ítems de menú nativos que el plugin aporta (ver [Menú nativo](#6-menu-nativo)). |
| `dependencies` | `Record<string,string>` | No | Dependencias npm (peers) declarativas. |
| `pluginDependencies` | `string[]` | No | `id`s de otros plugins de los que este depende (el loader resuelve el orden de instalación). |
| `category` | `string` | No | Categoría para el catálogo. |
| `provides` / `requiresProviders` | `string[]` | No | Capacidades (p. ej. `payments`) que el plugin aporta o requiere. |
| `events` | `string[]` | No | Eventos de negocio que el plugin emite/consume (p. ej. `order.created`). |
| `apiVersion` | `string` | Sí | Versión del contrato contra la que se escribió (`1.0.0`). |

### Ejemplo real

```jsonc
// plugins/example-block/plugin.json
{
  "name": "@webs/plugin-example",
  "id": "example",
  "version": "0.1.0",
  "type": "plugin",
  "displayName": { "en": "Example plugin", "es": "Plugin de ejemplo" },
  "description": { "en": "Reference plugin…", "es": "Plugin de referencia…" },
  "author": "Webs",
  "license": "MIT",
  "entry": "./dist/server.js",
  "clientEntry": "./dist/client.js",
  "apiVersion": "1.0.0",
  "slots": ["content"],
  "menu": [
    { "id": "example", "label": { "es": "Ejemplo", "en": "Example" }, "path": "/admin/plugins/example", "target": "admin", "order": 100 }
  ],
  "settings": {
    "type": "object",
    "properties": {
      "greeting": { "type": "string", "title": "Saludo", "default": "¡Hola!" },
      "showTime": { "type": "boolean", "title": "Mostrar hora", "default": false }
    }
  }
}
```

Constantes del contrato en `packages/plugin-sdk/src/manifest.ts`:

```ts
export const PLUGIN_API_VERSION = '1.0.0';
export const PLUGIN_MANIFEST_FILENAME = 'plugin.json';

// Alias @deprecated (retrocompatibilidad):
export const BLOCK_API_VERSION = PLUGIN_API_VERSION;
export const BLOCK_MANIFEST_FILENAME = 'block.json';
```

## 2. El SDK (`@webs/plugin-sdk`)

El SDK define el contrato y las fábricas. No depende de Fastify/Prisma en runtime: expone
**tipos estructurales**; la plataforma inyecta los objetos reales.

### `definePlugin` (servidor)

`packages/plugin-sdk/src/define.ts` — valida el manifiesto y devuelve un `ServerPlugin`:

```ts
export interface ServerPlugin {
  manifest: PluginManifest;
  hooks: PluginHooks;
  register?: PluginRegisterFn;   // plugin Fastify opcional
}

export function definePlugin(manifest: PluginManifest, opts: DefinePluginOptions = {}): ServerPlugin
```

```ts
// src/server.ts de un plugin
import { definePlugin } from '@webs/plugin-sdk';

export default definePlugin(manifest, {
  register: async (fastify) => {
    fastify.get('/', async () => ({ ok: true }));
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('instalado'),
  },
});
```

### `defineClientPlugin` (cliente)

Devuelve un `ClientPlugin` cuya función `mount` recibe el contenedor y opcionalmente
devuelve una función de limpieza:

```ts
export interface ClientPlugin {
  manifest: PluginManifest;
  mount: (ctx: ClientPluginContext) => void | (() => void);
}

export function defineClientPlugin(manifest: PluginManifest, mount: ClientPlugin['mount']): ClientPlugin
```

> El `mount` puede usar React, Vue o DOM puro: el contrato solo pide montar en un
> `HTMLElement` y devolver un cleanup. Ver `plugins/example-block/src/client.ts`.

> **Alias @deprecated:** `defineBlock`, `defineClientBlock`, `BlockManifest`,
> `parseBlockManifest`, `ServerBlock`, `ClientBlock` siguen exportándose como alias de los
> nombres canónicos para no romper plugins existentes.

### Hooks de ciclo de vida

Definidos en `packages/plugin-sdk/src/hooks.ts`:

```ts
export interface PluginHooks {
  onInstall?:    (ctx: ServerPluginContext) => void | Promise<void>;
  onUninstall?:  (ctx: ServerPluginContext) => void | Promise<void>;
  onActivate?:   (ctx: ServerPluginContext) => void | Promise<void>;
  onDeactivate?: (ctx: ServerPluginContext) => void | Promise<void>;
}
```

| Hook | Cuándo se dispara (implementación real) | Origen |
|------|------------------------------------------|--------|
| `onInstall` | Al instalar el plugin (`installPlugin`), después de crear el registro en BD. | `loader.ts` |
| `onUninstall` | Al desinstalar (`uninstallPlugin`), antes de borrar el registro. | `loader.ts` |
| `onActivate` | Al **cargar/activar** un plugin instalado con `enabled: true` (arranque). | `loadAndActivate()` |
| `onDeactivate` | **Declarado en el SDK pero NO invocado** por el loader actual. | — (discrepancia, ver abajo) |

### `ServerPluginContext`

```ts
export interface ServerPluginContext {
  fastify: unknown;                  // FastifyInstance real
  logger: PluginLogger;              // logger con .child({ plugin })
  services: PluginServices;          // { db, cache, events }
  config: Record<string, unknown>;   // ajustes resueltos desde BD
  installationId: string;            // id de la instalación
}
```

`PluginServices` expone `db` (Prisma), `cache` y `events` (Redis, opcionales). El loader
los construye en `makeContext()` (`apps/api/src/plugins/loader.ts`):

```ts
services: { db: fastify.prisma, cache: fastify.redis, events: fastify.redis }
```

### `ClientPluginContext`

```ts
export interface ClientPluginContext {
  container: HTMLElement;
  slot: string;
  locale: string;
  config: Record<string, unknown>;
  api: PluginApiClient;   // get/post/put/del sobre la API
  i18n: PluginI18n;       // t(key), locale
  theme: PluginTheme;     // { mode: 'light'|'dark', tokens }
}
```

## 3. Slots y colocaciones (placements)

### Slots base

`apps/api/src/plugins/slots.ts` define las regiones nativas del sitio:

```ts
export const CORE_SLOTS: SlotDefinition[] = [
  { id: 'header',  displayName: { es: 'Cabecera', en: 'Header' } },
  { id: 'content', displayName: { es: 'Contenido', en: 'Content' } },
  { id: 'sidebar', displayName: { es: 'Barra lateral', en: 'Sidebar' } },
  { id: 'footer',  displayName: { es: 'Pie de página', en: 'Footer' } },
];
```

`SlotDefinition` (`packages/plugin-sdk/src/slot.ts`) permite además `description`,
`maxBlocks` y `required` (opcionales). Los plugins indican en `manifest.slots` en qué
slots tienen permitido ubicarse (whitelist). En el estado actual, el loader solo registra
`CORE_SLOTS`; el campo `slots` del manifiesto actúa como whitelist declarativa.

### Colocaciones

Una **colocación** es la instancia de un plugin dentro de un slot. Persiste en el modelo
`PluginPlacement` de Prisma (`apps/api/prisma/schema.prisma`):

```prisma
model PluginPlacement {
  id        String   @id @default(uuid())
  pluginId   String
  slotId    String
  order     Int      @default(0)
  enabled   Boolean  @default(true)
  config    Json     @default("{}")
  // …
  @@index([slotId])
}
```

> El modelo usa el nombre canónico `PluginPlacement` y el campo `pluginId` (el naming
> interno ya fue renombrado; ver [Estado transitorio](#8-estado-transitorio-del-rename-bloques-plugins)).

El admin puede colocar el mismo plugin varias veces con distinta configuración y orden.
La API `PUT /api/v1/plugins/placements` reemplaza todas las colocaciones de un slot de forma
transaccional (`apps/api/src/modules/plugins/routes.ts`).

## 4. Loader del backend

`apps/api/src/plugins/loader.ts` es el orquestador. Sus funciones clave:

| Función | Responsabilidad |
|---------|-----------------|
| `resolvePluginDir(app)` | Resuelve el directorio de plugins desde `app.config.BLOCK_DIR` (default `../../plugins`). |
| `discoverPlugins(pluginDir)` | Escanea el directorio, lee cada `plugin.json` (acepta `block.json`), lo valida y lo añade al **catálogo**. |
| `resolvePackageDir(app, manifest)` | Localiza el directorio del paquete por `id` o por el tramo final de `name`. |
| `loadPluginEntry(pkgDir, manifest)` | Importa `manifest.entry` y exige un `default` que sea `ServerPlugin`. |
| `schemaDefaults(schema)` | Extrae los `default` del JSON Schema para la configuración inicial. |
| `registerPluginPermissions(app, manifest)` | Hace `upsert` de cada `manifest.permissions` en la tabla `Permission`. |
| `loadAndActivate(app, installation)` | Registra permisos, menú y traducciones, ejecuta `onActivate` y registra el plugin Fastify bajo `/api/v1/plugins/<id>`. |
| `registerPlugins(app)` | Arranque: registra slots base, descubre el catálogo y activa las instalaciones `enabled`. |
| `installPlugin(app, id)` | Crea `PluginInstallation` (config = defaults del schema), registra permisos y ejecuta `onInstall`. |
| `uninstallPlugin(app, id)` | Ejecuta `onUninstall` y borra la instalación. |

> **Alias @deprecated:** `registerBlocks`, `discoverBlocks`, `loadBlockEntry`,
> `installBlock`, `uninstallBlock`, `resolveBlockDir`, `registerBlockPermissions` siguen
> exportándose como alias.

### Registro del plugin Fastify

Cada plugin instalado se monta en su propio scope con prefijo
`/api/v1/plugins/<id>` (`loadAndActivate`):

```ts
await app.register(async (instance) => {
  const ctx = makeContext(instance, serverPlugin, config, installation.id);
  if (serverPlugin.hooks.onActivate) await serverPlugin.hooks.onActivate(ctx);
  if (serverPlugin.register) await serverPlugin.register(instance, config);
}, { prefix: `${API_PREFIX}/plugins/${manifest.id}` });
```

> La configuración del plugin vive en `PluginInstallation.config` (fuente de verdad) y se
> expone/edita vía `GET/PUT /api/v1/plugins/:id/settings`. El `PUT` valida contra
> `manifest.settings` con Ajv antes de persistir.

### Registro en memoria

`apps/api/src/plugins/registry.ts` mantiene mapas en memoria, incluyendo los ítems de menú:

```ts
class PluginRegistry {
  available:    Map<string, PluginManifest>;   // catálogo (descubiertos)
  loaded:       Map<string, LoadedPlugin>;     // instalados + activados
  slots:        Map<string, SlotDefinition>;   // slots registrados
  menuItems:    Map<string, PluginMenuItem[]>; // menú por plugin
  translations: Map<string, unknown>;          // traducciones por plugin
}
```

## 5. Registro de cliente

En el frontend, los plugins se empaquetan en **tiempo de build** y se importan
estáticamente en `apps/web/src/plugins/index.ts`:

```ts
import { registerClientPlugin } from './registry';
import examplePlugin from '@webs/plugin-example/client';

registerClientPlugin(examplePlugin);
```

`apps/web/src/plugins/registry.ts` expone `registerClientPlugin` y `getClientPlugin(id)`.
La carga dinámica en runtime (importmap / module federation) se menciona en el código
como evolución futura.

El componente `apps/web/src/plugins/PluginSlot.tsx`:

1. Obtiene las colocaciones del slot vía `GET /api/v1/plugins/placements?slotId=<id>`.
2. Filtra `enabled`, ordena por `order`.
3. Monta cada plugin con `getClientPlugin(pluginId).mount(ctx)` construyendo el
   `ClientPluginContext` (container, slot, locale, config, api, i18n, theme).

El sitio público (`apps/web/src/features/public/PublicHome.tsx`) renderiza los slots
`header`, `content`, `sidebar` y `footer` con `<PluginSlot slotId="…" />`.

## 6. Menú nativo

Cada plugin puede aportar ítems al menú principal del panel, **sin una categoría
«Plugins» separada**: los ítems aparecen como si fueran nativos del núcleo.

### Declaración en el manifiesto

```jsonc
"menu": [
  {
    "id": "mi-plugin",
    "label": { "es": "Mi plugin", "en": "My plugin" },
    "path": "/admin/plugins/mi-plugin",
    "icon": "extension",
    "order": 100,
    "target": "admin",            // 'admin' | 'public' | 'both'
    "permissions": ["mi-plugin.read"]
  }
]
```

`PluginMenuItem` (en `packages/plugin-sdk/src/manifest.ts`) admite además `section`
(agrupación), `parent` (submenú) y `icon`.

### Cómo se fusiona

1. Al activar un plugin, `loadAndActivate` llama a
   `pluginRegistry.registerMenuItems(manifest.id, manifest.menu ?? [])`.
2. Los endpoints de menú recolectan los ítems con
   `collectPluginMenuItems(scope)` en `apps/api/src/lib/plugin-menu.ts` (resuelve
   `label` según locale: prefiere `es`, luego `en`, luego el primero; `target` por
   defecto `both`).
3. `GET /menu` (admin, permiso `setting.read`) fusiona los ítems **del núcleo**
   (`prisma.menu` con clave `main`) **+** los ítems de plugins (scope `admin`).
4. `GET /public/menu` (en `settings/routes.ts`) hace lo mismo para el sitio público
   (scope `public`).
5. El frontend (`AdminLayout`) consume `GET /menu`, filtra los ítems que tienen `id`
   (solo plugins; los ítems del núcleo público no llevan `id`), aplica el filtro por
   `permissions` y ordena por `order`. No existe una sección «Plugins» colapsable.

## 7. Ciclo de vida completo

### Arranque

```text
app.ts → registerPlugins(app)
  1. Registrar CORE_SLOTS en pluginRegistry
  2. discoverPlugins(pluginDir)         → catálogo (available)
  3. SELECT * FROM PluginInstallation WHERE enabled = true
  4. Para cada instalación → loadAndActivate()
       ├─ parsePluginManifest(manifest)
       ├─ registerPluginPermissions()
       ├─ registerMenuItems() + registerTranslations()
       ├─ hooks.onActivate(ctx)
       ├─ register(instance, config)   → rutas bajo /api/v1/plugins/<id>
       └─ pluginRegistry.registerLoaded(...)
```

### Instalación (runtime, vía API)

```text
POST /api/v1/plugins/install  { id }
  installPlugin(app, id)
    1. manifest = pluginRegistry.getAvailableManifest(id)   (404 si no está en el catálogo)
    2. 409 si ya existe instalación
    3. config = schemaDefaults(manifest.settings)
    4. create PluginInstallation { enabled: true, config, manifest }
    5. registerPluginPermissions()
    6. hooks.onInstall(ctx)
```

> Nota: `installPlugin` **no** llama a `loadAndActivate`; las rutas del plugin recién
> instalado quedan disponibles en el **siguiente arranque** del proceso (ver
> discrepancias).

### Activación / desactivación

```text
POST /api/v1/plugins/:id/activate     → UPDATE PluginInstallation SET enabled = true
POST /api/v1/plugins/:id/deactivate   → UPDATE PluginInstallation SET enabled = false
```

Estos endpoints solo cambian el flag `enabled` en BD; no cargan/descargan el plugin en
memoria. El efecto real (montar o no las rutas) se materializa al reiniciar.

### Desinstalación

```text
DELETE /api/v1/plugins/:id
  uninstallPlugin(app, id)
    1. SELECT instalación (404 si no existe)
    2. hooks.onUninstall(ctx)   (best-effort; los errores se registran como warning)
    3. DELETE PluginInstallation
```

### Diagrama de flujo (texto)

```text
                        ┌──────────────────────────────┐
                        │         plugin.json          │
                        │  (manifiesto validado Zod)   │
                        └──────────────┬───────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │ servidor                 │                          │ cliente
            ▼                          ▼                          ▼
   definePlugin(manifest,{…})   (permisos + menú)      defineClientPlugin(manifest, mount)
   ── entry: server.ts         ── PluginInstallation      ── clientEntry: client.ts
                                       │                          │
   apps/api/src/plugins/loader.ts      │              apps/web/src/plugins/index.ts
     · discoverPlugins() ──► catálogo  │                · registerClientPlugin()
     · installPlugin() ────► onInstall │                          │
     · loadAndActivate() ──► onActivate│                          │
     · register() ────────► /api/v1/plugins/<id>                   │
     · uninstallPlugin() ──► onUninstall│                         ▼
                                       │              <PluginSlot slotId="…"/>
                                       │                · GET /plugins/placements?slotId=
                                       │                · mount(ctx) en el DOM
                                       ▼
                            ┌──────────────────────┐
                            │   PostgreSQL (Prisma) │
                            │ · PluginInstallation   │
                            │ · PluginPlacement      │
                            │ · Permission          │
                            └──────────────────────┘
```

## 8. Estado transitorio del rename «Bloques» → «Plugins»

El rename de la superficie de usuario y de la **mayor parte del naming interno** está
completo. Queda un conjunto **mínimo** de nombres `block` por retrocompatibilidad
(ADR-0005), que conviene no confundir con los canónicos:

| Nivel | Nombre canónico | Residuo `block` (transitorio) |
|-------|-----------------|-------------------------------|
| Manifiesto | `plugin.json`, `type: "plugin"` | `block.json`, `type: "block"` aceptados |
| SDK | `definePlugin`, `defineClientPlugin`, `PluginManifest` | alias `@deprecated` `defineBlock`, `BlockManifest`, … |
| Rutas API | `/api/v1/plugins/*` | shim `/api/v1/blocks/*` (deprecado) |
| Loader | `registerPlugins`, `installPlugin`, `discoverPlugins` | alias `@deprecated` `registerBlocks`, `installBlock`, … |
| Modelos Prisma | `PluginInstallation` / `PluginPlacement`, campo `pluginId` | — (renombrados; `@@map` usa `plugin_*`) |
| Permisos | `plugin.read` / `plugin.manage` | alias `@deprecated` `BlockRead` / `BlockManage` |
| Directorio físico | `plugins/*` (`pluginsDir()` → `../../plugins`) | — (renombrado) |
| Paquetes npm | `@webs/plugin-*` | — (renombrado) |
| Env de directorio | — | `BLOCK_DIR` (clave de config conservada) |
| Env de registro remoto | — | `BLOCK_REGISTRY_URL` (conservada) |
| Cache key | — | `blocks:catalog` (conservada) |

**Qué significa en la práctica:**

- **Superficie de usuario = «Plugins».** La UI, las rutas canónicas, el SDK y la
  documentación hablan de plugins.
- **Interno mayormente renombrado.** El directorio físico es `plugins/`, los modelos
  Prisma son `PluginInstallation`/`PluginPlacement` (campo `pluginId`, tablas
  `plugin_installations`/`plugin_placements`) y los paquetes npm son `@webs/plugin-*`
  (p. ej. `@webs/plugin-example`, en `plugins/example-block/`).
- **Residuo `block` (deuda técnica menor, sin migración de BD pendiente):**

  - La clave de config / env sigue siendo `BLOCK_DIR` (`apps/api/src/config/env.ts:34`),
    pero `pluginsDir()` resuelve `../../plugins` por defecto; `blocksDir()` existe como
    alias `@deprecated`.
  - El registro remoto usa `BLOCK_REGISTRY_URL` (`env.ts:35`) y la cache key
    `blocks:catalog` (`catalog.ts:133`).
  - Los alias `@deprecated` `BlockRead`/`BlockManage` (en `packages/core/src/constants.ts`)
    apuntan a los mismos valores que `PluginRead`/`PluginManage`; el seed y las rutas ya
    usan `plugin.read`/`plugin.manage`.
  - `block.json` y `type: "block"` se siguen aceptando en el manifiesto.

**Deuda técnica post-M1 (residuo opcional):** renombrar `BLOCK_DIR`, `BLOCK_REGISTRY_URL`
y la cache key `blocks:catalog` a sus equivalentes `plugin` cuando se quiera eliminar el
último rastro del naming `block`. No requiere migración de BD (modelos, directorio y npm
ya están renombrados), solo una migración de config/cache coordinada.

## 9. Permisos declarados por plugins

Un plugin declara permisos en `manifest.permissions` (lista de claves con convención
`<recurso>.<accion>`). El loader los persiste con `registerPluginPermissions()`, que hace
`upsert` sobre la tabla `Permission`:

```ts
for (const key of manifest.permissions ?? []) {
  await app.prisma.permission.upsert({
    where: { key },
    update: {},
    create: { key, description: `Permiso del plugin ${manifest.id}` },
  });
}
```

Estos permisos quedan disponibles para asignarse a roles desde la UI (módulo `roles`).

## 10. Discrepancias observadas en el sistema de plugins

1. **`onDeactivate` no se invoca.** Está declarado en `PluginHooks` (`hooks.ts`) pero el
   loader no lo llama en ningún punto; el endpoint `deactivate` solo actualiza `enabled`.
2. **Instalar/activar no recarga en caliente.** `installPlugin` ejecuta `onInstall` y crea
   la instalación, pero no llama a `loadAndActivate`; las rutas del plugin quedan
   disponibles recién al reiniciar el proceso. Ídem para `activate`/`deactivate`.
3. **Los plugins no registran secciones en el registry de ajustes.** El comentario de
   `modules/settings/registry.ts` indica que los plugins registran ahí sus ajustes, y
   `loader.ts` define `blockSettingsKey()` (que devuelve `block.<id>`), pero esa función no
   se usa y la configuración de plugin se sirve por una ruta separada
   (`/plugins/:id/settings`), no por el registry de settings.
4. **Slots de plugin como whitelist.** `manifest.slots` funciona como lista de slots
   permitidos; el loader no registra slots *nuevos* definidos por plugins (solo
   `CORE_SLOTS`), pese a que el comentario de `slots.ts` lo sugiere.
