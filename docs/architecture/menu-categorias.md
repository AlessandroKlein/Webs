# Categorización del menú de administración (`/admin`)

> **Spec de taxonomía y criterio de clasificación** para agrupar los ítems del
> panel de administración en secciones (Apariencia, Configuración, Contenido,
> Integraciones, etc.). Define el contrato de metadatos para que el frontend
> (`apps/web/src/layouts/AdminLayout.tsx`) y el backend (`GET /api/v1/menu` +
> manifiestos de plugins) trabajen en paralelo.

## Objetivo

Hoy el menú de `/admin` ya está **agrupado por secciones** con submenús e iconos.
El frontend (`apps/web/src/layouts/AdminLayout.tsx`) declara una lista única
`navItems` de **37 ítems core** (líneas 251-297) y le suma los ítems declarados
por plugins instalados (vía `GET /api/v1/menu`, con `id`, `section`, `icon`,
`order`, `parent`, `permissions`). `buildTree` anida los ítems por `parent`
(submenús) y `iconClass` normaliza los iconos a bootstrap-icons (`bi bi-*`);
además hay búsqueda con `/` y drawer móvil.

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

### Ítems core (`navItems`, 37 ítems)

| Ítem (`to`) | Permiso | Sección | Icono | Padre (submenú) |
|-------------|---------|---------|-------|-----------------|
| `/admin` | — | `panel` | — | — |
| `/admin/analytics` | — | `panel` | `graph-up` | — |
| `/admin/content` | `content.read` | `contenido` | `collection` | — |
| `/admin/pages` | `content.read` | `contenido` | `file-earmark-text` | — |
| `/admin/editor` | `content.write` | `contenido` | `pencil-square` | — |
| `/admin/blog` | — | `contenido` | `journal-text` | — |
| `/admin/forms` | — | `contenido` | `input-cursor-text` | — |
| `/admin/payments` | `user.read` | `ventas` | `credit-card` | — |
| `/admin/commerce` | — | `ventas` | `bag` | — |
| `/admin/invoices` | — | `ventas` | `receipt` | — |
| `/admin/invoices/template` | — | `ventas` | `layout-text-window-reverse` | `/admin/invoices` |
| `/admin/inventory` | — | `ventas` | `box-seam` | — |
| `/admin/email` | `email.read` | `comunicacion` | `envelope` | — |
| `/admin/notifications` | — | `comunicacion` | `bell` | — |
| `/admin/support` | `support.read` | `comunicacion` | `headset` | — |
| `/admin/social` | — | `comunidad` | `people` | — |
| `/admin/calendar` | — | `comunidad` | `calendar3` | — |
| `/admin/appearance` | `theme.read` | `apariencia` | `palette` | — |
| `/admin/translations` | `translation.read` | `apariencia` | `translate` | — |
| `/admin/menu` | `setting.read` | `apariencia` | `list-nested` | — |
| `/admin/plugins` | `plugin.read` | `integraciones` | `puzzle` | — |
| `/admin/generated` | `generated.read` | `integraciones` | `lightning` | — |
| `/admin/invernadero` | `iot.read` | `integraciones` | `flower1` | — |
| `/admin/sema` | `iot.read` | `integraciones` | `broadcast` | — |
| `/admin/api-tokens` | — | `integraciones` | `key` | — |
| `/admin/auth` | — | `integraciones` | `shield-lock` | — |
| `/admin/settings` | `setting.read` | `configuracion` | `gear` | — |
| `/admin/templates` | `setting.write` | `configuracion` | `files` | — |
| `/admin/branches` | — | `configuracion` | `diagram-3` | — |
| `/admin/organizations` | — | `configuracion` | `building` | — |
| `/admin/updates` | `setting.read` | `configuracion` | `arrow-repeat` | — |
| `/admin/scaling` | `scaling.read` | `configuracion` | `hdd-stack` | — |
| `/admin/license` | `license.read` | `configuracion` | `patch-check` | — |
| `/admin/license/keys` | `license.read` | `configuracion` | `key-fill` | `/admin/license` |
| `/admin/users` | `user.read` | `usuarios` | `person` | — |
| `/admin/roles` | `role.read` | `usuarios` | `person-badge` | `/admin/users` |
| `/admin/audit` | `audit.read` | `usuarios` | `shield-check` | — |

Submenús: `invoices → template`, `license → keys`, `users → roles`. El ítem
`/admin/generated` está gateado por `feature: generator` (t97); los ítems con
`feature` premium se ocultan sin la licencia correspondiente. `PLUGIN_MANAGEMENT_PATHS`
(`/admin/plugins`) se oculta cuando no hay plugins instalados.

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
