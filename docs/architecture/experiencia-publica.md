# Experiencia pública (M14 — v2.13.0)

**Spec técnica del ADR-0029**: home editable, editor visual intuitivo y header/dropdown configurables.

## 1. Objetivo

Hacer que la landing `/` sea 100 % componible desde `Page.layout` (sin React hardcodeado), cerrar la brecha de UX del editor GrapesJS (duplicar/borrar, preview fiel, edición inline) y permitir configurar el header público (menú + dropdown de usuario) desde el panel, sin tocar código.

## 2. Modelo de datos

Ampliación **retrocompatible** del layout (fuente de verdad: `Page.layout`, `apps/api/prisma/schema.prisma:624-635`).

```ts
// apps/web/src/features/pages/pageTypes.ts (extendido)
export type Size = 'full' | 'half' | 'third';
export type SectionKind = 'default' | 'hero';
export type PageElementType =
  | 'heading' | 'text' | 'image' | 'divider' | 'spacer' | 'html'
  | 'button'   // CTA
  | 'featured'; // colección destacada

export interface PageElement {
  type: PageElementType;
  content?: string; // heading/text: texto; image: URL; spacer: alto px;
                    // html: HTML; button: etiqueta; featured: fuente
  level?: number;   // heading 1–4
  path?: string;    // button: destino
  variant?: string; // button: 'primary' | 'ghost'
  limit?: number;   // featured: cantidad
}

export interface PageSection {
  size?: Size;
  kind?: SectionKind;   // default 'default'
  blocks: PageItem[];
}
```

Reglas de retrocompat:

- `kind` ausente ⇒ `'default'`; `blocks` mantiene su nombre (API y páginas guardadas intactas).
- `isPageElement` sigue valiendo (chequea `typeof type === 'string'`).
- Páginas existentes sin `kind`/`button`/`featured` renderizan **idéntico**.

## 3. Home `/` editable

### 3.1 Renderizado

- `PageRenderer.ElementView` suma:
  - `case 'button'` → `<Link to={path} className={variant === 'ghost' ? 'btn ghost' : 'btn'}>{content}</Link>`.
  - `case 'featured'` → `<FeaturedView source={content} limit={limit} />`.
- `PageRenderer.PageSectionView` aplica estilo hero (centrado, padding amplio) cuando `kind === 'hero'`.

### 3.2 `FeaturedView` (nuevo, extraído de `PublicHome`)

Extrae las tres queries hoy hardcodeadas en `PublicHome.tsx`:

| `source` | Endpoint (reusado) | Render |
|----------|--------------------|--------|
| `posts` | `GET /api/v1/blocks/blog/posts?status=published` | grilla de tarjetas (últimos 6) |
| `products` | `GET /api/v1/blocks/ecommerce/products/persisted` | grilla de tarjetas (primeros 4) |
| `courses` | `GET /api/v1/blocks/academia/courses` | grilla de tarjetas |

Cada tarjeta conserva el estilo actual (`featureCardStyle`), el `stripHtml`/`excerptFrom`/`extractImage` de `PublicHome` se mueven a un helper compartido.

### 3.3 `PublicHome` como envoltorio fino

```
GET /api/v1/public/page/home
├─ layout no vacío → <PageLayoutView sections={layout} />   (hero incluido)
└─ layout vacío   → fallback hardcodeado (hero + CTA + destacados) — transitorio
```

`SiteData` (name/tagline/logo) sigue resolviéndose con `GET /api/v1/public/site` (ya en `SiteHeader` y `PublicHome`). El CTA «contratá un plan» pasa a ser un `button` + `featured` dentro del layout, o cae en el fallback.

## 4. Editor GrapesJS intuitivo

### 4.1 Paleta

Cuatro categorías (`editor.category*`) con buscador por label:

- **Estructura**: secciones `full`/`half`/`third` + sección `hero`.
- **Contenido**: heading H1/H2, texto, imagen, divisor, espaciador, HTML.
- **Componentes**: `button` (label/path/variant) y `featured` (fuente/limit).
- **Plugins**: uno por plugin instalado (ya existe).

`GrapesEditor.addBlocks` se extiende con los bloques `hero`, `button` y `featured` (serialización `data-ws-kind="hero"`, `data-ws-block="button|featured"`).

### 4.2 Preview fiel

El panel «Vista en vivo» (`EditorPage.tsx`, `PageLayoutView`) es el render fiel; se añade un toggle de **preview a pantalla completa** (oculta el cromo del editor y usa el mismo `PageLayoutView`).

### 4.3 Acciones explícitas

| Acción | Endpoint | Notas |
|--------|----------|-------|
| Guardar | `POST /pages/save` (nueva) / `PATCH /pages/:id` (existente) | ya existe |
| Página de inicio | `PATCH /pages/:id {isHome:true}` | ya existe |
| **Duplicar** | `POST /pages/:id/duplicate` | clona título/slug (`-copia`) y `layout`; desmarca `isHome` |
| **Borrar** | `DELETE /pages/:id` | confirmación; rechaza si `isHome` (409) |

### 4.4 Edición inline

- Doble clic en `heading`/`text` edita el texto (GrapesJS `editable` en el componente).
- Panel de propiedades para: nivel de heading, ancho de sección, `src` de imagen, `label`/`path`/`variant` de botón, `source`/`limit` de `featured`.

## 5. Header configurable

### 5.1 Menú público (clave `main`)

Estado actual: `GET /public/menu` (`apps/api/src/modules/settings/routes.ts:47-57`) lee `prisma.menu` clave `main` y devuelve `{ items: [...core(feature:'core'), ...plugins(isLicensed)] }`. `/admin/menu` edita la clave `admin` (no la pública).

Cambio: generalizar el módulo de menú con `scope` (`admin` | `public` | `user`):

- `GET  /menu/public` → `{ items }` (clave `main`).
- `PUT  /menu/public` → upsert clave `main` (`setting.write`).
- `GET  /menu/user`   → `{ items }` (clave `user`).
- La UI `/admin/menu` gana pestañas «Admin», «Público» y «Usuario».

### 5.2 Dropdown de usuario (clave nueva `user`)

Seed de 6 ítems por defecto (i18n `nav.*`/`site.header.*`):

| label | path | permiso |
|-------|------|---------|
| dashboard | `/dashboard` | — |
| staff | `/staff` | — |
| blog | `/blog` | — |
| social | `/social` | — |
| account | `/account` | — |
| admin | `/admin` | `user.read` |

`SiteHeader` reemplaza el dropdown hardcodeado por `GET /menu/user` (fallback a los 6 por defecto si vacío). **Logout** permanece como acción fija (no es un ítem configurable). Los ítems con permiso no satisfecho se ocultan en runtime (misma regla `permissions`/`feature`).

### 5.3 Selector de idioma

Confirmado **fuera del header público**: el switcher vive en `/account` (`AccountPage`) y en `/admin` (`AdminLayout`). `SiteHeader` no lo incluye. Documentado como hecho (WB-140); sin trabajo nuevo.

## 6. Contratos de API (resumen)

| Método | Ruta | Permiso | Notas |
|--------|------|---------|-------|
| GET | `/api/v1/public/menu` | público | clave `main` (sin cambios) |
| GET | `/api/v1/public/page/home` | público | página `isHome` (sin cambios) |
| GET | `/api/v1/menu/public` | `setting.read` | clave `main` |
| PUT | `/api/v1/menu/public` | `setting.write` | upsert `main` |
| GET | `/api/v1/menu/user` | público | clave `user` |
| PUT | `/api/v1/menu/user` | `setting.write` | upsert `user` |
| POST | `/api/v1/pages/:id/duplicate` | `content.write` | clona página |
| DELETE | `/api/v1/pages/:id` | `content.write` | rechaza `isHome` (409) |

## 7. Trazabilidad M14

| WB | Alcance | Entregable |
|----|---------|------------|
| WB-135 | ADR + spec | este documento + ADR-0029 |
| WB-136 | home editable | §3 |
| WB-137 | editor intuitivo | §4 |
| WB-138/139 | header/dropdown | §5 |
| WB-140 | selector idioma | §5.3 (hecho) |
| WB-141 | i18n | claves `editor.*`, `nav.*`, `site.header.*` |
| WB-142 | docs | docs/README.md + Docs.git |
| WB-143 | QA | — |
| WB-144 | release v2.13.0 | — |
