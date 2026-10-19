# Estilo y CSS (design system)

Webs usa **TailwindCSS v4 como base** personalizada sobre los **tokens** `--ws-*`.

## Estructura

1. **`packages/ui/src/styles/tokens.css`**: tokens de diseño (colores, espaciado,
   radios, tipografía, sombras) en `:root` (claro) y `[data-theme='dark']`.
2. **`apps/web/src/tailwind.css`**: `@import "tailwindcss"` + `@theme` que mapea
   los tokens a utilidades de Tailwind (`bg-primary`, `text-muted`, `rounded-lg`,
   `shadow-md`, `border-border`, …).
3. **`apps/web/src/styles.css`**: componentes propios (`.btn`, `.card`, `.input`,
   `.badge`, `.table`, `.stack`, `.row`, `.grid-2/3`, …) y utilidades responsive.
4. **Bootstrap Icons** (`bootstrap-icons`, descargado/bundled) para iconografía.

## Cómo usar

Podés combinar utilidades de Tailwind con los componentes propios; todo sigue el
tema claro/oscuro automáticamente porque las utilidades referencian los tokens:

```html
<button class="btn">Primario</button>
<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div class="card">…</div>
</div>
<p class="text-muted">Texto secundario</p>
<i class="bi bi-wallet2"></i>
```

## Personalización

- **Desde la UI**: Apariencia → color primario, tema (claro/oscuro/sistema) y CSS
  personalizado (sobrescribe los tokens).
- **Responsive**: `md:` / `lg:` de Tailwind + las media queries de `styles.css`.

## Preview sin servidor

Abrí [`docs/estilo-frontend.html`](estilo-frontend.html) en el navegador para ver
colores, componentes y el toggle claro/oscuro.
