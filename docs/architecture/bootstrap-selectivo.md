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
  (`display:flex; align-items:center; gap; flex-wrap:nowrap; margin:0`),
  neutralizando el margen negativo y el wrap de Bootstrap. Las **columnas**
  `.col` (equivalente a `flex:1 0 0%`) funcionan dentro de `.row` respetando el
  `gap`. **Limitación documentada:** `.col-md-*`/`.col-*` fijos (`width:50%`,
  etc.) no combinan con el `gap` de `.row` (ancho + gap desbordan y la fila
  envuelve de a uno); para rejilla con ancho fijo usar `.g-*` + `.row` con el
  modelo de gutters estándar de Bootstrap (sin `gap`) o columnas `.col`
  equitativas.
- **`.table`**: Bootstrap aporta `striped`/`hover`/`active`/`responsive`; la
  `.table` a medida (border-collapse + borde inferior por celda) se conserva y
  los colores de Bootstrap se mapean a los tokens `--ws-*`.
- **`.btn` / `.badge`**: no importadas de Bootstrap (se evita la colisión).

## Mapeo de tokens Bootstrap → Webs

En `styles.css` se reasignan las variables CSS de Bootstrap a los tokens Webs:

- `.table`: `--bs-table-color/bg/border-color/striped-*/hover-*/active-*` → `--ws-*`.
- `.form-control` / `.form-select`: color/fondo/borde → `--ws-*`; foco
  `box-shadow: 0 0 0 0.25rem var(--ws-primary-soft)`.
- `.form-label` → `--ws-text-muted`; `.form-text` → `--ws-text-subtle`.
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

## Verificación

- `apps/web`: `tsc --noEmit`, `eslint src`, `vite build` → exit 0.
- El admin renderiza sin colisiones (`.container`/utilidades flex no pisan nada).
- Los `bi bi-*` siguen funcionando (bootstrap-icons se carga antes del CSS a medida).
