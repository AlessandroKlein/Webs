# Feature-gating por licencia (guía operativa)

Esta guía explica **cómo se gobierna lo que el cliente ve según su licencia**: el mapeo de
features → menú/plugins/datos, cómo agregar una feature nueva gateable y cómo vender y
activar licencias para que el cliente vea exactamente lo que pagó.

Referencias de diseño: [ADR-0019](../adr/0019-feature-gating.md) y
[Spec de mapeo](../architecture/feature-gating.md).

## 1. Cómo se mapean las features a menú / plugins / datos

La licencia local (`@licensify/core`) firma un array `features` inmutable dentro de la clave
de activación. El backend decide con **una sola puerta**:

- `apps/api/src/modules/licenses/features.ts` → `LICENSE_FEATURES` (catálogo canónico de 9
  flags: `core` siempre activa + 8 premium).
- `apps/api/src/modules/licenses/service.ts` → `LicenseService.hasFeature(feature)`:
  `core` es siempre `true`; premium requiere licencia `configured && active` con el flag.
- `apps/api/src/lib/feature-gating.ts` → `resolveFeature(feature)` (default `'core'`) e
  `isLicensed(fastify, feature)` (normaliza el campo y delega en `hasFeature`).

Cada recurso declara **de forma declarativa** a qué feature pertenece mediante el campo
`feature` (opcional; ausente = `'core'`):

| Superficie | Archivo | Campo |
|------------|---------|-------|
| Manifiesto de plugin | `packages/plugin-sdk/src/manifest.ts` (`PluginManifest`) | `feature?: string` |
| Ítem de menú de plugin | `packages/plugin-sdk/src/manifest.ts` (`PluginMenuItem`) | `feature?: string` |
| Entrada de catálogo | `apps/api/src/plugins/catalog.ts` (`RegistryPluginEntry`/`CatalogItem`) | `feature?: string` + `licensed: boolean` |
| Menú core del shell | `apps/web/src/layouts/AdminLayout.tsx` (`NavItem`) | `feature?: string` |
| Métricas del dashboard | `apps/web/src/features/dashboard/DashboardPage.tsx` | `feature` por métrica |

**Precedencia** para un ítem de menú de plugin:
`manifest.menu[].feature` > `manifest.feature` > `'core'`
(resuelto en `apps/api/src/lib/plugin-menu.ts`).

El mapeo feature → recursos está documentado en la
[tabla de la spec](../architecture/feature-gating.md#2-mapeo-feature--men--plugins--dashboard).
Resumen de la clasificación de los 43 plugins:

- `core` (siempre): `register`, `social-login`, `blog`, `documentos`, `formularios`,
  `mapa`, `chat`, `notificaciones`, `push`, `twilio`, `comments`, `social`, `support`,
  `search`, `seo`, `calendario`, `reservas`, `workflows`, `storage-s3`, `afiliados`,
  `marketing`, `example`.
- `payments`: `ebanx`, `mercadopago`, `modo`, `paypal`, `payway`, `pos`, `stripe`,
  `facturacion`, `suscripciones`, `carrito`, `ecommerce`, `arca`.
- `shipping`: `andreani`, `oca`, `mercadolibre`, `correo`.
- `inventory`: `inventario` (+ `ecommerce`, `carrito`).
- `ai`: `chat-ia`.
- `analytics`: `analytics`.
- `multitenant`: `organizaciones`.
- `marketplace` / `templates`: panel `/admin/plugins` / `/admin/templates`.

## 2. Contrato server-side (la frontera autoritativa)

| Endpoint | Archivo | Comportamiento |
|----------|---------|----------------|
| `GET /api/v1/license` | `modules/licenses/routes.ts` | Devuelve `LicenseState` con `features` activas y `status`. |
| `GET /api/v1/license/features` | `modules/licenses/routes.ts` | Devuelve cada flag con `enabled` (`core` o feature activa). |
| `GET /api/v1/menu` | `modules/menu/routes.ts` + `lib/plugin-menu.ts` | Añade `feature` a cada item (default `'core'`); **no filtra** (el cliente decide). |
| `GET /api/v1/public/menu` | `modules/settings/routes.ts` | **Filtra** premium no licenciada (fail-closed). |
| `GET /api/v1/plugins/catalog` | `plugins/catalog.ts` | Añade `feature` + `licensed` a cada `CatalogItem`. |
| `POST /api/v1/plugins/install` | `modules/plugins/routes.ts` | **403 `feature_not_licensed`** si el manifiesto declara feature premium no licenciada. |

La comprobación de instalación es la **única autoritativa**: aunque el cliente oculte o
muestre cosas en la UI, el servidor rechaza instalar/acceder a lo no licenciado.

## 3. Comportamiento UI (`useLicense`)

- `apps/web/src/lib/use-license.ts` → hook `useLicense()` que consume
  `GET /api/v1/license` (mismo `queryKey ['license']` que la página `/admin/license`) y
  expone `hasFeature(feature)`. Lógica: `core`/sin feature → `true`; premium → `true` solo
  si `status === 'active'` y la incluye.
- **Fail-open** en UI: si el usuario no tiene `license.read`, no se oculta nada (el backend
  es quien bloquea). Por eso `/admin/license` es la fuente de verdad visual: al activar o
  desactivar, el `queryKey` compartido invalida `useLicense` y re-renderiza.

Puntos de aplicación:

| Superficie | Archivo | Regla |
|------------|---------|-------|
| Sidebar admin | `AdminLayout.tsx` | `pluginItems.filter(item => hasFeature(item.feature))` — oculta items premium no licenciados. |
| Catálogo | `features/plugins/PluginsPage.tsx` | Badge `bi-gem` «Premium» + botón Instalar deshabilitado con `title` de upsell (`plugins.upsellTitle`). |
| Dashboard | `features/dashboard/DashboardPage.tsx` | `metrics.filter(m => hasFeature(m.feature))` — oculta métricas no licenciadas. |
| Sitio público | `SiteHeader` | Sin cambio: `GET /public/menu` ya filtra fail-closed en backend. |

## 4. Cómo agregar una feature nueva gateable

1. **Añadir la flag** en `apps/api/src/modules/licenses/features.ts` (`LICENSE_FEATURES`),
   con `key`, `label`, `description`, `area` y `core: false` (salvo que sea una feature
   siempre activa). `GET /api/v1/license/features` la expone automáticamente.
2. **Declarar `feature` en los recursos** que la gobiernan:
   - Manifiesto de plugin (`feature: 'nueva-feature'` en `plugin.json`).
   - Items de menú (`menu[].feature`) si el plugin aporta un item.
   - Métrica/sección del dashboard, si corresponde.
   - Item del menú core (`AdminLayout.tsx` `NavItem.feature`) si es un ítem del shell.
3. **Verificar el gating server-side**: `GET /menu` y `GET /plugins/catalog` deben devolver
   la feature; `POST /plugins/install` debe devolver 403 si no está licenciada.
   `resolveFeature`/`isLicensed` (en `lib/feature-gating.ts`) ya hacen el trabajo genérico.
4. **Verificar la UI**: `useLicense().hasFeature('nueva-feature')` debe ocultar/marcar los
   recursos cuando la licencia no incluye la flag.
5. **i18n**: si el catálogo/menú expone texto nuevo, agregar claves en los 3 locales
   (`packages/i18n/src/locales/{es,en,pt}.ts`).

> Una feature premium que nadie declara (sin `feature` en ningún manifiesto/ítem) no tiene
> efecto visible: el gating es 100 % declarativo.

## 5. Cómo vender y activar licencias para que el cliente vea lo que pagó

El flujo es **local y offline** (sin servidor de licencias ni pasarela de pago; ver
[Claves de licencia para la venta](claves-de-venta.md)):

1. **Emitir la clave** (lado vendedor) desde `Administración → Claves de licencia`
   (`/admin/license/keys`) o con `@licensify/cli`:
   - Elegir comprador (`licensee`), producto (`productId`), fingerprint del comprador y
     duración (`expiresAt`).
   - Seleccionar las **features** que incluye (agrupadas por área, excluyendo `core` que es
     siempre disponible). El catálogo sale de `GET /api/v1/license/features`.
   - `POST /api/v1/license/keys` emite la `activationKey` firmada (Ed25519 + cifrada por
     fingerprint) cuando está configurada `LICENSE_PRIVATE_KEY` (solo entorno vendedor), o
     registra una clave ya emitida por CLI.
2. **Entregar la clave** al cliente (por email/chat — el flujo es manual y offline).
3. **Activar** (lado cliente) en `Administración → Licencia`: pegar la `activationKey`
   (`POST /api/v1/license/activate`). El backend valida firma + fingerprint (node-locking),
   descifra el payload y pasa `status` a `active` con el array `features`.
4. **El cliente ve exactamente lo pagado**: a partir de ese momento
   `hasFeature(feature)` es `true` solo para las features de su clave — el menú muestra los
   ítems, el catálogo habilita instalar los plugins premium y el dashboard muestra las
   métricas correspondientes. Lo que no está en su clave queda oculto/marcado como
   «Premium · no incluido», y el backend lo bloquea con 403.
5. **Revocar** (si el cliente no renueva): `POST /api/v1/license/keys/:id/revoke` (nivel 3
   de la spec) marca la clave `revoked`; una clave revocada ya no supera la validación en
   nuevas activaciones.

> La emisión firmada requiere `LICENSE_PRIVATE_KEY` (nunca se embebe en la app) y la
> activación requiere `LICENSE_PUBLIC_KEY`. Ambas se declaran en `docker-compose.yml`
> (con `compose.override.yml` de ejemplo). La validación (`POST /api/v1/license/keys/validate`)
> permite probar el flujo completo sin instalar otra instancia.

## 6. Verificación rápida

```bash
# En el repo Webs:
pnpm --filter @webs/plugin-sdk build          # contrato feature en manifiesto
pnpm --filter @webs/api typecheck && pnpm --filter @webs/api lint
node scripts/test-feature-gating.ts           # smoke: core vs premium cambia menú y catálogo

# En el repo Docs:
mkdocs build
```

Sin licencia (o con licencia `core`), `GET /api/v1/plugins/catalog` muestra los plugins
premium con `licensed:false`, `GET /api/v1/public/menu` los excluye, e instalar uno devuelve
403 `feature_not_licensed`.
