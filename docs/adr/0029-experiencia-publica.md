# ADR-0029: Experiencia pública editable (home, editor y header configurables)

> **Nota (2026-11-06):** la mención al editor GrapesJS quedó desactualizada; el editor
> vigente es el de bloques en `/admin/pages`.
> Ver [`docs/guides/editor-paginas.md`](../guides/editor-paginas.md).


- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 14 — v2.12.0)
- **Decisión:** Convertir la landing `/` en una composición 100 % editable del `Page.layout` (nuevo tipo de sección `hero` y nuevos elementos `button`/`featured`), hacer el editor GrapesJS más intuitivo (paleta con búsqueda, preview fiel, duplicar/borrar y edición inline) y hacer configurable el header público (menú `main` editable desde `/admin/menu` + dropdown de usuario con clave `user`). El selector de idioma se mantiene fuera del header (solo `/account` y `/admin`).

## Contexto

La landing `/` (`apps/web/src/features/public/PublicHome.tsx`, 386 líneas) tiene hoy el hero (nombre + tagline + logo + CTAs según login), el CTA «contratá un plan» y las secciones destacadas (últimos artículos, productos y cursos) **hardcodeados en JSX**. Lo único editable es el fragmento `PageLayoutView` que renderiza el `layout` de la página marcada `isHome` (por debajo del hero).

Por otro lado:

- El modelo `Page` (`apps/api/prisma/schema.prisma:624-635`) ya guarda `layout Json` como lista de `PageSection[]`, y `apps/web/src/features/pages/PageRenderer.tsx` ya renderiza secciones (`full`/`half`/`third`) e items (`string` = plugin o `PageElement` = heading/text/image/divider/spacer/html). El campo `blocks` de la sección se mantiene por retrocompat (`pageTypes.ts`).
- El editor `apps/web/src/features/editor/GrapesEditor.tsx` (GrapesJS MIT, autoalojado) ya tiene paleta (3 secciones + 7 elementos + 1 por plugin) y serialización `data-ws-*`, pero `EditorPage.tsx` sólo ofrece «Guardar» y «Página de inicio»: faltan **duplicar** y **borrar**.
- El header público `apps/web/src/components/SiteHeader.tsx` lee el menú público (`GET /api/v1/public/menu`, clave `main` de `prisma.menu`, sembrada por `templates.ts`), pero el **dropdown de usuario está hardcodeado** (dashboard / staff / blog / social / account / admin / logout). Además `/admin/menu` (`apps/api/src/modules/menu/routes.ts`) edita la clave **`admin`**, no la pública `main`.
- El selector de idioma ya **no está** en el header público (vive en `/account` y en el panel `/admin`), documentado como hecho en WB-140.

## Decisión

### 1. Home `/` editable: `hero`, `button` y `featured` como tipos del layout

Ampliamos el modelo de layout **sin romper** `Page.layout` ni `PageRenderer`:

- `PageSection` gana un campo opcional `kind?: 'default' | 'hero'` (por defecto `'default'`, por lo que las páginas existentes siguen renderizando idéntico).
- `PageElementType` gana dos tipos nuevos: `'button'` (CTA: `content` = etiqueta, `path` = destino, `variant?` = `'primary' | 'ghost'`) y `'featured'` (colección destacada: `content` = fuente `'posts' | 'products' | 'courses'`, `limit?` = cantidad).
- `PageRenderer.ElementView` suma `case 'button'` (renderiza `<Link>` con clase `btn`/`btn ghost`) y `case 'featured'` (delega en un nuevo `FeaturedView` que extrae las queries hoy hardcodeadas en `PublicHome`).
- `PageRenderer.PageSectionView` aplica una clase de hero (`text-align:center`, padding amplio) cuando `kind === 'hero'`.

La **página `isHome` se convierte en la única fuente de verdad** de la landing. `PublicHome` pasa a ser un envoltorio fino: consulta `GET /api/v1/public/page/home`, y si `layout` no está vacío renderiza `PageLayoutView` completo (hero incluido); conserva un **fallback** al hero actual sólo cuando `layout` está vacío (retrocompat hasta que las plantillas siembren una home con hero). Los datos `SiteData` (name/tagline/logo) se resuelven en `SiteHeader`/hero vía las queries ya existentes.

### 2. Editor GrapesJS más intuitivo

- **Paleta clara**: 4 categorías (Estructura / Contenido / Plugins / Componentes) + un filtro de búsqueda por label. Se añaden los bloques `hero`, `button` y `featured`.
- **Preview fiel**: se reutiliza `PageLayoutView` (ya presente en el panel «Vista en vivo» de `EditorPage`) y se añade un toggle de preview a pantalla completa que oculta el cromo del editor.
- **Acciones explícitas**: además de «Guardar», se añaden **Duplicar** (`POST /pages/:id/duplicate` → clona con slug `-copia`) y **Borrar** (`DELETE /pages/:id`, con confirmación y guarda: rechaza borrar la página `isHome`).
- **Edición inline**: habilitar doble-clic para editar texto (GrapesJS `editable` en componentes `heading`/`text`) + un panel de propiedades para atributos (nivel de heading, ancho de sección, `src` de imagen, `label`/`path`/`variant` de botón).

### 3. Header configurable

- **Menú público (clave `main`) editable desde `/admin/menu`**: se generaliza el módulo de menú con un `scope` (`admin` | `public` | `user`). Se añaden `GET/PUT /menu/public` (lectura/escritura de la clave `main`) y la UI de `/admin/menu` gana una pestaña «Público». `GET /public/menu` sigue leyendo `main` (sin cambios de contrato público).
- **Dropdown de usuario (clave nueva `user`)**: se siembra con 6 ítems por defecto — dashboard (`/dashboard`), staff (`/staff`), blog (`/blog`), social (`/social`), account (`/account`), admin (`/admin`, con permiso `user.read`) — y **logout** se mantiene como acción fija (no configurable como ítem). `SiteHeader` reemplaza el dropdown hardcodeado por `GET /public/menu/user` (clave `user`), con fallback a los 6 ítems por defecto si está vacío.

### 4. Selector de idioma

Confirmado **fuera del header público**: el switcher vive en `/account` (perfil) y en `/admin` (AdminLayout). Sin trabajo nuevo; se documenta como hecho (WB-140).

## Consecuencias

**Positivas**

- La landing deja de ser código muerto específico y pasa a ser composable como cualquier página (mismo motor `PageRenderer`), alineado con «base universal» (`docs/architecture/base-universal.md`).
- El header es configurable por el operador sin tocar React (menú + dropdown), coherente con el modelo `prisma.menu` ya multi-clave.
- El editor gana las acciones faltantes (duplicar/borrar) y edición inline, cerrando la brecha de UX del M7.
- Retrocompat total: ningún campo nuevo es obligatorio; páginas y layouts viejos renderizan igual.

**Negativas**

- `PublicHome` conserva un fallback hardcodeado transitorio hasta que las 8 plantillas (`templates/*.json`) siembren una home con hero; ese código muere en un pase posterior de templates.
- `featured` acopla `PageRenderer` a componentes de datos (`FeaturedView`) que hoy sólo existen en `PublicHome`; hay que extraerlos y mantener sus queries (blogs/products/courses) sincronizadas con los plugins.
- Un ítem del dropdown `user` con `path` inválido o permiso no satisfecho debe ocultarse en runtime (misma regla `permissions`/`feature` que el menú público).

## Notas

- Anclado en: `apps/api/prisma/schema.prisma:624-635` (`Page`), `apps/web/src/features/pages/{pageTypes.ts,PageRenderer.tsx}`, `apps/web/src/features/public/PublicHome.tsx`, `apps/web/src/features/editor/{GrapesEditor.tsx,EditorPage.tsx}`, `apps/web/src/components/SiteHeader.tsx`, `apps/api/src/modules/{menu,schema}/routes.ts` y `apps/api/prisma/seed.ts` (`CORE_MENU_ITEMS` → clave `admin`).
- Trazabilidad M14: WB-135 (ADR-0029 + spec) → WB-136 (home editable), WB-137 (editor intuitivo), WB-138/139 (header/dropdown), WB-140 (selector de idioma, hecho), WB-141 (i18n), WB-142 (docs), WB-143 (QA), WB-144 (release v2.12.0).
- Spec técnica: `docs/architecture/experiencia-publica.md`.
