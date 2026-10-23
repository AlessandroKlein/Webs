# Categorización del menú de administración (`/admin`)

> **Spec de taxonomía y criterio de clasificación** para agrupar los ítems del
> panel de administración en secciones (Apariencia, Configuración, Contenido,
> Integraciones, etc.). Define el contrato de metadatos para que el frontend
> (`apps/web/src/layouts/AdminLayout.tsx`) y el backend (`GET /api/v1/menu` +
> manifiestos de plugins) trabajen en paralelo.

## Objetivo

Hoy el menú de `/admin` es una **lista plana** de tres fuentes concatenadas sin
agrupación visual:

- `coreNav` (21 ítems fijos, `apps/web/src/layouts/AdminLayout.tsx:87-109`).
- `featureNav` (12 ítems de módulos core, `:112-125`).
- `pluginNav` (ítems declarados por plugins instalados, vía `GET /menu` →
  `collectPluginMenuItems('admin')`, con `id`, `section`, `icon`, `order`,
  `parent`, `permissions`).

El objetivo es agruparlos en **secciones** con orden estable y **un criterio de
clasificación explícito**, reutilizando el campo `section` que ya existe en
`AdminMenuItem` y en el tipo `PluginMenuItem` del SDK
(`packages/plugin-sdk/src/manifest.ts`).

## Taxonomía de secciones

| `key` | Sección (es) | Sección (en) | Criterio de clasificación |
|-------|--------------|--------------|---------------------------|
| `panel` | Panel | Dashboard | Métricas y visión global del negocio (KPIs, actividad). |
| `contenido` | Contenido | Content | Creación y edición de contenido visible del sitio (páginas, entradas, formularios). |
| `ventas` | Ventas | Sales | Operación comercial: catálogo, cobros, facturación, inventario, caja (POS). |
| `comunicacion` | Comunicación | Communication | Canales de mensajería y atención (email, notificaciones, chat, soporte). |
| `comunidad` | Comunidad | Community | Interacción social y agenda (red social, calendario/reservas). |
| `apariencia` | Apariencia | Appearance | Aspecto visual e idiomático del sitio (tema, traducciones, menú público). |
| `integraciones` | Integraciones | Integrations | Conexión con terceros y plugins: marketplace, pasarelas, almacenamiento, API, automatizaciones. |
| `configuracion` | Configuración | Settings | Parámetros del sistema y de la organización (ajustes, plantillas, sucursales, licencia, actualizaciones). |
| `usuarios` | Usuarios y seguridad | Users & security | Identidad, permisos y auditoría (usuarios, roles, registro de auditoría). |

## Clasificación de los ítems actuales

### Ítems core (`coreNav` + `featureNav`)

| Ítem (`to`) | Permiso | Sección |
|-------------|---------|---------|
| `/admin` | — | `panel` |
| `/admin/analytics` | — | `panel` |
| `/admin/content` | `content.read` | `contenido` |
| `/admin/pages` | `content.read` | `contenido` |
| `/admin/editor` | `content.write` | `contenido` |
| `/admin/blog` | — | `contenido` |
| `/admin/forms` | — | `contenido` |
| `/admin/payments` | `user.read` | `ventas` |
| `/admin/commerce` | — | `ventas` |
| `/admin/invoices` | — | `ventas` |
| `/admin/inventory` | — | `ventas` |
| `/admin/email` | `email.read` | `comunicacion` |
| `/admin/notifications` | — | `comunicacion` |
| `/admin/chat` | — | `comunicacion` |
| `/admin/support` | `support.read` | `comunicacion` |
| `/admin/social` | — | `comunidad` |
| `/admin/calendar` | — | `comunidad` |
| `/admin/appearance` | `theme.read` | `apariencia` |
| `/admin/translations` | `translation.read` | `apariencia` |
| `/admin/menu` | `setting.read` | `apariencia` |
| `/admin/plugins` | `plugin.read` | `integraciones` |
| `/admin/plugin-settings` | `plugin.read` | `integraciones` |
| `/admin/api-tokens` | — | `integraciones` |
| `/admin/auth` | — | `integraciones` |
| `/admin/settings` | `setting.read` | `configuracion` |
| `/admin/templates` | `setting.write` | `configuracion` |
| `/admin/branches` | — | `configuracion` |
| `/admin/organizations` | — | `configuracion` |
| `/admin/updates` | `setting.read` | `configuracion` |
| `/admin/license` | `license.read` | `configuracion` |
| `/admin/users` | `user.read` | `usuarios` |
| `/admin/roles` | `role.read` | `usuarios` |
| `/admin/audit` | `audit.read` | `usuarios` |

## Clasificación de plugins (ítems nativos al menú)

Un ítem de menú declarado por un plugin (`manifest.menu[]`) se clasifica en
este orden de precedencia:

1. **`menu[].section` explícito** (valor = una `key` de la taxonomía) — es la
   fuente canónica y gana sobre cualquier otra.
2. **Mapeo desde `manifest.category`** (campo ya existente en `plugin.json`,
   p. ej. `"category": "negocio"`), según esta tabla de correspondencia:

   | `manifest.category` | Sección |
   |---------------------|---------|
   | `negocio`, `ventas`, `ecommerce`, `facturacion`, `inventario`, `pos` | `ventas` |
   | `contenido`, `blog`, `formularios`, `seo`, `paginas` | `contenido` |
   | `comunicacion`, `email`, `chat`, `notificaciones`, `soporte` | `comunicacion` |
   | `social`, `comunidad`, `calendario`, `reservas`, `academia` | `comunidad` |
   | `integracion`, `pagos`, `envios`, `almacenamiento`, `automatizaciones`, `marketing` | `integraciones` |
   | `configuracion`, `licencias`, `actualizaciones`, `organizaciones` | `configuracion` |
   | `apariencia`, `idiomas`, `temas` | `apariencia` |
   | `usuarios`, `seguridad`, `roles`, `auditoria` | `usuarios` |
   | *(otro / ausente)* | `integraciones` |

3. **Default** `integraciones` cuando no hay `section` ni `category` reconocible.

> Ejemplo: el plugin `facturacion` declara `"category": "negocio"` y un
> `menu[]` con `path: "/admin/invoices"`; se clasifica en **Ventas**. Si un
> plugin quiere forzar otra sección, añade `"section": "comunicacion"` a su
> ítem de `menu[]`.

## Contrato de metadatos

- `AdminMenuItem` (`apps/web/src/layouts/AdminLayout.tsx:15-24`) ya define
  `section?: string`, `icon?: string`, `parent?: string`, `order?: number`,
  `permissions?: string[]`.
- `GET /api/v1/menu` (admin) devuelve `{ items: [...] }` fusionando ítems core
  (`prisma.menu` clave `main`) e ítems de plugins. Para la agrupación, el
  backend **añade `section`** a cada ítem (los core con su mapeo fijo, los de
  plugin según la precedencia anterior), de modo que el frontend solo agrupa por
  `section` sin lógica de clasificación duplicada.
- El frontend (`AdminLayout`) agrupa `items` por `section` en el orden de la
  taxonomía, ordena dentro de cada sección por `order` (default 0), filtra por
  `permissions` (ítem visible si el usuario posee todos los permisos) y omite
  secciones vacías.

## Criterio de clasificación (resumen de reglas)

1. **Un ítem pertenece a exactamente una sección** (clasificación primaria; no
   hay ítems duplicados en dos secciones).
2. La sección se decide por **función principal** del ítem, no por su permiso
   (el permiso solo controla visibilidad, no ubicación).
3. Los ítems de **plugins** usan `menu[].section` > `manifest.category` >
   default `integraciones`.
4. La taxonomía es **extensible**: un plugin puede introducir una sección nueva
   con su `key`, que el frontend renderiza al final (o según orden declarado).

## Consecuencias

- Menú `/admin` agrupado y navegable; ítems de plugins aparecen como nativos
  dentro de su sección (sin categoría «Plugins» separada), alineado con ADR-0005.
- Backend y frontend pueden desarrollarse en paralelo contra el contrato
  `AdminMenuItem.section` + `GET /menu`.
- La clasificación por `manifest.category` es retrocompatible (no rompe plugins
  existentes que ya declaran `category`).
