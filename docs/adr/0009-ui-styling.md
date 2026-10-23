# ADR-0009: Sistema de estilos — Tailwind CSS v4 + primitivas Shadcn UI

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 1)
- **Decisión:** Adoptar **Tailwind CSS v4** como motor de estilos base y **Shadcn UI**
  (primitivas basadas en Radix copiadas al repo en `components/ui/`) como biblioteca de
  componentes del frontend, complementando con **Bootstrap** (rejilla/Flexbox, formularios,
  tablas e iconos `bootstrap-icons`).
- **Revisión (2026):** se revierte la sustitución de Bootstrap Icons por `lucide-react` y se
  incorpora Bootstrap para layout, formularios y tablas junto a Tailwind + Shadcn UI.

## Contexto

Webs ya tiene una base de Tailwind v4 **parcialmente** montada, pero el frontend convive con
estilos a medida:

- `apps/web/src/tailwind.css` ya hace `@import "tailwindcss"` y declara un bloque `@theme` que
  mapea los tokens de diseño `--ws-*` a utilidades Tailwind (primary, bg, surface, text, muted,
  border, success/warning/danger/info, radius, font, shadow). `apps/web/package.json` tiene
  `tailwindcss ^4.0.0` y `@tailwindcss/vite ^4.0.0`.
- Existen primitivas estilo-shadcn en `apps/web/src/components/ui/` (Button, Card, TextField,
  Spinner, ConfirmDialog, PromptDialog, RichTextEditor, SchemaForm, QrCode), pero **no** es
  Shadcn UI completo (no hay `components.json`, ni dependencias Radix explícitas).
- `packages/ui` aporta `ThemeProvider`/`useTheme` (modos light/dark/system, atributo
  `data-theme`) y tokens CSS (`tokens.css`, `base.css`, `styles.css`).
- El layout admin (`apps/web/src/layouts/AdminLayout.tsx`) y buena parte del admin usan clases
  CSS propias (`.admin-layout`, `.sidebar`, `.nav-link`, `.stack`, `.btn`, `.topbar`,
  `.dropdown`) y **Bootstrap Icons** (`bi bi-*`), en lugar de primitivas shadcn.

El criterio de producto es «Tailwind CSS + Shadcn UI», por lo que hay que formalizarlo y cerrar
la brecha entre la base existente y el uso real.

## Decisión

### 1. Tailwind CSS v4 como único motor de estilos

- Tailwind v4 es la única fuente de utilidades y de tokens de diseño; los tokens semánticos se
  declaran una sola vez en `@theme` (manteniendo la nomenclatura `--ws-*`) y se consumen como
  utilidades (`bg-primary`, `text-muted`, `border-border`, etc.).
- **Deprecar** las clases CSS a medida (`.btn`, `.stack`, `.nav-link`, `.admin-layout`, etc.)
  de forma incremental: cada componente migrado elimina su clase propia; no se crean nuevas
  clases a medida salvo excepción justificada.

### 2. Shadcn UI como biblioteca de primitivas

- Adoptar la convención Shadcn UI: primitivas **copiadas al repo** (fuente de verdad local,
  no dependencia opaca), sobre **Radix UI**, bajo `apps/web/src/components/ui/`.
- Añadir `components.json` (configuración shadcn) para poder regenerar/agregar primitivas con el
  CLI de shadcn o manualmente, respetando el alias `@/` hacia `apps/web/src`.
- Migrar los componentes de alto nivel (sidebar/nav de `AdminLayout`, dropdowns, formularios,
  modales) a primitivas shadcn (`Button`, `DropdownMenu`, `Dialog`, `Sheet`, `NavigationMenu`,
  `Input`, `Label`, `Tabs`, `Table`, `Badge`, `Skeleton`, `Toast`…), conservando `SchemaForm` y
  `RichTextEditor` como componentes compuestos sobre esas primitivas.

### 3. Temas y tokens

- Mantener `packages/ui` (`ThemeProvider`/`useTheme`, `data-theme`) como autoridad del **modo**
  light/dark/system.
- Unificar tokens: Shadcn usa `hsl(var(--…))` con variables en `:root` y `[data-theme="dark"]`.
  Se alinean los tokens `--ws-*` a esa convención vía `@theme inline` / un `globals.css` para
  que primitivas shadcn y utilidades Tailwind lean el mismo valor.

### 4. Iconografía

- Mantener **Bootstrap Icons** (`bootstrap-icons`) como biblioteca de iconos del frontend
  (clases `bi bi-*`). *(Revisión 2026: se revierte la decisión original de migrar a
  `lucide-react`.)*

### 5. Rejilla, Flexbox, formularios y tablas — Bootstrap

- Utilizar **Bootstrap** para la rejilla/Flexbox (`container`/`row`/`col` y utilidades flex),
  los **formularios** (`form-control`, `form-label`, `form-select`, `input-group`, validación)
  y las **tablas** (`.table`, `.table-striped`, `.table-hover`, responsivas).
- Convivencia con Tailwind v4: Tailwind sigue siendo la fuente de tokens de color/tipografía y
  de las primitivas shadcn; Bootstrap aporta rejilla, controles de formulario y tablas. Para
  evitar colisiones de clases, integrar Bootstrap de forma **selectiva** (solo grid/forms/tables
  + helpers) y, si hace falta, aislarlo en un layer/namespacing por hoja de estilos.

## Consecuencias

**Positivas**

- UI consistente, tokenizada, accesible y con dark mode nativo.
- Primitivas accesibles (Radix) y reutilizables; menor CSS a medida que mantener.
- La migración al menú dirigido por datos (ADR-0005) se beneficia: los ítems de menú se renderizan
  con `NavigationMenu`/`DropdownMenu` shadcn en vez de HTML a medida.

**Negativas / costes**

- **Migración amplia** del CSS a medida del admin y de muchos componentes; es un esfuerzo
  incremental (no big-bang) para no romper funcionalidad.
- Integrar Bootstrap junto a Tailwind exige aislar/namespaciar los módulos de Bootstrap para
  evitar colisiones de clases (`.container`, utilidades flex) con Tailwind; requiere una
  estrategia de import selectivo y pruebas visuales.
- Tailwind v4 + `@theme` + convención `hsl(var(--…))` de shadcn exigen alinear una sola vez los
  tokens; si se desalinean, primitivas y utilidades mostrarían colores distintos.

## Notas

- Baseline sync requerida: `docs/architecture/settings-theming.md` (o el nuevo doc de UI) debe
  documentar Tailwind v4 + shadcn como sistema de estilos; el `components.json` y el `@theme`
  unificado se crean en la tarea de implementación.
- Relación con ADR-0001 (stack): este ADR **precisa** la capa de UI del stack (React 19 +
  Vite 6), sin cambiar el runtime; no reemplaza ADR-0001.
