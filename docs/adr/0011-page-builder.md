# ADR-0011: Builder visual de páginas (GrapesJS)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 2)
- **Decisión:** Adoptar **GrapesJS** (MIT) como *builder visual* de páginas **autoalojado y sin
  pago**, integrado al panel de administración. El editor genera/edita el contenido de una página
  y lo persiste a través de la ruta dinámica **`POST /api/v1/pages/save`** (extiende el CRUD de
  páginas existente). El *frontend* público renderiza los **bloques guardados** leyendo
  `Page.layout` (estructura de secciones + bloques) y resuelve los bloques que son *plugins* a su
  `clientEntry`. La **página de inicio** es configurable mediante el flag `Page.isHome` (única).

## Contexto

Webs es una base universal donde el cliente arma la app final (blog, tienda, gimnasio, logística)
combinando plugins y una plantilla. Uno de los bugs históricos del equipo es «páginas no
personalizables»: el contenido de una página era texto plano, sin edición visual.

El estado actual del código ya anticipa el modelo:

- `apps/api/prisma/schema.prisma:593-604` define `model Page { id, slug @unique, title, layout Json
  @default("[]"), redirectUrl?, isHome Boolean @default(false), createdAt, updatedAt }`.
- `apps/api/src/modules/pages/routes.ts` ya expone `GET/POST /pages`, `PATCH/DELETE /pages/:id`
  (permisos `content.read`/`content.write`), `GET /public/pages` y `GET /public/page/:slug`
  (el slug `home` resuelve la página con `isHome`). Al guardar con `isHome: true`, `POST /pages`
  y `PATCH /pages/:id` desmarcan las demás (`updateMany({ data: { isHome: false } })`), de modo que
  **la home es única**.
- `apps/api/src/modules/templates.ts` aplica plantillas (`templates/*.json`) cuyos `pages[]` tienen
  `{ slug, title, isHome, layout[] }`; en `layout[].blocks`, una **cadena** es el `id` de un plugin
  y un **objeto** es un bloque estructurado (`{ type: 'heading'|'text', content, level }`).
  Ejemplo real: `templates/tienda.json` define la home con secciones `full`/`half`.

Lo que falta es la **edición visual**: hoy `Page.layout` solo se edita por API/JSON.

## Decisión

### Opciones evaluadas

| Opción | Licencia | Hosting | ¿Builder visual? | Veredicto |
|--------|----------|---------|------------------|-----------|
| **GrapesJS** | MIT | Self-hosted (npm) | Sí, canvas drag-drop de bloques + HTML/CSS | ✅ Elegida |
| **Builder.io** | Propietaria / SaaS | SaaS (requiere cuenta + API key) | Sí | ❌ SaaS de pago, viola «todo nativo, sin modo de pago» |
| **Headless CMS** (Contentful, Prismic, Sanity, Strapi) | SaaS o MIT (solo Strapi) | SaaS o servidor propio | Editor de contenido, no *page builder* | ❌ Agrega un segundo sistema; los SaaS son de pago |
| **Editor HTML plano** (textarea + sanitize) | — | — | No (texto) | ❌ No resuelve el bug de personalización |

**Razones de la elección de GrapesJS:**

- **Licencia MIT**: autoalojado, sin cuota, sin cuenta ni API key externa — coherente con la
  política «todo nativo, sin modo de pago» (ver `docs/architecture/politica-dependencias.md`).
- **Sin servicio externo**: se sirve desde `apps/web`, no depende de un SaaS que pueda cortar el
  acceso o cambiar precios.
- **Modelo de "bloques" nativo**: GrapesJS compone el lienzo con *blocks* que se arrastran, lo que
  encaja con el sistema de plugins de Webs (cada plugin puede aportar su bloque al editor).
- **Salida HTML/CSS portable**: el resultado se guarda y se puede sanear con `sanitize-html` (ya
  dependencia de `apps/api`) antes de persistir.
- **Mantenido y popular**: ecosistema activo, plugins de estilos/forms/export.

### Diseño de integración

1. **Ruta de guardado** `POST /api/v1/pages/save` (y `PATCH /api/v1/pages/:id`) persiste la página
   completa: `slug`, `title`, `isHome`, y el `layout` estructurado producido por el editor. Se
   mantiene `Page.layout` (Json) como **fuente de verdad** del contenido.
2. **Render de bloques guardados**: el renderizador público/administrativo recorre `Page.layout`
   (secciones con `size` y `blocks[]`) y, por cada bloque:
   - si es un **objeto estructurado** (`type: heading/text/…`) lo renderiza nativamente;
   - si es una **cadena** (`id` de plugin), monta el `clientEntry` de ese plugin
     (`defineClientPlugin(manifest, mount)`), igual que un *placement*.
3. **Página de inicio configurable**: el editor permite marcar `isHome` (una sola). `GET /public/page/home`
   y el enrutado público resuelven la home por `isHome`, no por slug fijo.
4. **Seguridad**: el HTML/CSS generado por GrapesJS se **sanea** en la API con `sanitize-html`
   antes de guardar (sin `<script>`, sin handlers inline), y el render público escapa por defecto.
5. **Bloques aportados por plugins**: un plugin declara en su `plugin.json` los bloques de GrapesJS
   que ofrece (extensión de `manifest.menu`/`slots`), de modo que el editor muestra los bloques
   nativos + los bloques de los plugins instalados.

## Consecuencias

**Positivas:**

- Resuelve el bug «páginas no personalizables» con edición visual real, sin pagar un SaaS.
- `Page.layout` ya existe: el cambio es aditivo (editor + endpoint), no rompe el modelo actual.
- Coherencia con las plantillas: un `template.json` define la home, y el builder la ajusta después.
- Sin *vendor lock-in*: la salida es HTML/CSS + estructura JSON propia.

**Negativas:**

- GrapesJS es *canvas* (DOM controlado); hace falta un **bridge React** (`apps/web`) para
  incrustarlo y serializar/deserializar entre `Page.layout` y el lienzo.
- El HTML generado puede ser verboso; hay que normalizarlo antes de guardar.
- Curva de aprendizaje y mantenimiento de un editor de terceros (aunque MIT).
- Hay que evitar duplicar el render: un solo renderizador lee `Page.layout` (no el HTML crudo).

## Notas

- Referencia de modelos/endpoints: `apps/api/prisma/schema.prisma:593-604` y
  `apps/api/src/modules/pages/routes.ts`.
- Ejemplo de layout real: `templates/tienda.json` (`pages[].layout[].blocks`).
- Política de dependencias: `docs/architecture/politica-dependencias.md` (GrapesJS es MIT).
- Relación con ADR-0009 (Tailwind + Shadcn UI): los bloques nativos del editor usan las primitivas
  del sistema de estilos, no CSS arbitrario sin tokens.
