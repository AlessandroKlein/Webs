# Diseño UX/UI — Dashboards, flujo de pago y menú de trabajadores

> Alcance t4. Documento de spec visual + tokens + componentes reutilizables para:
> (1) dashboard del usuario, (2) dashboards de trabajadores por rol, (3) flujo de
> pago del checkout y (4) sección de trabajadores con soporte de lectores de código
> externos. Sigue `ui-ux-governance`.

## 1. Contexto y objetivos

La plataforma Webs usa hoy componentes "a mano" sobre tokens CSS (`--ws-*`) y
Bootstrap Icons, **sin** Shadcn UI/Radix. Las superficies objetivo están
implementadas como archivos monolíticos con estilos inline:

- `apps/web/src/features/dashboard/UserDashboardPage.tsx` (~1.231 líneas)
- `apps/web/src/features/staff/StaffDashboard.tsx` (~1.549 líneas)
- `apps/web/src/features/store/StorePage.tsx` (~949 líneas)

Objetivos de esta entrega:

1. Definir una **spec visual + catálogo de componentes reutilizables** coherentes
   con el sistema de tokens existente, para que la fase de implementación pueda
   reemplazar los bloques inline sin cambiar el look&feel base.
2. Reducir el **esfuerzo total del usuario** (menos clics, menos correcciones,
   reutilización de datos ya ingresados) y cubrir **estados de interacción** que
   hoy faltan (loading, empty, error, success, disabled, retry).
3. Sentar la base para **lectores de código externos** (HID/keyboard-wedge, cámara,
   manual) como abstracción reutilizable, no como `<input>` suelto.

## 2. Decisiones de arquitectura UI

| Decisión | Fundamento |
|---|---|
| **No instalar Shadcn/Radix/clsx/tailwind-merge/cva.** | Evita tocar lockfile/CI y deps runtime. Se replica el *modelo composable* de shadcn (primitivas + mapas de variantes + `cn()`). Decisión reversible si más adelante se adopta Radix para diálogos/combobox accesibles. |
| **Todo el styling consume tokens `--ws-*`.** | Regla dura del sistema (`packages/ui/src/styles/tokens.css`): el admin re-tematiza desde Apariencia → CSS. Usar colores fijos rompería el theming. |
| **Componentes en `apps/web/src/components/ui/`**, junto a los existentes. | Es donde ya viven `Button`/`Card`/`TextField`/`Spinner` y es el mínimo riesgo (no toca el build de `packages/ui`). |
| **Compatibilidad hacia atrás.** | `Button`/`Card`/`TextField`/`Spinner` se importan en ~142 sitios. Se mantienen las firmas y el spread de props (`style`, `type`, `onClick`, `disabled`). |

## 3. Tokens de diseño

Base existente en `packages/ui/src/styles/tokens.css` (claro en `:root`, oscuro en
`[data-theme='dark']`). Extensiones añadidas en esta entrega:

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--ws-success-soft` / `-warning-soft` / `-danger-soft` / `-info-soft` | `rgba(…, .14)` | `rgba(…, .18)` | fondos suaves de badges/alertas/etiquetas |
| `--ws-on-danger` | `#fff` | `#0b0f19` | texto sobre `--ws-danger` (botón destructivo) |

Mapeo Tailwind añadido en `apps/web/src/tailwind.css`: `--color-*-soft` y
`--color-on-danger` → utilidades `bg-success-soft text-success`, `bg-danger-soft
text-danger`, etc.

Convención de uso: **color de texto = token semántico**, **fondo = token `-soft`**.
Así los estados son legibles en ambos temas y re-tematizables.

## 4. Catálogo de componentes reutilizables

Ubicación: `apps/web/src/components/ui/`. Todo componente consume tokens (directo
o vía Tailwind `@theme`).

### 4.1 Extendidos (compatibles hacia atrás)

- **`Button`** — `variant: 'primary'|'secondary'|'ghost'|'destructive'`,
  `size: 'sm'|'md'|'lg'`, `loading` (→ `disabled`+`aria-busy`+spinner),
  `fullWidth` (→ `.btn-block`). Sigue propagando `style`/`type`/`onClick`/`disabled`.
- **`Card`** — raíz plana + `Card.Header`/`Title`/`Description`/`Content`/`Footer`
  (patrón shadcn). `<Card>…</Card>` sigue funcionando igual.
- **`TextField`** — añade `hint`, `error`, `id` + `useId`, `aria-invalid`,
  `aria-describedby`; reutiliza `.field`/`.input`/`.field-hint`/`.field-error`.
- **`Spinner`** — spinner real (`.spinner`) + `label` opcional, `role="status"`
  + `aria-live`, `size`.

### 4.2 Nuevos

| Componente | Rol | Estados/Notas |
|---|---|---|
| `cn(...)` | merge de clases (sin tailwind-merge) | util |
| `Input` | campo base `.input` | reenvía `ref` (React 19) |
| `Label` | etiqueta accesible | `htmlFor` |
| `Badge` | etiqueta de estado | `neutral/primary/success/warning/danger/info` |
| `Skeleton` | placeholder de carga | `animate-pulse` |
| `Progress` | barra de progreso | `role="progressbar"`, `tone` |
| `StatCard` | métrica de dashboard | `label/value/icon/hint/tone` |
| `EmptyState` | estado vacío | icono + título + descripción + acción |
| `Alert` | mensaje de estado | `info/success/warning/danger`, `role` |
| `Tabs` | navegación por pestañas | ARIA `tablist` |
| `StepIndicator` | pasos de checkout | `done/current/todo` |
| `BarcodeScanner` | lector de código externo | ver §7 |

### 4.3 Ejemplo de composición

```tsx
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';

<Card>
  <Card.Header>
    <Card.Title>Pagos pendientes</Card.Title>
    <Card.Description>Resumen del último mes</Card.Description>
  </Card.Header>
  <Card.Content className="grid grid-cols-3 gap-4">
    <StatCard label="Recaudado" value="$12.400" tone="success" icon={<i className="bi bi-cash-stack" />} />
  </Card.Content>
</Card>
```

## 5. Superficie 1 — Dashboard del usuario

**Estado actual:** sidebar izquierda de 9 vistas (resumen/rutina/calendario/
reservas/pagosPendientes/pagos/membresías/planes/pedidos) + contenido; `money`
con moneda hardcodeada `'ARS'` en planes; estados de pago en maps locales.

**Mejoras propuestas (observables):**

1. **Jerarquía visual**: `StatCard` para las métricas clave en "Resumen"
   (pagos pendientes, próxima reserva, plan activo) en lugar de filas inline.
2. **Estados de pago** con `Badge` semántico (pendiente=warning, aprobado=success,
   rechazado=danger, reembolsado=neutral) → consistencia y lectura rápida.
3. **Estados vacíos/carga**: `EmptyState` ("No tenés pagos pendientes") y
   `Skeleton`/`Spinner` mientras cargan proveedores/QR, en lugar de contenido
   que aparece de golpe.
4. **Continuar pago**: `Alert` para explicar qué pasó si falla el checkout +
   acción "Reintentar" (recuperación), `Progress`/`Spinner` mientras se crea la
   preferencia.
5. **Moneda**: quitar el `'ARS'` hardcodeado — usar la moneda del tenant/plan
   (bug de UX a resolver en la fase de implementación; queda fuera del alcance
   de componentes, ver §9).

## 6. Superficie 2 — Dashboards de trabajadores por rol

**Estado actual:** `StaffDashboard` arma secciones según permisos
(`course.manage`, `attendance.manage`, `membership.manage`, `billing.read/write`,
`sales.manage`, `inventory.read`, `support.manage`, `user.read`). Nav lateral de
botones + switch de secciones.

**Mejoras propuestas (observables):**

1. **Nav por rol** con `Tabs` (variante segmented) en móvil/tablet y sidebar en
   desktop, reutilizando el mapeo de permisos existente (sin duplicar lógica).
2. **Métricas por rol**: `StatCard` para recaudación (billing), ventas del día
   (sales), stock bajo (inventory), tickets abiertos (support) — cada rol ve solo
   lo suyo.
3. **Ventas/POS**: el escaneo por código pasa a usar `BarcodeScanner` (§7) con
   feedback `listening/processing/error`; se conserva búsqueda manual + carrito.
4. **Asistencia**: el input de QR reutiliza `BarcodeScanner` (mismo patrón que POS)
   → una sola abstracción para todo lector externo.
5. **Estados**: `EmptyState` por sección ("Sin ventas hoy"), `Alert` para errores
   de la API con acción de reintento.

## 7. Superficie 3 — Sección de trabajadores + lectores de código externos

**Estado actual:** en `SalesSection` y `AttendanceSection` hay `<input autoFocus>`
suelto + Enter; no hay abstracción para lectores HID/cámara/manual ni estados.

**`BarcodeScanner` (nuevo, `apps/web/src/components/ui/BarcodeScanner.tsx`):**

- API: `onCode(code)`, `placeholder`, `label`, `autoFocus`, `allowCamera`,
  `onRequestCamera`, `settleMs`, `disabled`.
- `normalizeBarcode(raw)` quita `\r\n\t` y prefijos AIM/GS1 (`]C0…]C9`, `]E0`).
- Comportamiento: mantiene foco (los lectores HID tipean al elemento enfocado);
  Enter dispara la emisión; si no llega Enter, un temporizador de `settleMs`
  (120 ms por defecto) detecta el fin de la ráfaga.
- Estados anunciados (`aria-live`): `idle → listening → processing → error`, con
  texto de error accionable ("código vacío").
- Slot de cámara opcional (`allowCamera` + `onRequestCamera`) para lectores por
  cámara; la detección real de cámara queda como integración futura (§9).

**Modos de lector externo soportados por diseño:**

| Modo | Cómo entra | Estado en t4 |
|---|---|---|
| HID / keyboard-wedge (USB/Bluetooth) | tipea código + Enter | ✅ implementado |
| Manual (fallback) | escritura + botón "Buscar" | ✅ implementado |
| Cámara | callback `onRequestCamera` | ⚠️ slot, detección pendiente (§9) |
| Serial/WebHID/WebUSB | API con permiso de navegador | ⚠️ documentado, no implementado |

## 8. Superficie 4 — Flujo de pago (checkout)

**Estado actual (`StorePage`):** carrito en drawer (productos → dirección →
envío → pago) con `StepIndicator` inexistente; carrito en `localStorage`
(`webs-cart`) **y** un `cart-store.ts` (Zustand) sin usar → doble fuente de
verdad (inconsistencia de UX a corregir en implementación).

**Mejoras propuestas (observables):**

1. **`StepIndicator`** (Carrito → Envío → Pago → Confirmación) visible arriba del
   drawer para ubicar al usuario y comunicar progreso.
2. **Reutilizar datos**: pre-rellenar dirección si ya existe (evita re-tipear),
   mostrar resumen de montos (subtotal/envío/total) con `Alert` informativa.
3. **Prevención de doble envío**: `Button loading` durante `POST /ecommerce/orders`
   y `/payments/checkout` (evita pedidos duplicados).
4. **Errores con acción**: `Alert variant="danger"` + "Reintentar" si falla la
   cotización de envío o el pago; preservar carrito/dirección ante fallo.
5. **Confirmación**: al completar, estado de éxito con QR/enlace y acción de cierre
   inequívoca.
6. **Unificar carrito**: adoptar **una** fuente de verdad (Zustand `cart-store` o
   `localStorage`, no ambas) — tarea de implementación, ver §9.

## 9. Criterios de aceptación (observables)

1. **Typecheck + lint + build en verde** para `@webs/web` (evidencia de que los
   componentes compilan y no rompen los ~142 sitios que importan los extendidos).
2. **Catálogo completo**: cada componente de §4 existe, exporta la API declarada
   y consume solo tokens `--ws-*` (grep de colores fijos `#`/`rgb(` en los nuevos
   componentes arroja solo los valores de tokens esperados).
3. **`BarcodeScanner`** se integra como reemplazo directo de los `<input autoFocus>`
   sueltos de POS/asistencia y anuncia sus 4 estados por `aria-live`.
4. **Estados cubiertos** en las 4 superficies: initial/loading/empty/disabled/
   success/validation-error/failure/retry (verificado por revisión de código, no
   solo por build).
5. **Accesibilidad**: `role`/`aria-*` en `Progress`/`Tabs`/`Alert`/`Spinner`/
   `StepIndicator`/`BarcodeScanner`; foco visible (`:focus-visible`) en botones y
   enlaces; `prefers-reduced-motion` respetado en spinners/skeletons.

## 10. Alcance no cubierto / pendiente (para fases siguientes)

Estos puntos **no** se implementan en t4 (son tareas de implementación/integración
o de otros miembros) y quedan explícitos para no reportarlos como hechos:

1. **Cablear** los componentes en las páginas monolíticas existentes
   (`UserDashboardPage`, `StaffDashboard`, `StorePage`). t4 entrega los
   componentes + spec; la migración de cada página es trabajo posterior.
2. **Moneda dinámica** (quitar `'ARS'` hardcodeado) y **unificar carrito**
   (Zustand vs `localStorage`).
3. **Detección de cámara** real (p. ej. `@zxing/browser`) y **WebHID/WebUSB**.
4. **Shadcn/Radix reales** si se decide adoptar diálogos/combobox accesibles.
5. **Verificación en dispositivo físico**: las decisiones de esfuerzo del usuario
   (§5–§8) están fundamentadas por inspección de diseño y son **provisionales**
   hasta medirlas en un lector/tablet reales.

## 11. Evidencia de verificación

- `pnpm --filter @webs/web typecheck` → verde.
- `pnpm --filter @webs/web lint` → verde (o solo warnings preexistentes).
- `pnpm --filter @webs/web build` → verde (si falla por causas preexistentes ajenas
  a t4, se documenta).
- Revisión de código de los componentes nuevos (estados + ARIA + tokens).
