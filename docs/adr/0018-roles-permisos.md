# ADR-0018: Modelo completo de permisos y roles (catálogo canónico + edición desde UI)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 5 — v2.3.0)
- **Decisión:** Consolidar un **catálogo canónico de permisos** (agrupado por dominio) como única fuente
  de verdad, integrar los permisos que registran los plugins en ese mismo catálogo, y exponerlo por la
  API para que la **UI de roles** permita crear/editar roles con **todas** las claves disponibles
  (`plugin.*`, `license.*`, `organization.*`, `content.*`, `membership.*`, etc.), manteniendo los roles
  de sistema como de solo lectura.

## Contexto

Hoy los permisos viven en tres lugares que no convergen del todo:

1. **`packages/core/src/constants.ts`** (`Permission`, ~43 claves): la lista «base» con convención
   `<recurso>.<accion>` (`user.read`, `plugin.read`, `license.manage`, `organization.manage`,
   `membership.manage`, `content.publish`, `billing.write`, `sales.manage`, `inventory.read`, …).
   Incluye aliases `@deprecated` `BlockRead`/`BlockManage` → `plugin.*`.
2. **`apps/api/prisma/seed.ts`** (`PERMISSIONS`, ~43 entradas): siembra esas claves en
   `prisma.permission` y define **9 roles** (`super_admin`, `admin`, `editor`, `user`, `entrenador`,
   `contador`, `cajero`, `soporte`, `recepcionista`).
3. **Permisos de plugins**: `registerPluginPermissions` (`apps/api/src/plugins/loader.ts:213`) hace
   `upsert` de `manifest.permissions` en `prisma.permission` al instalar/cargar un plugin. Estas claves
   aparecen en `GET /permissions` pero **no** están en `@webs/core` `Permission` (no hay referencia en
   tiempo de compilación, ni descripción/agrupación canónica).

El endpoint de lectura (`apps/api/src/modules/roles/routes.ts`, `GET /permissions`) devuelve una **lista
plana** `{ key, description }` de todo `prisma.permission`. La UI de roles consume esa lista plana, sin
agrupación por dominio; y `manager`/`guest` están declarados en `SystemRole` pero **no** se siembran.

El objetivo M5 es que **crear/editar roles desde la UI** refleje **todas** las claves de permiso de la
plataforma (base + plugins), agrupadas por dominio, con una única fuente de verdad.

## Decisión

### 1. Catálogo canónico de permisos

- Nuevo módulo `packages/core/src/permissions.ts` que exporta `PERMISSION_CATALOG: PermissionDefinition[]`
  con `PermissionDefinition { key, description, area }`, donde `area` es uno de:

  `users` · `roles` · `settings` · `plugins` · `license` · `content` · `i18n` · `theme` · `seo` ·
  `media` · `audit` · `email` · `apiTokens` · `organization` · `membership` · `inventory` · `billing` ·
  `support` · `marketing` · `analytics` · `hr` · `sales` · `academy` · `reports`.

- El `Permission` actual de `constants.ts` se **deriva** de `PERMISSION_CATALOG` (o se conserva como
  `as const` congelado para retrocompat) de modo que haya **una sola** fuente de claves base; los
  aliases `@deprecated` (`BlockRead`/`BlockManage`) se mantienen con sus valores `plugin.*`.

### 2. Integración de permisos de plugins

- El manifiesto `plugin.json` puede declarar `permissions` como `string[]` (compat) o como
  `{ key, description?, area? }[]`. `registerPluginPermissions` registra la clave **y** la descripción/
  área (si el plugin no declara `area`, se asigna `area: 'plugins'` por defecto).
- El catálogo efectivo = `PERMISSION_CATALOG` (base) **∪** permisos registrados por plugins instalados.
  No se duplica la clave: la base gana.

### 3. Endpoint enriquecido

- `GET /api/v1/roles/permissions` (antes `GET /permissions`) devuelve el catálogo **agrupado**:

  ```json
  {
    "areas": [
      { "area": "plugins", "permissions": [
        { "key": "plugin.read", "description": "Ver plugins" },
        { "key": "plugin.manage", "description": "Instalar/desinstalar plugins" }
      ] },
      { "area": "license", "permissions": [ /* license.read, license.manage */ ] }
    ]
  }
  ```

  Se conserva una variante plana (`?format=flat`) por compatibilidad con clientes existentes. La UI de
  roles consume la forma agrupada.

### 4. UI de roles

- La pantalla de roles (crear/editar) agrupa los permisos por `area` con checkboxes; el cuerpo `POST/PATCH
  /roles` sigue enviando `permissions: string[]` (claves). Los roles de sistema (`system: true`) son de
  solo lectura: solo se permite **renombrar**, nunca cambiar sus permisos (ya lo fuerza `routes.ts:106`).

### 5. Convención y roles

- Convención de claves: `<recurso>.<accion>` con `accion ∈ { read, write, publish, manage, send, invite,
  export, moderate }`. Recurso raíz = área.
- `super_admin` es el rol raíz (no eliminable, `system: true`, todas las claves). `manager` y `guest`
  declarados en `SystemRole` se documentan como **no sembrados** (reservados); no se crean roles
  fantasma.

## Consecuencias

### Positivas

- **Una sola fuente de verdad** de claves base (migrable a `PERMISSION_CATALOG`), con agrupación por
  dominio para la UI.
- **Permisos de plugins visibles y agrupados** en el editor de roles (antes aparecían planos y sin
  contexto).
- Cierre del gap: crear/editar roles cubre **todas** las claves (`plugin.*`, `license.*`,
  `organization.*`, `content.*`, `membership.*`, …).

### Negativas

- Migración de consumidores de `Permission` (módulos y plugins que importan la constante) al catálogo
  derivado; hay que mantener los alias para no romper.
- El seed debe backfillear `area`/descripción de las claves existentes y los plugins deben (opcionalmente)
  declarar `area` en sus manifiestos para agruparse bien.
- Si un plugin se desinstala, sus permisos quedan huérfanos en `prisma.permission` (no se borran en
  cascada hoy); se documenta como limpieza opcional.

## Notas

- Rutas y serialización actual: `apps/api/src/modules/roles/routes.ts` (`GET /permissions`,
  `GET/POST/PATCH/DELETE /roles`, `serializeRole` → `permissions: string[]`).
- Semillas: `apps/api/prisma/seed.ts` (9 roles, `ALL_PERMISSION_KEYS` para super_admin/admin).
- Registro de permisos de plugins: `apps/api/src/plugins/loader.ts:213` (`registerPluginPermissions`).
- `SystemRole`/`Permission` en `packages/core/src/constants.ts:18-128`.
