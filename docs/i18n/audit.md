# Auditoría i18n — Webs

> Fecha: 2026-10-23 · Autor: traductor (equipo `webs`) · Alcance: inventario de idiomas, strings hardcodeadas y plan de idiomas. **Este documento no modifica código**; la implementación corresponde a la tarea de i18n posterior.

## 1. Resumen ejecutivo

La plataforma Webs tiene una infraestructura i18n **sólida y correctamente diseñada**, pero la **adopción en el frontend es parcial y muy desigual**: una minoría de páginas usa `t()`, mientras que la gran mayoría mantiene cadenas **hardcodeadas en español**. El paquete base `@webs/i18n` ya traduce 3 idiomas (`es`, `en`, `pt`), y la API ya expone catálogo + recursos bajo demanda + sobrescrituras del administrador. El trabajo pendiente es, sobre todo, **migrar las cadenas literales del frontend al sistema `t()`**, corregir un par de bugs de paridad de claves, y luego extender el catálogo a los idiomas objetivo.

Hallazgos clave (cuantitativos):

| Indicador | Valor | Nota |
|---|---|---|
| Idiomas en `@webs/i18n` | **3** (`es`, `en`, `pt`) | ~577 claves planas por locale |
| Archivos locale | `es.ts`, `en.ts`, `pt.ts` | `packages/i18n/src/locales/` |
| Bugs de paridad de claves | **2** | `lang.pt` ausente en `es`/`en`; `app.tagline` de `pt` en español |
| Cadenas con acentos españoles en `apps/web` (`*.tsx`) | **~580** | indicador de hardcodeo (ver §4) |
| Cadenas con acentos españoles en `apps/api` (`*.ts`) | **~653** | en su mayoría comentarios + errores lanzados al usuario |
| Atributos `label=`/`placeholder=`/`title=`/`aria-label=` en `apps/web` | **~278** | en su mayoría hardcodeados |
| Ocurrencias de `useTranslation`/`t(`/`i18n.t(` | **~796** | mezcla de uso correcto y hardcodeo en los mismos archivos |

## 2. Inventario de idiomas presentes

### 2.1 Catálogo actual (`packages/i18n/src/index.ts`)

```ts
export const DEFAULT_LOCALE = 'es';
export const AVAILABLE_LOCALES = [
  { code: 'es', label: 'Spanish',  nativeLabel: 'Español'  },
  { code: 'en', label: 'English',  nativeLabel: 'English'  },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
];
export const SUPPORTED_LOCALES = ['es', 'en', 'pt'];
export const baseResources = { en: { translation: en }, es: { translation: es }, pt: { translation: pt } };
```

`createI18n()` inicializa i18next con `lng` por defecto `es`, `fallbackLng: 'en'`, `supportedLngs: es/en/pt`, `interpolation.escapeValue: false`, `returnEmptyString: false`, y acepta `resources` para fusionar traducciones de plugins en runtime.

### 2.2 Archivos de traducción

| Locale | Archivo | Líneas | Claves |
|---|---|---|---|
| Español | `packages/i18n/src/locales/es.ts` | 577 | ~577 |
| Inglés | `packages/i18n/src/locales/en.ts` | 577 | ~577 |
| Portugués | `packages/i18n/src/locales/pt.ts` | 578 | ~578 |

Formato: `export const <locale>: Record<string, string>` con claves planas en notación de punto.

### 2.3 Namespaces (secciones de claves)

`app.*`, `common.*`, `nav.*`, `dashboard.*`, `auth.*`, `theme.*`, `lang.*`, `site.header.*`, `site.hero.*`, y `admin.{blog, social, chat, calendar, forms, commerce, invoices, analytics, notifications, auth, organizations, inventory, account}.*`.

### 2.4 Infraestructura en `apps/web`

- `apps/web/src/lib/i18n.ts` — inicializa `i18next` + `initReactI18next` con `baseResources` y `DEFAULT_LOCALE`; `LOCALE_KEY = 'webs-locale'` (cookie); `lng = getCookie() ?? 'es'`, `fallbackLng: 'en'`. Exporta `RemoteI18nPayload`, `applyRemoteResources(payload)` (`addResourceBundle` por locale/namespace) y `setLocale(locale)` (`setCookie` 365 días + `changeLanguage`).
- `apps/web/src/lib/locale-store.ts` — store Zustand `LocaleState { catalog, enabled: ['es'], defaultLocale: 'es', ready }` + `useLocaleStore`.
- `apps/web/src/main.tsx` — renderiza `<App />` (no hay bootstrap de locales adicional aquí).

### 2.5 Infraestructura en `apps/api`

- `apps/api/src/modules/i18n/routes.ts` — `GET /public/locales → { locales: AVAILABLE_LOCALES }`; `GET /public/i18n → { locales, defaultLocale, resources }`.
- `apps/api/src/modules/i18n/service.ts` — `getEnabledLocales()` lee `prisma.setting` clave `'localization'` (`{ languages?: string[], defaultLocale? }`, default `['es']`); `getDefaultLocale()` default `'es'`; `buildResources()` fusiona `baseResources` + sobrescrituras de la tabla `Translation` (`namespace || 'translation'`) + traducciones de plugins (`pluginRegistry.getTranslations()`, namespace = id del plugin).
- `apps/api/src/modules/translations/routes.ts` — CRUD completo de la tabla `Translation` (`GET/POST/PUT/DELETE /translations*`), más `GET /locales` y `GET /translations/keys` (claves base por idioma).
- UI de administración: `apps/web/src/features/translations/TranslationsPage.tsx` (edición de traducciones).
- `Translation` (Prisma): `{ id, locale, namespace ("translation"), key, value }`, único `[locale, namespace, key]`.

## 3. Discrepancias y bugs detectados

### 3.1 Paridad de claves en los locales base (P1)

1. **`lang.pt` ausente en `es.ts` y `en.ts`.** Solo `pt.ts:71` define `lang.pt = 'Português'`. `es.ts`/`en.ts` definen únicamente `lang.label`, `lang.en`, `lang.es`. Consecuencia: en ES/EN, el selector de idioma no puede rotular "Portugués". → **Agregar `lang.pt` en `es.ts` (`'Portugués'`) y `en.ts` (`'Portuguese'`)**.
2. **`app.tagline` de `pt.ts:4` sigue en español.** `pt.ts` tiene `app.tagline: 'Plataforma web modular'` (debería ser portugués, p. ej. "Plataforma web modular"). → **Traducir el tagline de `pt`**.

> Nota: los tres locales tienen conjuntos de claves por lo demás simétricos; no se detectaron claves faltantes adicionales.

### 3.2 Desincronización con la documentación existente

`docs/architecture/i18n.md` y `docs/guides/idiomas.md` describen un estado **anterior** al actual (solo `es`/`en`, `SUPPORTED_LOCALES = ['es','en']`, persistencia en `localStorage` en vez de cookie, y fusión del admin "no cableada"). El código actual ya soporta `pt`, usa cookie `webs-locale`, y expone `GET /public/i18n` con la fusión base+admin+plugins. → **Actualizar esas dos páginas** como parte de la tarea de implementación i18n (fuera del alcance de esta auditoría, que es solo de diagnóstico).

### 3.3 Nombres/estado técnico menor

- `apps/api/src/modules/i18n/service.ts:66` — variable `blockLocale` (nombre obsoleto post-rename Bloques→Plugins; sin impacto funcional). → Renombrar a `pluginLocale` en la implementación.
- `buildResources` usa `t.namespace || 'translation'` (ok) y `namespace` del plugin = `pluginId`.

## 4. Inventario de cadenas hardcodeadas en el frontend (`apps/web`)

Método: `grep` de literales con acentos españoles `[áéíóúñ¿¡ÁÉÍÓÚÑ]` en `*.tsx`/`*.ts`, más `grep` de atributos `label=`/`placeholder=`/`title=`/`aria-label=`. Resultado: **~580** coincidencias con acentos y **~278** atributos, frente a **~796** usos de `t()`/`useTranslation`/`i18n.t`.

### 4.1 Archivos correctamente internacionalizados (usan `t()`)

- `apps/web/src/components/layout/SiteFooter.tsx`
- `apps/web/src/components/layout/SiteHeader.tsx` (menú; **salvo** botones sueltos — ver §4.3)
- `apps/web/src/layouts/AdminLayout.tsx` (items del menú vía `t()`; **salvo** botones sueltos)
- `apps/web/src/features/appearance/AppearancePage.tsx`
- `apps/web/src/features/audit/AuditPage.tsx`

### 4.2 Archivos parcialmente internacionalizados (mezclan `t()` y literales)

- `apps/web/src/features/account/AccountPage.tsx`
- `apps/web/src/features/analytics/AnalyticsPage.tsx`
- `apps/web/src/layouts/AdminLayout.tsx` y `SiteHeader.tsx` (ver §4.3)

### 4.3 Archivos con cadenas hardcodeadas (sin o casi sin `t()`)

Lista no exhaustiva de archivos `apps/web/src/features/**` y componentes con texto español literal:

- **Auth / onboarding:** `LoginPage.tsx`, `VerifyEmailPage.tsx`, `ResetPasswordPage.tsx`, `SetupTwoFactorPage.tsx`, `SetupWizard.tsx`, `ActivationKeyField.tsx`, `ApiTokensPage.tsx`, `AuthConfigPage.tsx`.
- **Comercio / pagos / dashboards:** `UserDashboardPage.tsx`, `StorePage.tsx`, `PaymentsPage.tsx`, `StaffDashboard.tsx`, `BranchesPage.tsx`, `CommercePage.tsx`, `InventoryPage.tsx`, `InvoicesPage.tsx`.
- **Contenido / sitio:** `ContentPage.tsx`, `PagesPage.tsx`, `MenuEditorPage.tsx`, `RolesPage.tsx`, `SettingsPage.tsx`, `FormsPage.tsx`, `SchemaForm.tsx`, `RichTextEditor.tsx` (títulos del toolbar), `EmailPage.tsx`, `ChatPage.tsx`, `CalendarPage.tsx` (incluye `WEEKDAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']`), `BlogListPage.tsx`, `SocialPublicPage.tsx`, `SocialDirect.tsx`, `ClassesPage.tsx`, `PublicHome`/`PublicPage`.
- **Plugins / licencia / actualización:** `PluginSlot.tsx`, `ScopeSwitcher.tsx`, `Changelog.tsx`, `LicensePage.tsx`, `FeatureList.tsx`, `FingerprintNotice.tsx`, `LicenseStatus.tsx`, `UpdateStatus.tsx`.
- **Componentes compartidos:** `SupportWidget.tsx`, `ErrorPage.tsx` (mapa `COPY` 400/404/500), `BarcodeScanner.tsx`, `CameraScanner.tsx`, `StepIndicator.tsx`, `ConfirmDialog.tsx`, `PromptDialog.tsx`, `QrCode.tsx`, `TranslationsPage.tsx`, `SupportPage.tsx`.

### 4.4 Patrones concretos de hardcodeo

- Labels de spinners: `"Cargando…"`, `"Cargando calendario…"`.
- Botones sueltos en archivos que **sí** usan `t()`: `"Eliminar"`, `"Cerrar"`, `"Colapsar menú"` (en `AdminLayout.tsx` / `SiteHeader.tsx`).
- Arrays de días/semana y estados hardcodeados (`CalendarPage.tsx`).
- Mensajes de error/copia de páginas de estado (`ErrorPage.tsx`).

## 5. Cadenas hardcodeadas en la API (`apps/api`)

`grep` de acentos en `*.ts`: **~653** coincidencias. Desglose:

- **Comentarios de código** (no son cadenas de UI; no requieren traducción, pero conviene unificar idioma a futuro).
- **Errores lanzados al usuario** (sí son cadenas de cara al usuario y deben i18n-izarse), por ejemplo:
  - `apps/api/src/plugins/auth.ts`: `'Token inválido o expirado'`, `'Token inválido'`, `'API token inválido o revocado'`, `'Límite de peticiones del API token excedido'`.
  - `apps/api/src/lib/rate-limiter.ts` y `plugins/rate-limit.ts`: `'Demasiadas peticiones desde esta IP, intentá más tarde'`.
  - `apps/api/src/plugins/loader.ts`: `` `Plugin '${pluginId}' no disponible en el catálogo` ``, `'El plugin ya está instalado'`, `'El plugin no está instalado'`, errores de verificación de integridad/firma (`'Verificación de integridad fallida (sha256)'`, `'Verificación de firma Ed25519 fallida'`, etc.).
  - `apps/api/src/modules/expenses.ts`: `'Gasto inválido'`, `'Se requiere una organización activa para registrar gastos'`.
  - `apps/api/src/lib/tenant.ts`: `'No se pudo resolver la organización activa'`.
- **Plantillas de email** (hardcodeadas en español, en `apps/api/src/modules/email/seed.ts`):
  - `verify-email`: subject `'Verificá tu correo — {{ site.name }}'`, body HTML en español.
  - `reset-password`: subject `'Restablecé tu contraseña — {{ site.name }}'`.
  - `welcome`: subject `'¡Bienvenido a {{ site.name }}!'`.
  - Además `apps/api/src/modules/email/render.ts` y `service.ts` contienen texto español de las plantillas renderizadas.

> El backend **ya puede** usar la misma instancia `createI18n()` para correos/notificaciones (según `docs/architecture/i18n.md`), pero las plantillas sembradas están en español fijo.

## 6. Set de idiomas objetivo

| Nivel | Idiomas | Estado |
|---|---|---|
| **Mínimo (obligatorio)** | `es` + `en` + `pt` | Ya presentes, con 2 bugs de paridad (§3.1) y adopción parcial en frontend. |
| **Ideal** | `+ fr`, `+ de`, `+ it` | No existen aún; agregar archivos `fr.ts`, `de.ts`, `it.ts` + entradas en `AVAILABLE_LOCALES`. |

Decisión propuesta: **consolidar primero `es`/`en`/`pt`** (corregir paridad + migrar todas las cadenas hardcodeadas del frontend al sistema `t()`), y **después** añadir `fr`/`de`/`it` replicando la misma estructura de claves.

## 7. Plan de migración (para la tarea de implementación i18n)

El plan se divide en fases; **ninguna se ejecuta en esta auditoría**.

### Fase 0 — Corrección de paridad y deuda menor (rápida, bajo riesgo)
1. Agregar `lang.pt` a `es.ts` y `en.ts`.
2. Traducir `app.tagline` en `pt.ts`.
3. Renombrar `blockLocale` → `pluginLocale` en `apps/api/src/modules/i18n/service.ts:66`.
4. Actualizar `docs/architecture/i18n.md` y `docs/guides/idiomas.md` para reflejar `pt`, cookie `webs-locale` y la fusión admin/plugins ya operativa.

### Fase 1 — Frontend: migrar literales a `t()` (núcleo del trabajo)
1. Establecer el **patrón canónico**: importar `useTranslation()` y reemplazar cada literal por `t('clave')`, añadiendo las claves nuevas a los 3 locales.
2. Priorizar las **superficies públicas y de alto tráfico**: login/registro/2FA, checkout/pago, dashboards de usuario y trabajadores, tienda.
3. Migrar componentes compartidos de uso transversal: `ErrorPage`, `ConfirmDialog`, `PromptDialog`, `StepIndicator`, `BarcodeScanner`, `Spinner`/labels de carga, y los botones sueltos de `AdminLayout`/`SiteHeader`.
4. Migrar páginas de administración por módulo (blog, social, chat, calendar, forms, commerce, inventory, invoices, analytics, notifications, organizations, account, plugins/licencia/actualización).
5. Reemplazar arrays localizados (`WEEKDAYS`) por claves o por `Intl.DateTimeFormat` con el locale activo.

### Fase 2 — API: errores y plantillas de email
1. Migrar los **errores lanzados al usuario** a claves de traducción (o, como mínimo, resolver por locale del request).
2. Internacionalizar las **plantillas de email** (`email/seed.ts`): sembrar variantes por locale o parametrizar subject/body desde i18next con el locale del destinatario.

### Fase 3 — Ampliación a `fr`/`de`/`it`
1. Crear `fr.ts`, `de.ts`, `it.ts` replicando el conjunto completo de claves.
2. Agregar las entradas a `AVAILABLE_LOCALES` / `SUPPORTED_LOCALES` / `baseResources`.
3. Revisar cobertura con un check de paridad de claves (idealmente automatizado en CI).

### Fase 4 — Verificación y CI
1. Añadir una **verificación de paridad de claves** entre locales (script que compare `Object.keys()` de cada locale y falle si difieren), integrada a los workflows de CI.
2. Añadir un **lint/check de cadenas hardcodeadas** (p. ej. prohibir literales con acentos en JSX salvo lista blanca) para evitar regresiones.
3. Verificación final: `pnpm typecheck`, `pnpm -r lint`, `pnpm build` en verde.

## 8. Fuera de alcance de esta auditoría

- No se modificó código ni locales (solo se entrega este documento).
- La edición de `docs/architecture/i18n.md` y `docs/guides/idiomas.md` queda pendiente para la fase de implementación (se documenta la discrepancia en §3.2).
- No se auditaron aquí las cadenas de `apps/mobile` / Capacitor (no formaban parte del alcance solicitado `packages/i18n`, `apps/web`, `apps/api`).
