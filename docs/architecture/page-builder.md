# Builder visual de páginas (bloques)

## Resumen

Webs resuelve «páginas no personalizables» con un **editor de bloques** propio (estilo
Gutenberg) en `/admin/pages`, que persiste el contenido estructurado de una página en
`Page.layout` (Json), la **única fuente de verdad** del contenido. La guía de uso está en
[`docs/guides/editor-paginas.md`](../guides/editor-paginas.md).

Decisión registrada en [ADR-0011](../adr/0011-page-builder.md).

## Modelo de datos

Reutiliza el modelo `Page` existente (sin tabla nueva):

```prisma
// apps/api/prisma/schema.prisma
model Page {
  id          String   @id @default(uuid())
  slug        String   @unique
  title       String
  layout      Json     @default("[]")
  redirectUrl String?
  isHome      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("pages")
}
```

- `layout` guarda la **estructura de secciones + bloques** producida por el editor.
- `isHome` marca la **página de inicio** (única; ver más abajo).

## Estructura del layout

`Page.layout` es un array de secciones. Cada sección tiene un `size`
(`full`/`half`/`third`) y un array de `blocks`. Un bloque puede ser:

- una **cadena** = `pluginId` (se monta el `clientEntry` de ese plugin), o
- un **objeto estructurado** = `{ type, content, ... }` para los elementos nativos
  (`heading`, `text`, `image`, `divider`, `spacer`, `html`).

```jsonc
// layout (fragmento)
[
  {
    "size": "full",
    "blocks": [
      { "type": "heading", "content": "Bienvenido", "level": 1 },
      "store" // pluginId → clientEntry del plugin store
    ]
  },
  { "size": "half", "blocks": [ /* … */ ] }
]
```

El editor manipula directamente `PageSection[]`/`PageElement[]` (sin DOM intermedio) y
renderiza con el mismo `PageRenderer` que el sitio público.

## Editor visual

- `apps/web/src/features/pages/PagesPage.tsx` — listado y editor: top bar, lienzo,
  inserter de bloques, inspector y previsualización responsive.
- `apps/web/src/features/pages/{BlockCanvas,BlockInserter,BlockInspector}.tsx` y
  `useBlockHistory.ts` — lienzo, catálogo, panel de propiedades y undo/redo.
- Ruta: `/admin/pages` (permiso `content.write`); `/admin/editor` redirige allí.
- Bloques disponibles en el lienzo (drag & drop):
  - **Secciones**: `full`, `half`, `third`.
  - **Elementos nativos**: heading, text, image, divider, spacer, html.
  - **Un bloque por plugin instalado** (cada plugin puede aportar su bloque al editor).
- Sin dependencia de builder externo: GrapesJS se retiró del proyecto.

## Guardado

El editor persiste por dos vías, ambas con **saneado** de HTML en la API
(`apps/api/src/lib/sanitize.ts`, `sanitize-html`):

- `POST /api/v1/pages/save` — *upsert* por `slug` (`page.upsert({ where: { slug } })`).
  Si `isHome: true`, desmarca la home previa (`updateMany({ data: { isHome: false } })`).
- `PATCH /api/v1/pages/:id` — actualiza una página existente (mismo saneado y mismo
  tratamiento de home).

`sanitizeLayout()` recorre `layout[].blocks[]`: sanea el `content` HTML de los **objetos**
y deja intactas las **cadenas** (`pluginId`). Esto elimina `<script>` y handlers inline
antes de persistir.

## Render

- **Público**: el renderizador recorre `Page.layout` y, por cada bloque, renderiza los
  objetos nativos o monta el `clientEntry` del plugin (mismo mecanismo que un *placement*).
- **Admin/editor**: `PageLayoutView` ofrece la vista en vivo antes de guardar.
- No se renderiza el HTML crudo de GrapesJS: se **reconstruye** desde el JSON estructurado
  (un solo renderizador, sin duplicar).

## Página de inicio configurable

- El editor permite marcar una página como **home** (`PATCH /pages/:id { isHome: true }`),
  y la API garantiza que haya **una sola** (desmarca las demás).
- El enrutado público resuelve la home por `isHome` (slug `home`/vacío), no por slug fijo.

## Seguridad

1. El HTML/CSS generado se **sanea** en la API con `sanitize-html` (sin `<script>`, sin
   handlers inline) antes de guardar.
2. El render público **escapa por defecto** y reconstruye desde el JSON estructurado.
3. El editor solo es accesible con `content.write`; la lectura pública solo expone
   `slug`/`title`/`isHome` (`GET /public/pages`).

## Referencias

- ADR: [`docs/adr/0011-page-builder.md`](../adr/0011-page-builder.md).
- Endpoints: `apps/api/src/modules/pages/routes.ts`.
- Ejemplo de layout real: `templates/tienda.json` (`pages[].layout[].blocks`).
- Sistema de estilos: [`settings-theming.md`](settings-theming.md) (los bloques nativos
  usan Tailwind + primitivas Shadcn UI, ADR-0009).
