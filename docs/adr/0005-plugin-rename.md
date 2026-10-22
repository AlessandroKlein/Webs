# ADR-0005: Renombrar «Bloques» a «Plugins» con integración nativa al menú

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 1)
- **Decisión:** Renombrar la unidad de extensibilidad de «Bloques» a «Plugins» en todo el
  contrato público (manifiesto, SDK, rutas, permisos, modelos Prisma, directorio e i18n) y
  eliminar la categoría separada de navegación: cada plugin instalado aparece como un ítem
  **nativo** del menú principal (admin y público), indistinguible de los ítems del núcleo.

## Contexto

Hoy la plataforma denomina «bloques» a su unidad de extensión: manifiesto `block.json` con
`type: "block"`, SDK `@webs/plugin-sdk` (el nombre del paquete ya dice *plugin*, pero sus
exports son `defineBlock`/`defineClientBlock`), modelos `BlockInstallation`/`BlockPlacement`,
directorio `blocks/*` (30+ bloques), rutas `/api/v1/blocks/*`, permisos `block.read` /
`block.manage` y acciones de auditoría `block.*` (ver `apps/api/src/modules/blocks/routes.ts`,
`apps/api/prisma/seed.ts:21-22` y `packages/core/src/constants.ts:45-46`).

En el frontend, `apps/web/src/layouts/AdminLayout.tsx` mantiene una navegación **hardcodeada**:
`coreNav` (17 ítems del núcleo) más `blockNav` (12 rutas tipo-bloque: blog, social, chat,
calendario, formularios, comercio, facturas, analytics, notificaciones, auth, organizaciones,
inventario) que se renderizan bajo una sección colapsable «Bloques instalados»
(`nav.installedBlocks`). Ese grupo separado es exactamente la «categoría Plugins» que el
objetivo de producto pide eliminar.

El menú público ya es dirigido por datos: `apps/web/src/components/SiteHeader.tsx` consume
`GET /api/v1/public/menu` (que vive en `apps/api/src/modules/settings/routes.ts`) y el menú
principal se persiste en la tabla `Menu` con clave `'main'` (`apps/api/src/modules/menu/routes.ts`).
Ese es el punto de integración natural para que los plugins registren ítems de menú.

## Decisión

### 1. Renombrado integral «Bloques» → «Plugins»

Renombrado **duro** (breaking change) de todo el contrato público, sin mantel de
compatibilidad permanente más que una shim de transición (ver Consecuencias):

| Superficie | Antes | Después |
|---|---|---|
| Manifiesto | `block.json`, `type: "block"` | `plugin.json`, `type: "plugin"` |
| Constantes de contrato | `BLOCK_MANIFEST_FILENAME`, `BLOCK_API_VERSION` | `PLUGIN_MANIFEST_FILENAME`, `PLUGIN_API_VERSION` (mantiene `'1.0.0'`) |
| SDK (`@webs/plugin-sdk`) | `defineBlock`, `defineClientBlock`, `ServerBlockContext`, `ClientBlockContext` | `definePlugin`, `defineClientPlugin`, `ServerPluginContext`, `ClientPluginContext` |
| Componentes de cliente | `<BlockSlot slotId=…>` | `<PluginSlot slotId=…>` |
| Directorio | `blocks/*` | `plugins/*` |
| Modelos Prisma | `BlockInstallation`, `BlockPlacement` | `PluginInstallation`, `PluginPlacement` |
| Rutas API | `/api/v1/blocks/*` | `/api/v1/plugins/*` |
| Permisos | `block.read`, `block.manage` | `plugin.read`, `plugin.manage` |
| Constantes TS | `BlockRead`, `BlockManage` | `PluginRead`, `PluginManage` |
| Auditoría | acciones `block.install`/`activate`/…, resource `block` | `plugin.install`/`activate`/…, resource `plugin` |
| i18n | `nav.blocks`, `nav.installedBlocks`, … | `nav.plugins`, sin sección «instalados» separada |

El nombre del paquete SDK **no cambia** (`@webs/plugin-sdk` ya era «plugin»).

### 2. Integración nativa al menú (sin categoría separada)

Se introduce un **registro de menú** que unifica ítems del núcleo y de plugins:

- **Contrato del manifiesto** — el campo nuevo `menu?: PluginMenuItem[]`, con:

  ```ts
  interface PluginMenuItem {
    id: string;                       // único dentro del plugin
    label: LocalizedString;           // { es: string; en?: string; ... }
    path: string;                     // ruta absoluta (admin o pública)
    section?: string;                 // grupo lógico opcional (agrupación visual, no categoría separada)
    icon?: string;                    // nombre de icono (lucide) o emoji
    order?: number;                   // 0 = primero; default 100
    parent?: string;                  // id de un ítem del menú (submenú)
    permissions?: string[];           // permisos requeridos para verlo
    target: 'admin' | 'public' | 'both';
  }
  ```

- **Registro en servidor** — el loader (`apps/api/src/blocks/loader.ts`, renombrado
  `loader.ts` bajo `apps/api/src/plugins/`) expone en el contexto del plugin un hook
  `register({ addMenuItem })`. Los ítems registrados se persisten en una nueva tabla
  `PluginMenuItem` (`pluginId`, `id`, `label`, `path`, `section?`, `icon?`, `order`,
  `parent?`, `permissions`, `target`), de modo que **desactivar un plugin elimina sus ítems**
  y la instalación los restaura.

- **Ensamblado del menú** — `GET /menu` (admin) y `GET /public/menu` (público) devuelven la
  unión **core + plugins**, ordenada por `(section, order, label)`, con los ítems de plugins
  indistinguibles de los nativos. El núcleo sigue controlando ítems estructurales (Dashboard,
  Ajustes, Usuarios…) a través del mismo registro; los plugins solo **añaden** ítems.

- **Frontend dirigido por datos** — `AdminLayout` deja de usar `coreNav`/`blockNav` hardcodeados
  y consume `GET /menu` filtrando por `permissions` del usuario. `SiteHeader` sigue consumiendo
  `GET /public/menu`, que ahora incluye los ítems públicos de plugins.

- **Colocación por slots se mantiene** — `PluginPlacement` (ex `BlockPlacement`) sigue gobernando
  el render en regiones (header/content/sidebar/footer); el menú es un canal **ortogonal** a los
  slots: un plugin puede aportar menú, slots o ambos.

## Consecuencias

**Positivas**

- Terminología coherente y alineada con el SDK (`plugin-sdk`) y con el objetivo de producto.
- El menú deja de estar hardcodeado: añadir un plugin que aporte una página no exige editar el
  layout; basta declarar `menu` en su manifiesto.
- La experiencia cumple el requisito: los plugins aparecen como ítems nativos, sin categoría
  «Plugins» separada.

**Negativas / costes**

- **Breaking change** en rutas, permisos y manifiestos: exige migración de los 30+ `block.json`
  existentes, renombrado de tablas Prisma, de permisos sembrados y de claves i18n.
- Ventana de transición: se publica una **shim** `/api/v1/blocks/*` → `/api/v1/plugins/*` y
  aceptación de `block.json` (deprecado) durante el Milestone 1, retirada en Milestone 2.
- Riesgo de regresiones en la navegación mientras `AdminLayout` migra de nav estática a menú
  dirigido por API (el fallback inicial debe replicar el menú actual del núcleo).

## Notas

- Este ADR **renombra y amplía** la superficie que ADR-0003 definió como «sistema de bloques»;
  ADR-0003 queda vigente en lo estructural (manifiesto + SDK + slots) salvo la nomenclatura.
- Baseline sync requerida: `docs/architecture/block-system.md` debe renombrarse a
  `plugin-system.md` y actualizarse; `docs/architecture/nucleo-plugins.md` y las guías
  (`crear-un-bloque.md`, `marketplace-de-bloques.md`, `plantillas.md`) deben renombrar
  «bloque»→«plugin». Esto se ejecuta en las tareas de implementación del rename.
- Detalle completo en `docs/architecture/refactor-global.md`.
