# ADR-0032: Pulido profesional de páginas + visibilidad condicional por plugin instalado

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 17, v2.15.0)
- **Decisión:** Introducir un mecanismo declarativo de **visibilidad condicional por plugin instalado** (capabilidades derivadas de los plugins instalados + endpoint ligero cacheable, con *fail-closed*) y un **estándar de pulido profesional** para todas las páginas (admin + públicas + UI de plugins) basado en tokens de diseño, estados de carga/vacío/error y accesibilidad.

## Contexto

El panel `/admin` tiene dos fuentes de ítems de menú (ver `apps/web/src/layouts/AdminLayout.tsx`):

1. **Núcleo fijo** — `navItems` (22 ítems hardcodeados, líneas 132–155): `dashboard`, `content`, `pages`, `editor`, `payments`, `email`, `support`, `appearance`, `translations`, `menu`, `plugins`, `generated`, `api-tokens`, `settings`, `templates`, `branches`, `updates`, `license`, `license/keys`, `users`, `roles`, `audit`. Cada uno declara `section` y `perm` (y solo `/admin/generated` declara `feature: 'generator'`).
2. **Ítems de plugins** — derivados de `GET /menu` (`menuData.items`), que ya integra los `menu[]` de los plugins instalados de forma nativa (servidor: `apps/api/src/lib/plugin-menu.ts` → `collectPluginMenuItems('admin')` + `apps/api/src/modules/menu/routes.ts` → `buildAdminMenu`).

El dashboard (`apps/web/src/features/dashboard/DashboardPage.tsx`) muestra 4 tarjetas de métricas (`users`, `content`, `blocks`, `payments`) filtradas **solo por feature de licencia** (`hasFeature`), no por plugins instalados.

Problema observado (pedido del usuario, M17 WB-163/WB-164/WB-166):

- **Ítems de plugins** ya desaparecen correctamente al desinstalar (provienen de `GET /menu`).
- Pero **secciones y datos del núcleo que dependen de un plugin** NO son condicionales: por ejemplo `/admin/payments` (y la tarjeta `payments` del dashboard) existen aunque no haya ningún proveedor de pago instalado; la página queda vacía o con "sin proveedores". No hay un modo degradado coherente ni un contrato que mapee *sección/dato → plugin proveedor*.
- No existe hoy ningún concepto de "capacidades disponibles" (`grep "capabilit"` en `apps/api/src` y `apps/web/src` no arroja coincidencias); el único estado de plugins instalados lo expone `GET /plugins` (`apps/api/src/modules/plugins/routes.ts` → `{ installed: [...], catalog: [...] }`), que serializa manifiestos completos y es pesado para renderizar el shell/dashboard en cada carga.

Objetivo: que *lo que no tiene plugin instalado no se pinte* (ni ruta, ni tarjeta, ni datos) — *fail-closed*, no "modo degradado" — y que toda página alcance un estándar de pulido uniforme.

## Decisión

### 1. Vocabulario de capacidades (derivado del manifiesto existente)

Una **capacidad** (`capability`) es un `string` que identifica una funcionalidad provista por un plugin. Se deriva de dos fuentes ya presentes en `PluginManifest` (`packages/plugin-sdk/src/manifest.ts`):

- `manifest.id` — el `pluginId` instalado (ej. `mercadopago`, `inventario`).
- `manifest.provides` (array de grupos, línea 118) — grupos de proveedores (ej. `payment`, `shipping`, `storage`, `analytics`).

El **conjunto de capacidades de una organización** es la unión:

```
capabilities(org) = { id de cada plugin instalado y habilitado }
                    ∪ { g ∈ provides de cada plugin instalado y habilitado }
```

Ejemplo: con `mercadopago` instalado → `capabilities = { mercadopago, payment }`; con `inventario` → `{ inventario }`; con `stripe` → `{ stripe, payment }`.

Esto reutiliza el contrato existente sin introducir un nuevo campo en el manifiesto (ADR-0019 ya usa `feature` para el gating por licencia; `provides` se usa para el selector de proveedores en `GET /plugins/providers/:group`).

### 2. Endpoint ligero y cacheable de capacidades

Se añade un endpoint dedicado (más barato que `GET /plugins`, que serializa manifiestos completos):

```
GET /api/v1/organizations/:id/capabilities   (o GET /api/v1/admin/capabilities)
→ { organizationId: string, capabilities: string[] }
```

- **Fuente**: `PluginInstallation` (`apps/api/prisma/schema.prisma`, modelo con `pluginId @unique`, `enabled`), filtrado por `enabled = true` y resuelto contra `manifest.provides` (el manifiesto ya está persistido en `PluginInstallation.manifest`).
- **Permiso**: `plugin.read` (o ninguno — el payload son solo identificadores/grupos, sin secretos ni config). Se recomienda `plugin.read` para consistencia con `GET /plugins`.
- **Cache**: memoria en proceso con TTL corto (5 s) + invalidación explícita en `POST /plugins/install`, `POST /plugins/:id/activate|deactivate`, `DELETE /plugins/:id` (los puntos de mutación de `apps/api/src/modules/plugins/routes.ts`). El shell y el dashboard ya usan React Query (`useQuery`), que añade una segunda capa de cache/staleTime en cliente.
- **Justificación**: `GET /plugins` devuelve el catálogo completo (manifiestos, config redactada) — correcto para la página de gestión, innecesario para decidir visibilidad. El endpoint de capacidades es un `string[]` pequeño, seguro de cachear y suficiente para el contrato declarativo.

### 3. Contrato declarativo `requiredCapabilities` (fail-closed)

Los ítems del núcleo que dependen de un plugin declaran un campo nuevo en su metadata:

```ts
interface NavItem {
  to: string;
  label: string;
  section: SectionKey;
  perm: string | null;
  feature?: string;
  /** Capacidades requeridas: TODAS deben estar presentes (AND). Ausente = no condiciona. */
  requiredCapabilities?: string[];
}
```

La visibilidad de un ítem pasa a ser (extensión de `isVisible`, línea 187 de `AdminLayout.tsx`):

```
isVisible(item) =
     (item.perm === null || hasPermission(item.perm))
  && hasFeature(item.feature)
  && (item.requiredCapabilities ?? []).every(c => capabilities.has(c))
  && !(PLUGIN_MANAGEMENT_PATHS.has(item.to) && !hasInstalledPlugins)
```

**Fail-closed**: si falta cualquiera de las capacidades requeridas, el ítem NO se pinta (ni enlace en el menú, ni tarjeta en el dashboard, ni se emite el fetch de datos). No existe "modo degradado".

### 4. Dos niveles de visibilidad (menú vs. datos)

- **Ítems provistos por plugins** → ya son condicionales por construcción: vienen de `GET /menu` (`collectPluginMenuItems`), y al desinstalar el plugin su `menu[]` desaparece del registro. No se duplican (el núcleo gana por `corePaths`, línea 159). No cambia.
- **Ítems del núcleo que dependen de un plugin** (rutas fijas de `AdminLayout` + tarjetas/quickLinks del dashboard) → se condicionan con `requiredCapabilities`.
- **Guard de ruta (defensa en profundidad)**: aunque el enlace se oculte, un deep-link directo no debe pintar la sección. El componente de página comprueba sus `requiredCapabilities` y devuelve `null` (o una vista 404) si no se cumplen. En el backend, los endpoints de un plugin desinstalado ya no existen (el `loader` registra las rutas solo al cargar el plugin), así que la capa API ya es fail-closed por construcción.

### 5. Mapa sección/dato → capacidad (catálogo de visibilidad)

El mapa inicial (a codificar como tabla constante, no disperso en JSX) es:

| Ítem / dato | Depende de | `requiredCapabilities` |
|---|---|---|
| `/admin/payments` (ruta fija) | proveedor de pago | `['payment']` |
| Tarjeta dashboard `payments` | proveedor de pago | `['payment']` |
| Tarjeta dashboard `inventory` (nueva) | plugin inventario | `['inventario']` |
| Tarjeta/panel `analytics` | plugin analytics | `['analytics']` |
| Sección `blog` (pública) | plugin blog | `['blog']` |
| Sección `social`/`comunidad` | plugin social | `['social']` |
| `academia`, `reservas`, `suscripciones`, `support`(legacy plugin), `chat`, `seo`, `storage` | su plugin homónimo | `[<pluginId>]` |

Los grupos multi-proveedor se expresan como `provides`: `payment` (mercadopago/stripe/paypal/ebanx/payway/modo/pos), `shipping` (andreani/oca/mercadolibre/correo). El mapa se centraliza en `packages/core` (o un módulo `apps/web/src/lib/visibility.ts`) y es testeable.

### 6. Pulido profesional — estándar de diseño

Se formaliza un estándar de pulido para **todas** las páginas (admin, públicas y UI de plugins), basado en el sistema de tokens ya en uso (los componentes actuales ya consumen variables CSS `--ws-*`):

- **Tokens de diseño** (catálogo `tokens.css` / `@webs/ui`): espaciado `--ws-space-1..n`, radios `--ws-radius-*`, tipografía `--ws-font-size-*` + `--ws-font-weight-*`, sombras `--ws-shadow-*`, colores semánticos `--ws-primary`/`--ws-danger`/`--ws-border`/`--ws-muted`/fondo. Ninguna página usa valores hardcodeados de espaciado/color.
- **Estados**: toda vista asíncrona implementa `loading` (Skeleton), `empty` (EmptyState con CTA), `error` (ErrorState con reintento). Se proveen componentes compartidos en `@webs/ui` (`<Skeleton/>`, `<EmptyState/>`, `<ErrorState/>`, `<AsyncBoundary/>`). Hoy `DashboardPage` solo muestra `…` en loading y no distingue empty/error.
- **Accesibilidad**: focus-visible visible, `aria-label` en controles iconográficos (ya parcialmente presente), contraste AA (4.5:1), navegación por teclado, `prefers-reduced-motion`.
- **Responsive**: breakpoints definidos, sidebar colapsable (ya existe `collapsed`), tablas con scroll lateral en móvil.
- **Checklist de pulido de plugins** (anexo al spec): cada UI de plugin debe cumplir tokens + estados + a11y + responsive + i18n antes de considerarse "pulida" (WB-167).

### 7. Sin dependencias de pago / todo nativo

El mecanismo de visibilidad y el estándar de pulido no introducen dependencias externas ni SaaS: son código nativo del monorepo (`packages/core`, `@webs/ui`, `apps/web`), coherente con `docs/architecture/base-universal.md` y `docs/architecture/politica-dependencias.md`.

## Consecuencias

### Positivas

- La UI refleja exactamente lo que el tenant tiene instalado: sin secciones ni tarjetas muertas (mejor UX y menos soporte).
- *Fail-closed* por construcción: capa API (rutas de plugin solo registradas al cargar) + capa UI (filtro declarativo + guard de ruta).
- El endpoint de capacidades es barato y cacheable (vs. serializar manifiestos completos).
- Un único estándar de pulido reduce la deriva visual entre las ~43 UIs de plugins.

### Negativas

- Nuevo campo de metadata (`requiredCapabilities`) a mantener en los ítems del núcleo cuando cambian las dependencias de plugin.
- El dashboard debe suscribirse también al estado de capacidades (una query más en el shell; mitigada por cache).
- El mapa sección→capacidad requiere mantenimiento al añadir/renombrar plugins.

## Notas

- Anclado a: `apps/web/src/layouts/AdminLayout.tsx` (navItems 132–155, pluginItems 161–173, isVisible 187–190, PLUGIN_MANAGEMENT_PATHS 65), `apps/web/src/features/dashboard/DashboardPage.tsx` (metrics 34–42 filtrados solo por feature), `apps/api/src/lib/plugin-menu.ts` (collectPluginMenuItems), `apps/api/src/modules/menu/routes.ts` (buildAdminMenu), `apps/api/src/modules/plugins/routes.ts` (GET `/` devuelve `installed`/`catalog`, mutaciones install/activate/deactivate), `packages/plugin-sdk/src/manifest.ts` (`provides` 118, `menu` 122), `apps/api/prisma/schema.prisma` (`PluginInstallation` con `pluginId @unique` + `enabled`).
- El spec técnico completo (mapa de visibilidad por plugin, contrato del endpoint, checklist de pulido y trazabilidad M17) vive en `docs/architecture/pulido-profesional-y-visibilidad.md`.
- Relación con ADRs previos: ADR-0019 (feature-gating por licencia) filtra por `feature`; este ADR filtra por **presencia del plugin** (`requiredCapabilities`) — son ejes ortogonales que se combinan en `isVisible`. ADR-0005/0003 (plugin system) definen `provides`/`menu` que aquí se reutilizan. ADR-0009 (Tailwind + Shadcn) es la base de los tokens de diseño.
- Trazabilidad M17 (docs/backlog.md §3.18): WB-163 (ADR + mapa) → este documento; WB-164 (backend server-side) → endpoint de capacidades; WB-166 (UI frontend) → `useCapabilities` + `requiredCapabilities`.
