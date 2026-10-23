# Integración selectiva de Bootstrap junto a Tailwind + Shadcn UI

Estado: aplicado (M1). Fecha de referencia: 2026-10-23.

## Objetivo

Sumar el sistema de **grid/Flexbox**, **formularios**, **tablas** y **helpers** de
Bootstrap sin romper ni el reset de Tailwind ni las primitivas de Shadcn/Radix, y
**manteniendo `bootstrap-icons`** (clases `bi bi-*`) como única librería de iconos.

## Qué se importa (y qué NO)

`apps/web/src/styles/bootstrap-vendor.scss` es el único punto de entrada de
Bootstrap. Importa de forma selectiva, en este orden:

1. Prerrequisitos (no emiten CSS): `functions`, `variables`, `maps`, `mixins`,
   `utilities` (solo mapas/helpers internos, no las utilidades finales).
2. Módulos finales: `containers`, `grid`, `tables`, `forms`, `helpers`.

**NO se importan** (para evitar colisiones con Tailwind/Shadcn):

| Módulo omitido | Razón |
| --- | --- |
| `root`, `reboot` | el reset de Tailwind Preflight ya cubre normalización; `reboot` pisaría tipografías y márgenes. |
| `type`, `images` | estilos globales de tipografía/imagen que Tailwind gestiona. |
| `buttons`, `badge` | `.btn` y `.badge` ya existen como clases a medida del admin (colisión directa). |
| `utilities` (salida final) | sus clases utilitarias (`mt-*`, `d-flex`, …) chocan con las utilitarias de Tailwind. |

`helpers` se mantiene porque sus nombres (`stretched-link`, `visually-hidden`,
`text-truncate`, `clearfix`) no colisionan con Tailwind.

## Orden de carga

`apps/web/src/main.tsx`:

```
@webs/ui/styles.css        → tokens/componentes base
bootstrap-icons/...css     → iconos bi bi-*
./tailwind.css             → Tailwind v4 + @theme (--ws-*)
./styles/bootstrap-vendor.scss → Bootstrap selectivo
./styles.css               → CSS a medida del admin (gana por orden de fuente)
```

El CSS a medida se carga **después** del vendor para que los overrides de tokens
y las clases propias (`.row`, `.table`, `.input`, `.btn`, `.badge`) prevalezcan.

## Estrategia de colisiones

Se mantienen las clases a medida existentes. Bootstrap solo aporta lo que no
choca, y donde choca se neutraliza en `styles.css`:

- **`.row`** (colisión real: helper de toolbar a medida vs fila de grid de
  Bootstrap). Decisión: se conserva `.row` como helper flex de toolbar
  (`display:flex; align-items:center; gap; flex-wrap:wrap; margin:0`) y se
  anulan los gutters de Bootstrap (`--bs-gutter-x:0; --bs-gutter-y:0`) para que
  las columnas `.col` **no** sumen el padding del gutter además del `gap`
  (evita el doble espaciado). Las columnas `.col` (equivalente a `flex:1 0 0%`)
  funcionan dentro de `.row` respetando únicamente el `gap`. **Limitación
  documentada:** `.col-md-*`/`.col-*` fijos (`width:50%`, etc.) no combinan con
  el `gap` de `.row` (ancho + gap desbordan); para rejilla con ancho fijo usar
  un contenedor `.row` con `--bs-gutter-x` restaurado (sin `gap`) o columnas
  `.col` equitativas.
- **`.table`**: Bootstrap aporta `striped`/`hover`/`active`/`responsive`; la
  `.table` a medida (border-collapse + borde inferior por celda) se conserva y
  los colores de Bootstrap se mapean a los tokens `--ws-*`.
- **`.btn` / `.badge`**: no importadas de Bootstrap (se evita la colisión).

## Mapeo de tokens Bootstrap → Webs

En `styles.css` se reasignan las variables CSS de Bootstrap a los tokens Webs:

- `.table`: `--bs-table-color/bg/border-color/striped-*/hover-*/active-*` → `--ws-*`.
- `.form-control` / `.form-select`: color/fondo/borde → `--ws-*`; foco
  `box-shadow: 0 0 0 0.25rem var(--ws-primary-soft)`; además se compactan las
  métricas de Bootstrap (`padding`, `border-radius`, `min-height:auto`,
  `line-height:normal`, `font-size:inherit`) para igualar la altura de `.input`.
- `.form-label` → `--ws-text-muted` + `font-size:sm`; `.form-text` → `--ws-text-subtle`.
- `.form-check` (wrapper) → flex (`display:flex; align-items:center; gap`),
  quitando el `padding-left`/`float` de Bootstrap; `.form-check-input` →
  `1rem × 1rem`, `float:none`, `margin:0`, `flex:0 0 auto`; `.form-check-label`
  → `font-size:inherit`.
- `.form-check-input:checked/:focus` → `--ws-primary`.
- `.is-invalid`/`.is-valid` + `.invalid-feedback`/`.valid-feedback` → `--ws-danger`/`--ws-success`.

Esto garantiza coherencia con el dark mode y con el tema existente.

## Componentes migrados

- `components/ui/Input.tsx`: `className="input form-control"`.
- `components/ui/TextField.tsx`: label → `form-label`; input → `input form-control`.
- Tablas principales con `table-striped table-hover`:
  `UsersPage`, `InvoicesPage`, `RolesPage`, `AuditPage`, `PaymentsPage`.
- Rejilla de ejemplo `row` + `col` en el formulario de edición de `UsersPage`.

## Iconos

Se **mantiene `bootstrap-icons`** (`bi bi-*`). No se introduce `lucide-react`
(los componentes Shadcn/Radix que ya lo usan siguen funcionando con él; la
regla es no añadir una segunda familia para los iconos del admin).

La clase `.bi` se normaliza en `styles.css` para que el tamaño sea **consistente
y proporcional al texto que lo rodea** (antes heredaba `font-size` y en `h1`/
`btn-lg` crecía o desbordaba, y en tablas quedaba diminuto):

```css
.bi { display:inline-block; width:1em; height:1em; font-size:1.25em;
      line-height:1; vertical-align:middle; flex:0 0 auto; }
```

`flex: 0 0 auto` evita que los iconos dentro de `.btn`/`.dropdown`/`.site-*` se
estiren o deformen.

## Footer (SaaS)

El pie público usa `.footer` (borde superior + fondo `--ws-surface` + tipografía
`--ws-font-size-sm`) y un contenedor `.footer-inner` (máx. 1200px, flex-wrap,
`justify-content:space-between`) con tres zonas: `.footer-copy` (copyright),
`.footer-contact` (email/teléfono/dirección, iconos `bi`) y `.footer-links`
(legales + redes). `SiteFooter.tsx` ya no usa estilos inline; los wrappers de
`SiteLayout`/`PublicHome` son `<div>` (sin `borderTop` inline) y el borde lo
aporta la propia `.footer`. El footer admin (`AdminLayout`) reutiliza la misma
clase `.footer` para coherencia.

## Responsive

- `.row` es `flex-wrap: wrap` por defecto (antes `nowrap`), por lo que las
  toolbars envuelven en pantallas chicas sin media query.
- En `@media (max-width:768px)`, las `.table` (que NO están envueltas en
  `.table-responsive`) pasan a `display:block; overflow-x:auto; white-space:nowrap`
  para evitar overflow horizontal.

## Verificación

- `apps/web`: `tsc --noEmit`, `eslint src`, `vite build` → exit 0.
- El admin renderiza sin colisiones (`.container`/utilidades flex no pisan nada).
- Los `bi bi-*` siguen funcionando (bootstrap-icons se carga antes del CSS a medida).
