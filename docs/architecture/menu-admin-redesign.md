# Rediseño del menú de administración `/admin` (spec)

Spec del rediseño de la fuente de datos del menú admin. Objetivo: **una única fuente de
verdad** para los ítems del menú (núcleo + plugins), servida por la API, con deduplicación y
orden/permissions coherentes.

## 1. Problema actual (dos fuentes de verdad divergentes)

Hoy el menú `/admin` se arma con **dos mecanismos independientes**:

1. **Ítems core hardcodeados en el frontend** — `apps/web/src/layouts/AdminLayout.tsx:132-155`
   (`navItems`, 22 ítems con `section`/`perm`/`feature`). El frontend los renderiza directo;
   la API no participa en su definición.
2. **Ítems de plugins vía `GET /menu`** — `apps/api/src/modules/menu/routes.ts` devuelve
   `{ items: [...coreItems, ...collectPluginMenuItems('admin')] }`, donde `coreItems` sale de
   `prisma.menu.findUnique({ where: { key: 'main' } })`.

Consecuencias observadas:

- `prisma.menu` clave `main` **nunca se siembra** (`apps/api/prisma/seed.ts` no crea la fila
  `main`), así que `coreItems` es `[]` y el backend solo sirve items de plugin.
- El frontend **descarta** `coreItems` (filtra `item.id !== ''`, AdminLayout.tsx:162) y usa
  su propio `navItems` hardcodeado. La edición por `PUT /menu` (que escribe la clave `main`)
  **no afecta** a los ítems core visibles.
- La deduplicación se hace **en el cliente** (`corePaths` set, AdminLayout.tsx:159,165),
  no en el servidor.

Resultado: no hay forma coherente de reordenar/editar el menú core desde la UI, y los
mismos ítems están definidos dos veces (frontend + tabla `menu` sin usar).

## 2. Estado objetivo

Una sola fuente: `GET /api/v1/menu` devuelve el menú completo (core + plugins), y el
frontend lo renderiza tal cual, sin `navItems` hardcodeado.

### 2.1 Respuesta canónica

Cada item lleva un campo `source` para distinguir origen:

```json
{
  "items": [
    { "id": null, "source": "core", "label": "Panel", "path": "/admin", "section": "panel", "order": 1, "feature": "core", "permissions": [] },
    { "id": "chat", "source": "plugin", "label": "Chat", "path": "/admin/chat", "section": "comunicacion", "order": 3, "feature": "core", "permissions": [] }
  ]
}
```

- `source: 'core'` → ítem del núcleo, persiste en `prisma.menu` clave `main` (editable por
  `PUT /menu`).
- `source: 'plugin'` → ítem declarado por un plugin instalado (`manifest.menu`), efímero
  (desaparece al desinstalar).

### 2.2 Deduplicación en el servidor

El merge en `apps/api/src/modules/menu/routes.ts`:

1. Carga `coreItems` de `prisma.menu` clave `main` (normalizados con `normalizeItems`).
2. Calcula `corePaths = new Set(coreItems.map(i => i.path))`.
3. `collectPluginMenuItems('admin')` **descarta** todo ítem cuyo `path` ya esté en
   `corePaths` (un plugin no puede pisar un path core).
4. Devuelve `[...coreItems, ...pluginItems]`, ambos con `source` y ordenados.

Así el frontend elimina su set `corePaths` (la defensa pasa al servidor) y deja de
necesitar el filtro `item.id !== ''` (usa `source`).

### 2.3 Orden y sección coherentes

- **Orden**: `order` ascendente dentro de cada sección; los ítems core conservan su orden
  sembrado, los plugins el suyo (default `0`), resuelto por `resolveSection` en
  `apps/api/src/lib/plugin-menu.ts`.
- **Sección**: `section` explícito > `CATEGORY_TO_SECTION[manifest.category]` >
  `DEFAULT_SECTION='integraciones'`. El frontend agrupa por `SectionKey` (9 secciones),
  ya tipadas en AdminLayout.tsx:30-39.
- **Feature**: `resolveItemFeature` = `item.feature ?? manifest.feature ?? 'core'`; el
  frontend solo oculta vía `hasFeature(feature)` (fail-open si no hay permiso
  `license.read`).

### 2.4 Permissions coherentes

- Los ítems core llevan su `perm` en la fila sembrada (`content.read`, `setting.read`,
  `plugin.read`, `generated.read`, `support.read`, etc.).
- Los ítems de plugin declaran `permissions` en `manifest.menu[].permissions` (o heredan
  vacío = visible para quien tenga acceso al panel).
- El frontend filtra por `hasPermission` (ítem) y `hasFeature` (ítem). El backend no filtra
  por permiso (el menú es público dentro del panel y el filtrado fino es de UI), salvo el
  gate `setting.read` del endpoint en sí.

## 3. Estado de implementación (M8)

Implementado en `apps/api` (t115):

1. **Seed** — `apps/api/prisma/seed.ts:95-125` define `CORE_MENU_ITEMS` (22 ítems core,
   espejo de `AdminLayout.tsx` `navItems`): `label` = **clave i18n** (`nav.dashboard`,
   `nav.content`, …), `path`, `section`, `order` 1-22, `feature` (`core` | `generator` para
   `/admin/generated`) y `permissions`. Se siembra con
   `prisma.menu.upsert({ where: { key: 'main' }, ... })` (líneas 307-308).
2. **API** — `apps/api/src/modules/menu/routes.ts` (132 líneas):
   - `normalizeItems` preserva `section`/`feature`/`permissions` (antes los descartaba).
   - `AdminMenuItem` = `MenuItem` + `{ id: null para core, source: 'core'|'plugin' }`.
   - `sortByOrder` (estable) y `buildAdminMenu(coreRaw, pluginItems)` **puro**: core con
     `feature ?? 'core'` / `permissions ?? []`, plugins filtrados por
     `!corePaths.has(path)` (dedup server-side, el core gana) y `source: 'plugin'`.
   - `GET /menu` devuelve `{ items: buildAdminMenu(menu?.items, collectPluginMenuItems('admin')) }`.
3. **Convención de `label`**: el ítem core guarda la **clave i18n** (`nav.dashboard`) porque
   `AdminLayout` resuelve con `t(label)`; los plugins guardan un `LocalizedString` y el
   backend resuelve `es`→`en`→primero (`resolveLabel` en `lib/plugin-menu.ts`).

**Pendiente (deuda menor)**: el frontend (`apps/web/src/layouts/AdminLayout.tsx`) todavía
mantiene su `navItems` hardcodeado y el filtro `item.id !== ''`; no consume `menuData.items`
como única fuente. El backend ya sirve la fuente canónica completa (core + plugins con
`source` y dedup), así que la migración del frontend es mecánica (eliminar `navItems`,
renderizar `menuData.items`, quitar `corePaths`).

## 4. Verificación

- `scripts/test-menu.ts` (smoke M8): 12/12 checks — `GET /menu` devuelve los 22 core +
  items de plugin, sin duplicados por `path`; `buildAdminMenu` marca `source` core/plugin;
  `normalizeItems` descarta ítems con `label`/`path` vacíos y preserva
  `section`/`feature`/`permissions`; dedup server-side (core gana).
- `PUT /menu` reescribe la clave `main` y `GET /menu` la refleja (normalización aplicada).
- typecheck/lint/build `@webs/api` en verde.
