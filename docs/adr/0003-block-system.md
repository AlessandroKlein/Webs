# ADR-0003: Sistema de bloques con manifiesto + SDK + slots

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 0.1.0 del monorepo)
- **Decisión:** Extensibilidad tipo WordPress mediante bloques autocontenidos: manifiesto
  `block.json`, SDK (`@webs/plugin-sdk`) y regiones de render (**slots** / **placements**).

## Contexto

El cliente final debe poder extender la plataforma (rutas, componentes de UI, ajustes,
permisos, traducciones) **sin tocar el código del núcleo**. Se necesita un contrato
versionado y ligero, y un mecanismo para colocar bloques en regiones del sitio.

## Decisión

- **Manifiesto `block.json`** como contrato público (`BLOCK_MANIFEST_FILENAME`,
  `BLOCK_API_VERSION = '1.0.0'`), validado con Zod en runtime.
- **SDK** `@webs/plugin-sdk` con:
  - `defineBlock(manifest, { register, hooks })` — entrada de servidor (default export).
  - `defineClientBlock(manifest, mount)` — entrada de cliente (default export).
  - Tipos estructurales de contexto (`ServerBlockContext`, `ClientBlockContext`) y hooks
    (`onInstall`, `onUninstall`, `onActivate`, `onDeactivate`).
- **Slots base** (`header`, `content`, `sidebar`, `footer`) y **placements** (instancia de
  bloque en un slot con orden y config) persistidos en `BlockPlacement`.
- **Loader** en `apps/api/src/blocks/loader.ts`: descubre el catálogo, instala/desinstala y
  activa bloques montando su plugin Fastify bajo `/api/v1/blocks/<id>`.
- **Registro de cliente** en `apps/web/src/blocks/`: los bloques se empaquetan en build y
  se montan en el DOM vía `<BlockSlot slotId="…"/>`.

## Consecuencias

**Positivas**

- Desacoplamiento total: el núcleo no conoce los bloques; solo el contrato.
- La configuración de bloque se describe con JSON Schema y se renderiza sin UI a medida.
- El mismo bloque puede colocarse varias veces con distinta configuración (placements).
- Los permisos del bloque se registran automáticamente en la tabla `Permission`.

**Negativas / costes**

- El ciclo de vida está parcialmente implementado: `onDeactivate` no se invoca y
  activar/desactivar/instalar no recarga en caliente las rutas (requieren reinicio).
- La carga de bloques en el cliente es estática (build); la carga dinámica en runtime
  (importmap/module federation) queda como evolución futura.

## Notas

Detalles completos en `docs/architecture/plugin-system.md` (renombrado desde
`block-system.md`).

> **Supersedido en superficie por ADR-0005:** el rename «Bloques» → «Plugins»
> renombra la unidad de extensión y añade integración nativa al menú. La
> decisión de este ADR (contrato manifiesto + SDK + slots/placements) sigue
> vigente; el *naming interno* `block` se conserva de forma transitoria.
