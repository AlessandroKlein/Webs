# Roles y permisos

El sistema de autorización de Webs es **basado en roles (RBAC)**: un usuario
tiene uno o más roles, y cada rol agrupa un conjunto de **permisos**. Desde
M5 (ADR-0018) existe un **catálogo canónico de permisos** que expone **todas**
las claves de la plataforma (incluidos los permisos de plugins) para crear y
editar roles desde la UI.

---

## Catálogo canónico de permisos

El catálogo vive en `packages/core/src/permissions.ts` (`PERMISSION_CATALOG`):
**46 claves base** agrupadas en **24 dominios** (`area`). Coincide 1:1 con la
constante `Permission` de `packages/core/src/constants.ts` y con el seed.

| Área (`area`) | Permisos |
|---------------|----------|
| `users` | `user.read`, `user.write`, `user.invite` |
| `roles` | `role.read`, `role.write` |
| `settings` | `setting.read`, `setting.write` |
| `plugins` | `plugin.read`, `plugin.manage` |
| `license` | `license.read`, `license.manage` |
| `content` | `content.read`, `content.write`, `content.publish`, `content.moderate` |
| `i18n` | `translation.read`, `translation.write` |
| `theme` | `theme.read`, `theme.write` |
| `seo` | `seo.read`, `seo.write` |
| `media` | `media.read`, `media.write` |
| `audit` | `audit.read`, `audit.export` |
| `email` | `email.read`, `email.write`, `email.send` |
| `apiTokens` | `apiToken.read`, `apiToken.write` |
| `organization` | `organization.manage` |
| `membership` | `membership.manage`, `attendance.manage` |
| `inventory` | `inventory.read`, `inventory.manage` |
| `billing` | `billing.read`, `billing.write`, `refund.manage` |
| `support` | `support.read`, `support.manage` |
| `marketing` | `marketing.manage` |
| `analytics` | `analytics.read` |
| `hr` | `hr.manage` |
| `sales` | `sales.manage` |
| `academy` | `course.manage` |
| `reports` | `report.export` |

### Permisos de plugins

Los plugins pueden registrar permisos adicionales vía su manifiesto
(`manifest.permissions`). En runtime se **unen al catálogo** con
`groupPermissionCatalog(extra)`: la base gana ante colisiones de clave y los
permisos de plugins sin área conocida caen en el área `plugins`.

---

## Convención de nombres de permisos

Los permisos siguen la convención **`<recurso>.<acción>`**:

| Acción      | Significado                                         |
| ----------- | --------------------------------------------------- |
| `.read`     | Leer/ver el recurso                                 |
| `.write`    | Crear/editar (gestionar) el recurso                 |
| `.manage`   | Operaciones especiales (instalar, publicar, etc.)   |
| `.publish`  | Publicar (caso particular de contenido)             |

> Los permisos del sistema de plugins son `plugin.read`/`plugin.manage`; los
> alias `@deprecated` `BlockRead`/`BlockManage` se conservan por
> retrocompatibilidad (ver `docs/architecture/plugin-system.md`).

---

## Roles de sistema

El seed crea **nueve roles de sistema** (`system: true`):

| Clave           | Nombre           | Qué puede hacer |
| --------------- | ---------------- | ------------------------------------------------------------------ |
| `super_admin`   | Super Admin      | **Acceso total.** Todos los permisos. Rol raíz, no eliminable. |
| `admin`         | Administrador    | Todos los permisos **excepto** `role.*` (no gestiona roles). |
| `editor`        | Editor           | Contenido y medios: `content.*`, `media.*`, `plugin.read`, `theme.read`, `seo.read`, `translation.read`. |
| `user`          | Usuario          | Rol básico de usuario final: solo `content.read`. |
| `entrenador`    | Entrenador       | Perfil de entrenador (asistencia, contenidos de academia). |
| `contador`      | Contador         | Facturación, pagos y reportes (sin gestión de roles). |
| `cajero`        | Cajero           | Ventas, caja y pagos POS. |
| `soporte`       | Soporte          | Tickets de soporte y usuarios. |
| `recepcionista` | Recepcionista    | Asistencia y membresías. |

---

## Cómo se resuelven los permisos efectivos

1. Un usuario tiene roles (tabla `user_roles`).
2. Cada rol tiene permisos (tabla `role_permissions`).
3. Los permisos efectivos del usuario son la **unión (sin duplicados)** de los
   permisos de todos sus roles (`apps/api/src/lib/user.ts`,
   `findUserWithPermissions`).
4. El JWT de acceso lleva estos permisos en su *payload*; `fastify.authorize`
   comprueba que la lista incluya el permiso requerido.

---

## Listar el catálogo de permisos

`GET /api/v1/permissions` devuelve el catálogo **agrupado por área** por
defecto, y la variante plana con `?format=flat` (retrocompat con la UI actual).

**Agrupado (por defecto):**

```bash
curl http://localhost:4000/api/v1/permissions \
  -H 'Authorization: Bearer <accessToken>'
```

```json
{
  "areas": [
    { "area": "users", "permissions": [
      { "key": "user.read", "description": "Ver usuarios" },
      { "key": "user.write", "description": "Crear/editar usuarios" }
    ]},
    { "area": "plugins", "permissions": [
      { "key": "plugin.read", "description": "Ver plugins" },
      { "key": "plugin.manage", "description": "Instalar/desinstalar plugins" },
      { "key": "store.admin", "description": "Permiso de plugin" }
    ]}
  ]
}
```

**Plano (retrocompat):**

```bash
curl 'http://localhost:4000/api/v1/permissions?format=flat' \
  -H 'Authorization: Bearer <accessToken>'
```

```json
[
  { "key": "content.read", "description": "Ver contenido" },
  { "key": "content.write", "description": "Crear/editar contenido" }
]
```

> La ruta se mantiene en `/api/v1/permissions` (no `/roles/permissions`) para
> no romper el consumidor frontend; el cambio es **aditivo** (agrupado por
> defecto + flat opcional).

---

## Crear un rol y asignar permisos

Se puede hacer desde la UI (**Roles y permisos**, `/roles`) o vía API.

**Ejemplo vía API:**

1. Crear el rol:

   ```bash
   curl -X POST http://localhost:4000/api/v1/roles \
     -H 'Authorization: Bearer <accessToken>' \
     -H 'Content-Type: application/json' \
     -d '{
       "key": "content_manager",
       "name": "Gestor de contenido",
       "description": "Crea y publica contenido",
       "permissions": ["content.read", "content.write", "content.publish"]
     }'
   ```

   Restricciones de `key`: regex `^[a-z0-9][a-z0-9_]*$` (minúsculas, números,
   guion bajo; sin espacios).

2. Asignar el rol a un usuario (al crearlo o actualizarlo):

   ```bash
   curl -X PATCH http://localhost:4000/api/v1/users/<userId> \
     -H 'Authorization: Bearer <accessToken>' \
     -H 'Content-Type: application/json' \
     -d '{ "roles": ["content_manager"] }'
   ```

   > El campo `roles` de un usuario es una lista de **claves de rol** y
   > reemplaza la asignación anterior (`syncRoles`).

---

## Reglas sobre roles de sistema

- Los roles con `system: true` **no se pueden eliminar**
  (`DELETE /roles/:id` → `403 FORBIDDEN`).
- Sus **permisos no se pueden modificar**
  (`PATCH /roles/:id` con `permissions` → `403 FORBIDDEN`); solo se permite
  renombrar/cambiar la descripción.

---

## Convenciones recomendadas para permisos de plugins

Si tu plugin necesita permisos propios, seguí la misma convención:

```json
// plugin.json
{ "permissions": ["store.admin", "store.read"] }
```

- Prefijá con el `id` del plugin (`store.*`) para evitar colisiones.
- Usá acciones semánticas (`read`, `write`, `manage`).
- El permiso se registrará automáticamente (`registerPluginPermissions`) y
  aparecerá en el catálogo agrupado bajo el área `plugins`.

---

## Ver también

- [`docs/adr/0018-roles-permisos.md`](../adr/0018-roles-permisos.md) — decisión completa del catálogo.
- [`docs/api/overview.md`](../api/overview.md) — endpoints de `roles` y `permissions`.
- [`docs/guides/crear-un-plugin.md`](./crear-un-plugin.md) — permisos de plugins.
