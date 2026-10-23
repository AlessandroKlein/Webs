# ADR-0019: Feature-gating por licencia en menús, plugins y datos

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 2.4.0 del monorepo — Milestone 6)
- **Decisión:** El catálogo canónico `LICENSE_FEATURES` + `LicenseService.hasFeature()` es la
  única fuente de verdad para el *feature-gating*. Cada ítem de menú, plugin instalable y
  sección de dashboard declara una clave de `feature`; el servidor expone la licencia
  activa y marca cada recurso con su `feature` + estado `licensed`, y la UI (un
  `LicenseProvider`/`hasFeature`) oculta o muestra con *upsell* lo que no está licenciado.

## Contexto

La licencia local (`@licensify/core`, ADR-0007) firma un array `features` inmutable dentro
de la clave de activación. El backend ya tiene el catálogo canónico y la puerta de
decisión, pero **no** están cableados a la UI:

- `apps/api/src/modules/licenses/features.ts` — `LICENSE_FEATURES`: 9 flags
  (`core` siempre activa + 8 premium: `payments`, `shipping`, `inventory`, `ai`,
  `analytics`, `multitenant`, `marketplace`, `templates`).
- `apps/api/src/modules/licenses/service.ts:153-157` — `hasFeature(feature)`:
  `core` siempre `true`; premium requiere `configured && status === 'active' &&
  features.includes(feature)`.
- `apps/api/src/modules/licenses/routes.ts:21-34` — `GET /api/v1/license/features` ya
  devuelve `{ features: [{ key, label, description, area, core, enabled }] }` con
  `enabled = isCoreFeature(key) || active.has(key)`.

Hoy la UI filtra **solo por permisos** (`hasPermission`), nunca por licencia:

- `apps/web/src/layouts/AdminLayout.tsx:127-149` — `navItems` (21 ítems core) con campo
  `perm`, y `pluginItems` (de `GET /menu`) filtrados por `permissions`. No hay `feature`.
- `packages/plugin-sdk/src/manifest.ts` — `PluginManifest` y `PluginMenuItem` **no** tienen
  campo `feature`.
- `apps/api/src/plugins/catalog.ts` — `RegistryPluginEntry`/`CatalogItem` **no** exponen
  `feature` ni `licensed`.

Consecuencia: una instancia sin licencia de `payments` sigue viendo `/admin/payments`,
puede instalar `mercadopago`, y el dashboard muestra la métrica de pagos — aun cuando la
feature no está activa. El objetivo de este ADR es cerrar ese hueco de forma declarativa y
sin servidor de licencias externo.

## Decisión

### 1. Fuente de verdad única

`LICENSE_FEATURES` (`features.ts`) es el catálogo canónico de flags y `hasFeature()` la
única función de decisión. No se introduce una segunda lista de features en la UI: el
cliente consume `GET /api/v1/license/features` y deriva el mapa
`feature → enabled`.

### 2. Declaración declarativa `feature`

Añadir un campo opcional `feature: string` (clave del catálogo, default `'core'`) en las
tres superficies que se gobiernan:

| Superficie | Archivo actual | Cambio |
|------------|----------------|--------|
| Ítem de menú de plugin | `packages/plugin-sdk/src/manifest.ts` (`PluginMenuItem`) | `feature?: string` |
| Manifiesto de plugin | `packages/plugin-sdk/src/manifest.ts` (`PluginManifest`) | `feature?: string` (también `RegistryPluginEntry`/`CatalogItem` en `catalog.ts`) |
| Menú core del shell | `apps/web/src/layouts/AdminLayout.tsx` (`NavItem`) | `feature?: string` (default `'core'`) |
| Secciones/metrics del dashboard | `apps/web/src/features/dashboard/DashboardPage.tsx` | `feature` por métrica/sección |

Un recurso **sin** `feature` (o con `'core'`) es siempre visible. Un recurso con una
feature premium solo es visible/instalable si `hasFeature(feature)` es `true`.

### 3. Contrato server-side

- `GET /api/v1/license/features` (ya existe, `license.read`) → `enabled` por feature.
  Es la fuente que consume el `LicenseProvider`.
- `GET /api/v1/menu` (`setting.read`, `apps/api/src/modules/menu/routes.ts:36-45`) →
  cada item devuelto añade `feature` (default `'core'`). **No filtra** hard: devuelve
  todo, para que el cliente decida entre ocultar y *upsell*.
- `GET /api/v1/plugins/catalog` → cada `CatalogItem` añade `feature` y `licensed`
  (`hasFeature(feature)`). El cliente decide ocultar o marcar.
- `POST /api/v1/plugins/install` (y el flujo `installRemotePlugin` en
  `apps/api/src/plugins/loader.ts`) → **403** si el manifiesto declara una `feature`
  premium no licenciada. Esta es la única comprobación **autoritativa** (el servidor no
  confía en el filtrado del cliente).

### 4. Comportamiento UI (`LicenseProvider` + `hasFeature`)

Nuevo `apps/web/src/lib/license-store.ts` (store Zustand, análogo a `auth-store` y
`tenant-store`): al montar el shell admin, hace `GET /api/v1/license/features` una vez y
expone `hasFeature(key)` + `enabledFeatures`. Si la petición falla o no hay `license.read`,
el proveedor degrada a «solo core» (fail-closed en la UI).

- **Menú admin** (`AdminLayout.tsx`): un item con `feature` premium no licenciada se
  **oculta** (no se renderiza en la sidebar).
- **Catálogo** (`PluginsPage.tsx`): un plugin premium no licenciado se **muestra** con
  badge «Premium · no incluido» y botón de instalar deshabilitado → clic redirige a
  `/admin/license` (upsell).
- **Dashboard** (`DashboardPage.tsx`): métricas/secciones con `feature` premium no
  licenciada se **ocultan**; en su lugar se muestra una tarjeta compacta «Mejorá tu plan»
  con la feature faltante y enlace a `/admin/license`.

`/admin/license` (ya existente) sigue siendo el punto de consulta/activación de la
licencia, coherente con el *upsell*.

### 5. Política de upsell: ocultar vs mostrar

| Contexto | Comportamiento | Razón |
|----------|----------------|-------|
| Menú/sidebar | **Ocultar** | No hay acción posible en la navegación; el ruido degrada la UX. |
| Catálogo de plugins | **Mostrar** con badge + botón deshabilitado | Descubribilidad: el usuario debe saber que el plugin existe y qué necesita para usarlo. |
| Dashboard | **Ocultar** la métrica + tarjeta **upsell** | Evita datos fantasma, pero conserva una vía de conversión. |
| Endpoint/instalación | **403** (no es UI) | El servidor es la frontera autoritativa; nunca confiar en el cliente. |

### 6. Mapeo feature → menú / plugins / dashboard

La tabla completa (por feature) vive en
[`docs/architecture/feature-gating.md`](../architecture/feature-gating.md). Resumen de la
clasificación de los 43 plugins por `category`/`provides`:

- `core` (siempre): auth (`register`, `social-login`), contenido (`blog`, `documentos`,
  `formularios`, `mapa`), comunicación (`chat`, `notificaciones`, `push`, `twilio`),
  social (`comments`, `social`), soporte (`support`), seo (`search`, `seo`), negocio base
  (`calendario`, `reservas`, `workflows`), infraestructura (`storage-s3`), marketing
  (`afiliados`, `marketing`), `example`.
- `payments`: pasarelas (`ebanx`, `mercadopago`, `modo`, `paypal`, `payway`, `pos`,
  `stripe`) + `facturacion`, `suscripciones`, `carrito`, `ecommerce`, `arca`.
- `shipping`: `andreani`, `oca`, `mercadolibre`, `correo`.
- `inventory`: `inventario`, `ecommerce`, `carrito`.
- `ai`: `chat-ia`.
- `analytics`: `analytics`.
- `multitenant`: `organizaciones` (+ `/admin/branches`).
- `marketplace`: `/admin/plugins` (catálogo/instalación).
- `templates`: `/admin/templates` (+ templates premium).

## Consecuencias

### Positivas

- Una sola puerta (`hasFeature`) y un solo catálogo (`LICENSE_FEATURES`); sin duplicar la
  lista de features en el frontend.
- El gating queda **declarativo** (`feature` en manifiesto/ítem), por lo que un plugin de
  terceros puede declarar su feature premium sin tocar el core.
- La frontera autoritativa sigue en el servidor (403 en instalación), no en el cliente.
- Coherente con ADR-0007 (licencia offline) y con la política «todo nativo, sin modo de
  pago» (`docs/architecture/politica-dependencias.md`): el *upsell* redirige a
  `/admin/license`, no a una pasarela SaaS.

### Negativas

- Requiere añadir el campo `feature` al contrato `plugin.json` (SDK) y re-validar los 43
  manifiestos (cambio de contrato, retrocompatible porque el campo es opcional).
- El `LicenseProvider` añade una dependencia de datos al shell admin (una petición más al
  montar; se mitiga con caché de store + degradación a «solo core»).
- El *upsell* del catálogo muestra plugins que el usuario no puede instalar, lo que puede
  leerse como «ruido» si no se acompaña de un mensaje claro.

## Notas

- La feature `core` no es un flag de licencia: `isCoreFeature()` la fuerza a `true` aunque
  no venga en la clave (ver `features.ts:95-97`). El mapeo debe tratar `core` como
  «siempre visible», nunca como premium.
- El campo `feature` en el contrato es la deuda de implementación de M6 (WB-105/106/107 en
  `docs/backlog.md`); este ADR define el contrato, no lo implementa.
- `GET /api/v1/license/features` exige `license.read`; por eso el `LicenseProvider` solo
  tiene sentido dentro del shell admin (el sitio público usa `GET /public/menu`, que ya
  excluye lo que no debe verse en front público).
