# Sistema de bloques (plugins)

Este es el **documento central** de la arquitectura de Webs. Describe el mecanismo de
extensibilidad tipo *WordPress*: **bloques** autocontenidos que extienden la plataforma
(rutas, componentes de cliente, ajustes, permisos, traducciones) sin modificar el núcleo.

## Conceptos clave

| Concepto | Definición | Dónde se define |
|----------|------------|-----------------|
| **Bloque** | Paquete autocontenido con un manifiesto `block.json`, una entrada de servidor (`server.ts`) y una entrada de cliente (`client.ts`). | `blocks/*` |
| **Manifiesto** | `block.json`: contrato público (metadatos, entradas, settings, permisos, slots). | `packages/plugin-sdk/src/manifest.ts` |
| **SDK** | `@webs/plugin-sdk`: `defineBlock`, `defineClientBlock`, tipos de contexto y hooks. | `packages/plugin-sdk/src/*` |
| **Slot** | Región nombrada del sitio (header, content, sidebar, footer) donde se colocan bloques. | `apps/api/src/blocks/slots.ts` |
| **Placement (colocación)** | Instancia concreta de un bloque dentro de un slot, con orden y configuración propia. | `packages/plugin-sdk/src/slot.ts` + modelo `BlockPlacement` |
| **Catálogo** | Bloques *disponibles* (descubiertos del directorio de bloques) pero no instalados. | `blockRegistry.getAvailable()` |
| **Instalación** | Registro en BD (`BlockInstallation`) de un bloque instalado, con su `config`. | `apps/api/src/blocks/loader.ts` |

## 1. El manifiesto `block.json`

El manifiesto es la fuente de verdad estática de un bloque. Se valida en runtime con
**Zod** (`parseBlockManifest` en `packages/plugin-sdk/src/manifest.ts`).

### Campos del manifiesto

| Campo | Tipo | Requerido | Descripción / validación |
|-------|------|-----------|---------------------------|
| `name` | `string` | Sí | Nombre de paquete estilo npm, p. ej. `@webs/block-example`. |
| `id` | `string` | Sí | Slug único del bloque. Regex `^[a-z0-9][a-z0-9-_]*$`. |
| `version` | `string` | Sí | Versión semántica (`^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$`). |
| `type` | `'block'` | Sí | Tipo de extensión; reservado a `block`. |
| `displayName` | `LocalizedString` | Sí | Nombre visible; mapa locale BCP-47 → texto (al menos una localización). |
| `description` | `LocalizedString` | Sí | Descripción localizada. |
| `author` | `string` | Sí | Autor(es). |
| `license` | `string` | No | Licencia SPDX (p. ej. `MIT`). |
| `homepage` | `string` (URL) | No | URL del proyecto. |
| `icon` | `string` | No | Clave de icono o nombre de archivo. |
| `keywords` | `string[]` | No | Palabras clave para el catálogo. |
| `entry` | `string` | No | Entrada de servidor relativa al paquete. Default del loader: `./dist/server.js`. |
| `clientEntry` | `string` | No | Entrada de cliente relativa al paquete. Default del loader: `./dist/client.js`. |
| `settings` | `JsonSchema` | No | Esquema JSON de la configuración del bloque (genera el formulario de admin). |
| `permissions` | `string[]` | No | Permisos que el bloque declara (se registran en BD al instalar/cargar). |
| `slots` | `string[]` | No | Slots donde el bloque **puede** ubicarse (whitelist). |
| `dependencies` | `Record<string,string>` | No | Dependencias npm (peers) declarativas. |
| `apiVersion` | `string` | Sí | Versión del contrato de bloques contra la que se escribió (`1.0.0`). |

### Ejemplo real

```jsonc
// blocks/example-block/block.json
{
  "name": "@webs/block-example",
  "id": "example",
  "version": "0.1.0",
  "type": "block",
  "displayName": { "en": "Example block", "es": "Bloque de ejemplo" },
  "description": { "en": "Reference block…", "es": "Bloque de referencia…" },
  "author": "Webs",
  "license": "MIT",
  "entry": "./dist/server.js",
  "clientEntry": "./dist/client.js",
  "apiVersion": "1.0.0",
  "slots": ["content"],
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
export const BLOCK_API_VERSION = '1.0.0';
export const BLOCK_MANIFEST_FILENAME = 'block.json';
```

## 2. El SDK (`@webs/plugin-sdk`)

El SDK define el contrato y las fábricas. No depende de Fastify/Prisma en runtime: expone
**tipos estructurales**; la plataforma inyecta los objetos reales.

### `defineBlock` (servidor)

`packages/plugin-sdk/src/define.ts` — valida el manifiesto y devuelve un `ServerBlock`:

```ts
export interface ServerBlock {
  manifest: BlockManifest;
  hooks: BlockHooks;
  register?: BlockRegisterFn;   // plugin Fastify opcional
}

export function defineBlock(manifest: BlockManifest, opts: DefineBlockOptions = {}): ServerBlock
```

```ts
// src/server.ts de un bloque
import { defineBlock } from '@webs/plugin-sdk';

export default defineBlock(manifest, {
  register: async (fastify) => {
    fastify.get('/', async () => ({ ok: true }));
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('instalado'),
  },
});
```

### `defineClientBlock` (cliente)

Devuelve un `ClientBlock` cuya función `mount` recibe el contenedor y opcionalmente
devuelve una función de limpieza:

```ts
export interface ClientBlock {
  manifest: BlockManifest;
  mount: (ctx: ClientBlockContext) => void | (() => void);
}

export function defineClientBlock(manifest: BlockManifest, mount: ClientBlock['mount']): ClientBlock
```

> El `mount` puede usar React, Vue o DOM puro: el contrato solo pide montar en un
> `HTMLElement` y devolver un cleanup. Ver `blocks/example-block/src/client.ts`.

### Hooks de ciclo de vida

Definidos en `packages/plugin-sdk/src/hooks.ts`:

```ts
export interface BlockHooks {
  onInstall?:    (ctx: ServerBlockContext) => void | Promise<void>;
  onUninstall?:  (ctx: ServerBlockContext) => void | Promise<void>;
  onActivate?:   (ctx: ServerBlockContext) => void | Promise<void>;
  onDeactivate?: (ctx: ServerBlockContext) => void | Promise<void>;
}
```

| Hook | Cuándo se dispara (implementación real) | Origen |
|------|------------------------------------------|--------|
| `onInstall` | Al instalar el bloque (`installBlock`), después de crear el registro en BD. | `loader.ts` |
| `onUninstall` | Al desinstalar (`uninstallBlock`), antes de borrar el registro. | `loader.ts` |
| `onActivate` | Al **cargar/activar** un bloque instalado con `enabled: true` (arranque). | `loadAndActivate()` |
| `onDeactivate` | **Declarado en el SDK pero NO invocado** por el loader actual. | — (discrepancia, ver abajo) |

### `ServerBlockContext`

```ts
export interface ServerBlockContext {
  fastify: unknown;                  // FastifyInstance real
  logger: BlockLogger;               // logger con .child({ block })
  services: BlockServices;           // { db, cache, events }
  config: Record<string, unknown>;   // ajustes resueltos desde BD
  installationId: string;            // id de la instalación
}
```

`BlockServices` expone `db` (Prisma), `cache` y `events` (Redis, opcionales). El loader
los construye en `makeContext()` (`apps/api/src/blocks/loader.ts`):

```ts
services: { db: fastify.prisma, cache: fastify.redis, events: fastify.redis }
```

### `ClientBlockContext`

```ts
export interface ClientBlockContext {
  container: HTMLElement;
  slot: string;
  locale: string;
  config: Record<string, unknown>;
  api: BlockApiClient;   // get/post/put/del sobre la API
  i18n: BlockI18n;       // t(key), locale
  theme: BlockTheme;     // { mode: 'light'|'dark', tokens }
}
```

## 3. Slots y colocaciones (placements)

### Slots base

`apps/api/src/blocks/slots.ts` define las regiones nativas del sitio:

```ts
export const CORE_SLOTS: SlotDefinition[] = [
  { id: 'header',  displayName: { es: 'Cabecera', en: 'Header' } },
  { id: 'content', displayName: { es: 'Contenido', en: 'Content' } },
  { id: 'sidebar', displayName: { es: 'Barra lateral', en: 'Sidebar' } },
  { id: 'footer',  displayName: { es: 'Pie de página', en: 'Footer' } },
];
```

`SlotDefinition` (`packages/plugin-sdk/src/slot.ts`) permite además `description`,
`maxBlocks` y `required` (opcionales). Los bloques indican en `manifest.slots` en qué
slots tienen permitido ubicarse (whitelist). En el estado actual, el loader solo registra
`CORE_SLOTS`; el campo `slots` del manifiesto actúa como whitelist declarativa.

### Colocaciones

Una **colocación** es la instancia de un bloque dentro de un slot. Persiste en el modelo
`BlockPlacement` de Prisma (`apps/api/prisma/schema.prisma`):

```prisma
model BlockPlacement {
  id        String   @id @default(uuid())
  blockId   String
  slotId    String
  order     Int      @default(0)
  enabled   Boolean  @default(true)
  config    Json     @default("{}")
  // …
  @@index([slotId])
}
```

El admin puede colocar el mismo bloque varias veces con distinta configuración y orden.
La API `PUT /api/v1/placements` reemplaza todas las colocaciones de un slot de forma
transaccional (`apps/api/src/modules/blocks/routes.ts`).

## 4. Loader del backend

`apps/api/src/blocks/loader.ts` es el orquestador. Sus funciones clave:

| Función | Responsabilidad |
|---------|-----------------|
| `resolveBlockDir(app)` | Resuelve el directorio de bloques desde `app.config.BLOCK_DIR` (default `../../blocks`). |
| `discoverBlocks(blockDir)` | Escanea el directorio, lee cada `block.json`, lo valida y lo añade al **catálogo**. |
| `resolvePackageDir(app, manifest)` | Localiza el directorio del paquete por `id` o por el tramo final de `name`. |
| `loadBlockEntry(pkgDir, manifest)` | Importa `manifest.entry` y exige un `default` que sea `ServerBlock`. |
| `schemaDefaults(schema)` | Extrae los `default` del JSON Schema para la configuración inicial. |
| `registerBlockPermissions(app, manifest)` | Hace `upsert` de cada `manifest.permissions` en la tabla `Permission`. |
| `loadAndActivate(app, installation)` | Registra permisos, ejecuta `onActivate` y registra el plugin Fastify bajo `/api/v1/blocks/<id>`. |
| `registerBlocks(app)` | Arranque: registra slots base, descubre el catálogo y activa las instalaciones `enabled`. |
| `installBlock(app, blockId)` | Crea `BlockInstallation` (config = defaults del schema), registra permisos y ejecuta `onInstall`. |
| `uninstallBlock(app, blockId)` | Ejecuta `onUninstall` y borra la instalación. |

### Registro del plugin Fastify

Cada bloque instalado se monta en su propio scope con prefijo
`/api/v1/blocks/<id>` (`loadAndActivate`):

```ts
await app.register(async (instance) => {
  const ctx = makeContext(instance, serverBlock, config, installation.id);
  if (serverBlock.hooks.onActivate) await serverBlock.hooks.onActivate(ctx);
  if (serverBlock.register) await serverBlock.register(instance, config);
}, { prefix: `${API_PREFIX}/blocks/${manifest.id}` });
```

> La configuración del bloque vive en `BlockInstallation.config` (fuente de verdad) y se
> expone/edita vía `GET/PUT /api/v1/blocks/:id/settings`. El `PUT` valida contra
> `manifest.settings` con Ajv antes de persistir.

### Registro en memoria

`apps/api/src/blocks/registry.ts` mantiene tres mapas en memoria:

```ts
class BlockRegistry {
  available: Map<string, BlockManifest>;   // catálogo (descubiertos)
  loaded:    Map<string, LoadedBlock>;     // instalados + activados
  slots:     Map<string, SlotDefinition>;  // slots registrados
}
```

## 5. Registro de cliente

En el frontend, los bloques se empaquetan en **tiempo de build** y se importan
estáticamente en `apps/web/src/blocks/index.ts`:

```ts
import { registerClientBlock } from './registry';
import exampleBlock from '@webs/block-example/client';

registerClientBlock(exampleBlock);
```

`apps/web/src/blocks/registry.ts` expone `registerClientBlock` y `getClientBlock(id)`.
La carga dinámica en runtime (importmap / module federation) se menciona en el código
como evolución futura.

El componente `apps/web/src/blocks/BlockSlot.tsx`:

1. Obtiene las colocaciones del slot vía `GET /api/v1/placements?slotId=<id>`.
2. Filtra `enabled`, ordena por `order`.
3. Monta cada bloque con `getClientBlock(blockId).mount(ctx)` construyendo el
   `ClientBlockContext` (container, slot, locale, config, api, i18n, theme).

El sitio público (`apps/web/src/features/public/PublicHome.tsx`) renderiza los slots
`header`, `content`, `sidebar` y `footer` con `<BlockSlot slotId="…" />`.

## 6. Ciclo de vida completo

### Arranque

```text
app.ts → registerBlocks(app)
  1. Registrar CORE_SLOTS en blockRegistry
  2. discoverBlocks(BLOCK_DIR)         → catálogo (available)
  3. SELECT * FROM BlockInstallation WHERE enabled = true
  4. Para cada instalación → loadAndActivate()
       ├─ parseBlockManifest(manifest)
       ├─ registerBlockPermissions()
       ├─ hooks.onActivate(ctx)
       ├─ register(instance, config)   → rutas bajo /api/v1/blocks/<id>
       └─ blockRegistry.registerLoaded(...)
```

### Instalación (runtime, vía API)

```text
POST /api/v1/blocks/install  { id }
  installBlock(app, id)
    1. manifest = blockRegistry.getAvailableManifest(id)   (404 si no está en el catálogo)
    2. 409 si ya existe instalación
    3. config = schemaDefaults(manifest.settings)
    4. create BlockInstallation { enabled: true, config, manifest }
    5. registerBlockPermissions()
    6. hooks.onInstall(ctx)
```

> Nota: `installBlock` **no** llama a `loadAndActivate`; las rutas del bloque recién
> instalado quedan disponibles en el **siguiente arranque** del proceso (ver
> discrepancias).

### Activación / desactivación

```text
POST /api/v1/blocks/:id/activate     → UPDATE BlockInstallation SET enabled = true
POST /api/v1/blocks/:id/deactivate   → UPDATE BlockInstallation SET enabled = false
```

Estos endpoints solo cambian el flag `enabled` en BD; no cargan/descargan el plugin en
memoria. El efecto real (montar o no las rutas) se materializa al reiniciar.

### Desinstalación

```text
DELETE /api/v1/blocks/:id
  uninstallBlock(app, id)
    1. SELECT instalación (404 si no existe)
    2. hooks.onUninstall(ctx)   (best-effort; los errores se registran como warning)
    3. DELETE BlockInstallation
```

### Diagrama de flujo (texto)

```text
                        ┌──────────────────────────────┐
                        │         block.json           │
                        │  (manifiesto validado Zod)   │
                        └──────────────┬───────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │ servidor                 │                          │ cliente
            ▼                          ▼                          ▼
   defineBlock(manifest,{…})   (registro de permisos)   defineClientBlock(manifest, mount)
   ── entry: server.ts         ── BlockInstallation      ── clientEntry: client.ts
                                       │                          │
   apps/api/src/blocks/loader.ts       │              apps/web/src/blocks/index.ts
     · discoverBlocks() ──► catálogo   │                · registerClientBlock()
     · installBlock() ────► onInstall  │                          │
     · loadAndActivate() ─► onActivate │                          │
     · register() ────────► /api/v1/blocks/<id>                    │
     · uninstallBlock() ──► onUninstall│                          ▼
                                       │              <BlockSlot slotId="…"/>
                                       │                · GET /placements?slotId=
                                       │                · mount(ctx) en el DOM
                                       ▼
                           ┌──────────────────────┐
                           │   PostgreSQL (Prisma) │
                           │ · BlockInstallation   │
                           │ · BlockPlacement      │
                           │ · Permission          │
                           └──────────────────────┘
```

## 7. Permisos declarados por bloques

Un bloque declara permisos en `manifest.permissions` (lista de claves con convención
`<recurso>.<accion>`). El loader los persiste con `registerBlockPermissions()`, que hace
`upsert` sobre la tabla `Permission`:

```ts
for (const key of manifest.permissions ?? []) {
  await app.prisma.permission.upsert({
    where: { key },
    update: {},
    create: { key, description: `Permiso del bloque ${manifest.id}` },
  });
}
```

Estos permisos quedan disponibles para asignarse a roles desde la UI (módulo `roles`).

## 8. Discrepancias observadas en el sistema de bloques

1. **`onDeactivate` no se invoca.** Está declarado en `BlockHooks` (`hooks.ts`) pero el
   loader no lo llama en ningún punto; el endpoint `deactivate` solo actualiza `enabled`.
2. **Instalar/activar no recarga en caliente.** `installBlock` ejecuta `onInstall` y crea
   la instalación, pero no llama a `loadAndActivate`; las rutas del bloque quedan
   disponibles recién al reiniciar el proceso. Ídem para `activate`/`deactivate`.
3. **Los bloques no registran secciones en el registry de ajustes.** El comentario de
   `modules/settings/registry.ts` indica que los bloques registran ahí sus ajustes, y
   `loader.ts` define `blockSettingsKey()` (que devuelve `block.<id>`), pero esa función no
   se usa y la configuración de bloque se sirve por una ruta separada
   (`/blocks/:id/settings`), no por el registry de settings.
4. **Slots de bloque como whitelist.** `manifest.slots` funciona como lista de slots
   permitidos; el loader no registra slots *nuevos* definidos por bloques (solo
   `CORE_SLOTS`), pese a que el comentario de `slots.ts` lo sugiere.
