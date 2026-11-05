# Pulido profesional y visibilidad condicional por plugin instalado

> Spec técnica del ADR-0032 (Milestone 17, v2.15.0). Define (A) el mecanismo de
> visibilidad condicional por plugin instalado y (B) el estándar de pulido
> profesional para todas las páginas. Anclado al código real del monorepo.

## 1. Problema

El panel `/admin` mezcla dos fuentes de ítems (ver `apps/web/src/layouts/AdminLayout.tsx`):

1. **Núcleo fijo** — `navItems` (líneas 132–155): 22 rutas con `section` + `perm` (y `feature` solo en `/admin/generated`).
2. **Ítems de plugins** — `pluginItems` (líneas 161–173), derivados de `GET /menu` (`/api/v1/menu`), ya condicionales por instalación.

El dashboard (`apps/web/src/features/dashboard/DashboardPage.tsx`) filtra sus 4 tarjetas (`users`, `content`, `blocks`, `payments`) **solo por feature de licencia** (`hasFeature`, línea 42), no por plugin instalado.

Resultado: rutas fijas como `/admin/payments` y la tarjeta `payments` existen aunque no haya proveedor de pago instalado (página vacía / "sin proveedores"). No existe un contrato que mapee *sección/dato → plugin proveedor* ni un estado barato de "capacidades disponibles".

## 2. Vocabulario de capacidades

Una **capacidad** es un `string`. Se deriva del manifiesto ya existente (`packages/plugin-sdk/src/manifest.ts`):

- `manifest.id` → el `pluginId` (ej. `mercadopago`, `inventario`).
- `manifest.provides` (línea 118, `string[]`) → grupos de proveedores (ej. `payment`, `shipping`, `storage`).

Conjunto de capacidades de una organización:

```
capabilities(org) =
    { id : plugin instalado Y habilitado }
  ∪ { g : g ∈ provides del plugin instalado Y habilitado }
```

La habilitación se lee de `PluginInstallation.enabled` (`apps/api/prisma/schema.prisma`).

## 3. Endpoint de capacidades

```
GET /api/v1/organizations/:id/capabilities
→ 200 { organizationId: string, capabilities: string[] }
```

| Aspecto | Decisión |
|---|---|
| Fuente | `PluginInstallation` (`enabled = true`) + `manifest.provides` persistido |
| Permiso | `plugin.read` |
| Cache | TTL 5 s en memoria + invalidación en `POST /plugins/install`, `POST /plugins/:id/activate`, `POST /plugins/:id/deactivate`, `DELETE /plugins/:id` |
| Payload | solo `string[]` de ids/grupos — sin secretos, sin config, sin manifiesto completo |

Por qué no `GET /plugins`: devuelve `{ installed, catalog }` con manifiestos completos y config redactada (correcto para la página de gestión, innecesario para decidir visibilidad). El endpoint de capacidades es un arreglo pequeño y cacheable.

## 4. Contrato `requiredCapabilities`

```ts
interface NavItem {
  to: string;
  label: string;
  section: SectionKey;
  perm: string | null;
  feature?: string;
  /** Todas deben estar presentes (AND). Ausente = no condiciona. */
  requiredCapabilities?: string[];
}
```

Visibilidad (`isVisible`, extensión de `AdminLayout.tsx:187`):

```
isVisible(item) =
     (item.perm === null || hasPermission(item.perm))
  && hasFeature(item.feature)
  && (item.requiredCapabilities ?? []).every(c => capabilities.has(c))
  && !(PLUGIN_MANAGEMENT_PATHS.has(item.to) && !hasInstalledPlugins)
```

- **Fail-closed**: falta una capacidad ⇒ no se pinta enlace, tarjeta ni fetch.
- **Guard de ruta**: el componente de página también comprueba `requiredCapabilities` y devuelve `null`/404 ante deep-link. En backend, las rutas de un plugin desinstalado ya no existen (el `loader` las registra al cargar), así que la API es fail-closed por construcción.

## 5. Hook `useCapabilities`

```ts
// apps/web/src/lib/use-capabilities.ts
const { capabilities, isLoading } = useCapabilities();
// Set<string> cacheado con React Query (staleTime corto, invalidation on mutation)
const hasCapability = (c: string) => capabilities.has(c);
```

Consumido por `AdminLayout` (filtro de nav), `DashboardPage` (filtro de tarjetas) y cualquier ruta core condicional. Centraliza el fetch y evita N llamadas por página.

## 6. Mapa de visibilidad (sección/dato → capacidad)

Tabla de referencia (a codificar como constante en `apps/web/src/lib/visibility.ts`, no dispersa en JSX). Grupos multi-proveedor usan `provides`.

### 6.1 Rutas core condicionales

| Ruta fija (`AdminLayout`) | `requiredCapabilities` | Motivo |
|---|---|---|
| `/admin/payments` | `['payment']` | Sin proveedor de pago, la página queda vacía |
| `/admin/support` | `['support']` (solo si el módulo support pasa a plugin) | Hoy `support` es módulo core (`modules/support.ts`); si se externaliza, aplicar |
| `/admin/email` | — (módulo core `modules/email`) | No condiciona: el correo es funcionalidad núcleo |

> Regla: solo se condicionan las rutas core cuyo **dato** proviene de un plugin. Las rutas de funcionalidad núcleo (`content`, `users`, `roles`, `settings`, `menu`, `translations`, `license`, `audit`, `api-tokens`, `updates`, `templates`, `branches`) no declaran `requiredCapabilities`.

### 6.2 Dashboard

| Tarjeta / dato | `requiredCapabilities` | Nota |
|---|---|---|
| `users` | — (core) | ya filtrada por `feature:'core'` |
| `content` | — (core) | idem |
| `blocks` | — (core, `plugin.read`) | conteo de plugins instalados |
| `payments` | `['payment']` + `feature:'payments'` | hoy solo filtrada por feature (línea 38) |
| `inventory` (nueva) | `['inventario']` + `feature:'inventory'` | métrica de stock |
| `analytics` (nueva) | `['analytics']` + `feature:'analytics'` | métricas de tráfico |

### 6.3 Secciones/datos públicos (opcional M17)

| Sección pública | `requiredCapabilities` |
|---|---|
| `blog` | `['blog']` |
| `social` (muro/feed) | `['social']` |
| `academia` | `['academia']` |
| `reservas` | `['reservas']` |
| `suscripciones` | `['suscripciones']` |

## 7. Estándar de pulido profesional

Base: tokens de diseño ya en uso (variables CSS `--ws-*` consumidas en `AdminLayout` y `DashboardPage`).

### 7.1 Tokens de diseño (catálogo `tokens.css` / `@webs/ui`)

| Grupo | Variables | Uso |
|---|---|---|
| Espaciado | `--ws-space-1..8` | paddings/márgenes/gaps |
| Radios | `--ws-radius-sm/md/lg` | botones, cards, inputs |
| Tipografía | `--ws-font-size-xs/sm/md/lg`, `--ws-font-weight-*` | jerarquía |
| Sombras | `--ws-shadow-sm/md` | cards, dropdowns |
| Colores | `--ws-primary`, `--ws-danger`, `--ws-warning`, `--ws-border`, `--ws-muted`, `--ws-bg`, `--ws-surface` | semántica |

Regla: **ningún** valor hardcodeado de espaciado/color/radio en componentes. Los componentes existentes que usan `var(--ws-*)` inline se migran a clases de utilidad del tema.

### 7.2 Estados obligatorios

Toda vista asíncrona implementa los 4 estados:

| Estado | Componente `@webs/ui` | Comportamiento |
|---|---|---|
| `loading` | `<Skeleton/>` | esqueleto proporcional (no `…` suelto) |
| `empty` | `<EmptyState/>` | mensaje + CTA accionable |
| `error` | `<ErrorState/>` | mensaje + botón reintentar (`refetch`) |
| `success` | contenido | — |

Se provee `<AsyncBoundary/>` para no repetir la lógica. Hoy `DashboardPage` solo muestra `…` en loading (línea 69) y no distingue empty/error.

### 7.3 Accesibilidad (WCAG AA)

- `:focus-visible` visible en todos los controles.
- `aria-label` en controles iconográficos (ya presente en `AdminLayout`).
- Contraste texto/fondo ≥ 4.5:1 (tokens validados).
- Navegación por teclado completa (menú, dropdowns, modales).
- `prefers-reduced-motion` respetado en animaciones.

### 7.4 Responsive

- Breakpoints definidos en el tema (móvil/tablet/desktop).
- Sidebar colapsable (ya existe `collapsed`).
- Tablas → scroll lateral en móvil; grids → 1 columna.

### 7.5 Checklist de pulido de plugins (WB-167)

Cada UI de plugin debe cumplir, antes de considerarse "pulida":

1. [ ] Usa tokens `--ws-*` (sin valores hardcodeados).
2. [ ] Implementa `loading`/`empty`/`error`/`success`.
3. [ ] Controles con `aria-label` y `focus-visible`.
4. [ ] Responsive (móvil → desktop).
5. [ ] Cadenas 100 % en i18n (`es`/`en`/`pt`), sin texto hardcodeado.
6. [ ] Respeta `feature` de licencia (ADR-0019) y no pinta datos sin licencia.
7. [ ] Consistencia de sección/orden en su `menu[]` (`plugin.json`).

## 8. Trazabilidad M17 (docs/backlog.md §3.18)

| WB | Frente | Tarea | Este doc |
|---|---|---|---|
| WB-163 | Visibilidad — ADR + mapa | t231 | §2–§6 |
| WB-164 | Visibilidad — backend | t232 | §3 (endpoint) |
| WB-166 | Visibilidad — UI | t234 | §4–§5 |
| WB-165 | Pulido dashboard/admin/públicas | t233 | §7 |
| WB-167 | Pulido UIs plugins | t235 | §7.5 |
| WB-168 | i18n | t236 | §7.5.5 |
| WB-169 | QA | t237 | §7.2/§7.3 |
| WB-170 | release | t238 | — |

## 9. Anclado a archivos reales

- `apps/web/src/layouts/AdminLayout.tsx` — `navItems` (132–155), `pluginItems` (161–173), `isVisible` (187–190), `PLUGIN_MANAGEMENT_PATHS` (65), `hasInstalledPlugins` (130).
- `apps/web/src/features/dashboard/DashboardPage.tsx` — `metrics` (34–42), `visibleMetrics` (42), quickLinks (44–51).
- `apps/api/src/lib/plugin-menu.ts` — `collectPluginMenuItems` (66), `resolveSection` (36), `resolveItemFeature` (44).
- `apps/api/src/modules/menu/routes.ts` — `buildAdminMenu` (source core/plugin, dedup por path).
- `apps/api/src/modules/plugins/routes.ts` — `GET /` (installed/catalog, 47–65), mutaciones install/activate/deactivate (84/196/227/243).
- `packages/plugin-sdk/src/manifest.ts` — `provides` (118), `menu` (122), `PluginMenuItem`.
- `apps/api/prisma/schema.prisma` — `PluginInstallation { pluginId @unique, enabled, manifest, ... }`.
- Relación con `docs/architecture/menu-categorias.md` (taxonomía 9 secciones) y `docs/architecture/experiencia-publica.md` (M14, pulido público).
