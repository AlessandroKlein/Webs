# Feature-gating por licencia (mapeo y contrato)

Spec técnica del **ADR-0019**. Describe el mapeo canónico entre cada feature de la licencia
(`apps/api/src/modules/licenses/features.ts`) y los ítems de menú, plugins instalables y
secciones de dashboard que gobierna, junto con el contrato server-side y el comportamiento
de la UI.

## 1. Catálogo de features

Fuente de verdad: `LICENSE_FEATURES` en `apps/api/src/modules/licenses/features.ts`
(expuesto por `GET /api/v1/license/features`). 9 flags:

| key | label | area | core |
|-----|-------|------|------|
| `core` | Núcleo | core | ✅ siempre |
| `payments` | Pagos | commerce | ❌ |
| `shipping` | Envíos | commerce | ❌ |
| `inventory` | Inventario y tienda | commerce | ❌ |
| `ai` | Integraciones de IA | ai | ❌ |
| `analytics` | Analítica | ai | ❌ |
| `multitenant` | Cadenas multi-tenant | scale | ❌ |
| `marketplace` | Marketplace de plugins | extensions | ❌ |
| `templates` | Templates premium | extensions | ❌ |

La decisión de «activado» está en `LicenseService.hasFeature(feature)`
(`apps/api/src/modules/licenses/service.ts:153-157`): `core` siempre `true`; premium requiere
licencia `configured && active` y el flag presente en `state.features`.

## 2. Mapeo feature → menú / plugins / dashboard

### `core` — siempre disponible

| Menú admin (AdminLayout `navItems`) | Plugins | Dashboard |
|--------------------------------------|---------|-----------|
| `/admin` (dashboard), `/admin/content`, `/admin/pages`, `/admin/editor`, `/admin/users`, `/admin/roles`, `/admin/audit`, `/admin/settings`, `/admin/appearance`, `/admin/translations`, `/admin/menu`, `/admin/api-tokens`, `/admin/email`, `/admin/support`, `/admin/updates`, `/admin/license`, `/admin/license/keys` | `register`, `social-login`, `blog`, `documentos`, `formularios`, `mapa`, `chat`, `notificaciones`, `push`, `twilio`, `comments`, `social`, `support`, `search`, `seo`, `calendario`, `reservas`, `workflows`, `storage-s3`, `afiliados`, `marketing`, `example` | `users`, `content`, `installedPlugins` (blocks), `roles`, `pages`, `media`, `activeSessions`, `email` |

### `payments` — Pagos

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| `/admin/payments` + ítems de plugin (`/admin/invoices`, suscripciones, carrito, ecommerce, arca) | `ebanx`, `mercadopago`, `modo`, `paypal`, `payway`, `pos`, `stripe`, `facturacion`, `suscripciones`, `carrito`, `ecommerce`, `arca` | métrica `payments` |

### `shipping` — Envíos

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| ítems de plugin (andreani, oca, mercadolibre, correo) | `andreani`, `oca`, `mercadolibre`, `correo` | sección de envíos/cotización |

### `inventory` — Inventario y tienda

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| ítems de plugin (inventario, tienda) | `inventario`, `ecommerce`, `carrito` | sección stock/productos |

### `ai` — Integraciones de IA

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| ítem de plugin (chat-ia) | `chat-ia` | sección IA/asistentes |

### `analytics` — Analítica

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| ítem de plugin (analytics) | `analytics` | sección métricas/reportes |

### `multitenant` — Cadenas multi-tenant

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| `/admin/branches` + ítem de plugin (organizaciones) | `organizaciones` | vista consolidada de cadenas (finanzas) |

### `marketplace` — Marketplace de plugins

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| `/admin/plugins` | (catálogo/instalación remota) | — |

### `templates` — Templates premium

| Menú admin | Plugins | Dashboard |
|------------|---------|-----------|
| `/admin/templates` | (templates premium) | — |

> Nota: la clasificación de plugins por `category`/`provides` se obtuvo de los `plugin.json`
> actuales (43 plugins). Un plugin puede mapear a más de una feature si lo declara (p. ej.
> `ecommerce` participa de `payments` e `inventory`); el contrato admite una sola `feature`
> por manifiesto, por lo que se elige la principal y las secundarias se tratan como
> dependencias de feature (ver §5).

## 3. Declaración `feature` (cambio de contrato)

| Superficie | Archivo | Campo nuevo |
|------------|---------|-------------|
| Manifiesto de plugin | `packages/plugin-sdk/src/manifest.ts` (`PluginManifest`) | `feature?: string` (default `'core'`) |
| Ítem de menú de plugin | `packages/plugin-sdk/src/manifest.ts` (`PluginMenuItem`) | `feature?: string` |
| Entrada de catálogo | `apps/api/src/plugins/catalog.ts` (`RegistryPluginEntry`/`CatalogItem`) | `feature?: string` + `licensed: boolean` |
| Menú core | `apps/web/src/layouts/AdminLayout.tsx` (`NavItem`) | `feature?: string` |
| Dashboard | `apps/web/src/features/dashboard/DashboardPage.tsx` | `feature` por métrica/sección |

Regla de precedencia para un ítem de menú: `manifest.menu[].feature` > `feature` del
manifiesto > `'core'`. Un plugin sin `feature` (o `'core'`) es siempre instalable.

## 4. Contrato server-side

| Endpoint | Archivo | Cambio |
|----------|---------|--------|
| `GET /api/v1/license/features` | `apps/api/src/modules/licenses/routes.ts:15-35` | Ya existe: devuelve `enabled` por feature. Sin cambios. |
| `GET /api/v1/license` | `apps/api/src/modules/licenses/routes.ts:6-13` | Ya existe: `verify()` → `LicenseState.features`. Sin cambios. |
| `GET /api/v1/menu` | `apps/api/src/modules/menu/routes.ts:36-45` | Añadir `feature` a cada item devuelto (default `'core'`); **no** filtrar. |
| `GET /api/v1/plugins/catalog` | `apps/api/src/plugins/catalog.ts` | Añadir `feature` + `licensed` (hasFeature) a cada `CatalogItem`. |
| `POST /api/v1/plugins/install` | `apps/api/src/modules/plugins/routes.ts` + `apps/api/src/plugins/loader.ts` | **403** si el manifiesto declara `feature` premium no licenciada. |

La comprobación autoritativa es la de instalación (servidor). El filtrado de `GET /menu` y
del catálogo es **informativo** (`feature`/`licensed`), porque el cliente decide entre
ocultar y *upsell*; pero el servidor siempre bloquea la instalación de lo no licenciado.

## 5. Comportamiento UI

Nuevo `apps/web/src/lib/license-store.ts` (store Zustand):

- Fetch una vez de `GET /api/v1/license/features` al montar el shell admin.
- Expone `hasFeature(key)` y `enabledFeatures`.
- Si falla la petición o no hay `license.read`, degrada a «solo core» (fail-closed).

Puntos de aplicación:

1. **AdminLayout** — filtrar `navItems` y `pluginItems` con `feature` no licenciada
   (ocultar de la sidebar).
2. **PluginsPage (catálogo)** — badge «Premium · no incluido» + botón instalar
   deshabilitado → link `/admin/license`.
3. **DashboardPage** — ocultar métricas con `feature` no licenciada; tarjeta
   «Mejorá tu plan» con la feature y link `/admin/license`.
4. **/admin/license** — ya existente; muestra estado + features (coherente con upsell).

### Upsell vs ocultar

| Contexto | Decisión |
|----------|----------|
| Menú/sidebar | Ocultar |
| Catálogo de plugins | Mostrar con badge + botón deshabilitado (descubribilidad) |
| Dashboard | Ocultar métrica + tarjeta upsell |
| Instalación | 403 (servidor) |

## 6. Trazabilidad

- ADR-0019 (este diseño) → `docs/adr/0019-feature-gating.md`.
- Backlog M6: WB-104 (ADR+spec), WB-105/106/107 (filtro server-side), WB-108/109
  (LicenseProvider + upsell), WB-110 (i18n), WB-111 (docs), WB-112 (QA), WB-113 (release).
- Coherente con `docs/architecture/licensing-integration.md` (Licensify),
  `docs/architecture/base-universal.md` y `docs/architecture/politica-dependencias.md`.
