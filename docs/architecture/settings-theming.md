# Configuración desde la UI y sistema de temas

## 1. Configuración (settings)

El sistema de configuración permite editar **todo desde la interfaz** sin tocar código.
El backend expone *secciones* de ajustes, cada una con un **JSON Schema** que la UI usa
para generar formularios automáticamente.

### Registro de secciones

`apps/api/src/modules/settings/registry.ts`:

```ts
export interface SettingSection {
  key: string;                      // p. ej. 'site', 'appearance'
  group: string;                    // p. ej. 'general', 'seo'
  schema: JsonSchema;               // genera el formulario
  defaults: Record<string, unknown>;
}

export function registerSettingSection(section: SettingSection): void
export function getSettingSections(): SettingSection[]
export function getSettingSection(key: string): SettingSection | undefined
```

Las secciones se almacenan en un `Map` en memoria. `registerSettingSection` lanza un error
si la clave ya existe.

### Secciones base

`apps/api/src/modules/settings/sections.ts` registra las secciones base (idempotente vía
`ensureDefaultSections()` en `service.ts`):

| Sección | Grupo | Campos principales |
|---------|-------|--------------------|
| `site` | `general` | `name`, `tagline`, `logoUrl`, `faviconUrl`, `defaultLocale` (enum `es`/`en`). |
| `appearance` | `general` | `defaultTheme` (enum light/dark/system), `primaryColor` (`x-ui.widget: color`), `customCss` (`x-ui.widget: textarea`). |
| `seo` | `seo` | `siteTitle`, `metaDescription`, `keywords`, `ogImageUrl`, `canonicalUrl`, `robots`. |
| `legal` | `general` | `privacyPolicy`, `termsOfService`, `cookiePolicy` (`x-ui.widget: richtext`). |
| `contact` | `general` | `email`, `phone`, `address`, `whatsapp`. |
| `social` | `general` | `facebook`, `instagram`, `x`, `linkedin`, `youtube` (URIs). |

### Persistencia y validación

El valor de cada sección se guarda en la tabla `Setting` de Prisma:

```prisma
model Setting {
  id          String   @id @default(uuid())
  key         String   @unique
  value       Json
  schemaKey   String?
  updatedById String?
  updatedBy   User?    @relation("SettingEditor", ...)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`apps/api/src/modules/settings/service.ts`:

- `getSectionValue` / `listSections` — fusionan `defaults` con el valor almacenado
  (`{ ...defaults, ...stored }`).
- `setSectionValue` — compila el `schema` con **Ajv** (caché de validadores), valida el
  valor, y hace `upsert` sobre `Setting`. Si falla, lanza `ValidationError` con los
  detalles mapeados a `field` + `message`.

Rutas (`apps/api/src/modules/settings/routes.ts`):

```text
GET  /api/v1/settings          → listSections()          (setting.read)
GET  /api/v1/settings/:key     → getSectionValue()       (setting.read)
PUT  /api/v1/settings/:key     → setSectionValue()       (setting.write) + audit
```

### JSON Schema → formulario automático (SchemaForm)

`apps/web/src/components/ui/SchemaForm.tsx` convierte el esquema en un formulario. Soporta:

- `object` (anidado, con `<fieldset>`), `boolean` (checkbox), `enum` (`<select>`),
  `number`/`integer`, `string`.
- La extensión **`x-ui.widget`** de Webs añade pistas de renderizado:
  - `textarea` / `richtext` → `<textarea>`
  - `color` → `<input type="color">`
- `format: "uri"` se mapea a `<input type="url">`.

`apps/web/src/features/settings/SettingsPage.tsx` obtiene `GET /api/v1/settings`, renderiza
una tarjeta por sección (`SettingsSectionCard`) con `<SchemaForm>` y guarda con
`PUT /api/v1/settings/:key`.

## 2. Sistema de temas

### Tokens CSS (`--ws-*`)

`packages/ui/src/styles/tokens.css` define todos los tokens de diseño como CSS custom
properties, agrupados en:

- Color de marca: `--ws-primary`, `--ws-primary-hover`, `--ws-primary-soft`, `--ws-on-primary`.
- Superficies: `--ws-bg`, `--ws-surface`, `--ws-surface-2`, `--ws-surface-3`.
- Texto: `--ws-text`, `--ws-text-muted`, `--ws-text-subtle`.
- Bordes: `--ws-border`, `--ws-border-strong`.
- Estados semánticos: `--ws-success`, `--ws-warning`, `--ws-danger`, `--ws-info`.
- Espaciado: `--ws-space-1` … `--ws-space-8`.
- Radios: `--ws-radius-sm/md/lg/full`.
- Tipografía: `--ws-font-sans`, `--ws-font-mono`, `--ws-font-size-sm…xl`.
- Sombras y transición: `--ws-shadow-*`, `--ws-transition`.

### Claro / oscuro vía `data-theme`

El tema claro vive en `:root`; el oscuro sobreescribe en `[data-theme='dark']`
(`packages/ui/src/styles/tokens.css`). `color-scheme` se alinea con el tema para los
controles nativos.

`packages/ui/src/theme.tsx` implementa `ThemeProvider` y `useTheme`:

```ts
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
```

- `mode` persiste en `localStorage` (`webs-theme`).
- `resolved` resuelve `system` contra `prefers-color-scheme: dark`.
- Un `useEffect` aplica `document.documentElement.setAttribute('data-theme', resolved)` y
  se suscribe a los cambios de preferencia del SO.

La app envuelve todo en el proveedor (`apps/web/src/app/providers.tsx`):

```tsx
<ThemeProvider initialMode="system">{children}</ThemeProvider>
```

### CSS personalizado inyectado

`apps/web/src/features/appearance/AppearancePage.tsx` permite al administrador:

1. Elegir el modo (`light`/`dark`/`system`) con `useTheme().setMode`.
2. Cambiar el **color primario** aplicando en caliente
   `--ws-primary` y `--ws-primary-hover` sobre `document.documentElement`.
3. Inyectar **CSS personalizado** en un `<style id="custom-css">`, con el que se pueden
   sobrescribir cualquier token `--ws-*`.

Todo se persiste en la sección `appearance` (`PUT /api/v1/settings/appearance`), cuyo
esquema declara `defaultTheme`, `primaryColor` y `customCss`.

> Nota: `AppearancePage` usa su propia UI a medida; la sección `appearance` también es
> editable de forma genérica desde `SettingsPage` vía `SchemaForm`.

## 3. Discrepancias observadas

1. **`AppearancePage` no aplica `defaultTheme` desde el backend.** Guarda
   `defaultTheme: mode` (el valor elegido en el selector local), pero al cargar la página
   no lee `data.value.defaultTheme` para inicializar el tema: el estado inicial del tema
   proviene únicamente de `ThemeProvider`/`localStorage`.
2. **Doble vía de edición de `appearance`.** La sección se puede editar tanto desde
   `AppearancePage` (UI dedicada) como desde `SettingsPage` (formulario genérico), con
   lógica de guardado distinta.
