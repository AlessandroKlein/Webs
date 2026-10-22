# Roles y permisos

El sistema de autorización de Webs es **basado en roles (RBAC)**: un usuario
tiene uno o más roles, y cada rol agrupa un conjunto de **permisos**.

---

## Convención de nombres de permisos

Los permisos siguen la convención **`<recurso>.<acción>`**:

| Acción        | Significado                                      |
| ------------- | ------------------------------------------------ |
| `.read`       | Leer/ver el recurso                              |
| `.write`      | Crear/editar (gestionar) el recurso              |
| `.manage`     | Operaciones especiales (instalar, publicar, etc.) |
| `.publish`    | Publicar (caso particular de contenido)          |

Ejemplos: `user.read`, `user.write`, `role.read`, `block.manage`,
`content.publish`, `translation.write`.

> Los permisos se definen en `packages/core/src/constants.ts` (constante
> `Permission`) y se siembran en `apps/api/prisma/seed.ts`. Los plugins pueden
> registrar permisos adicionales vía su manifiesto (`manifest.permissions`).
> Los permisos internos del sistema de plugins conservan el prefijo `block.*`
> de forma transitoria (ver `docs/architecture/plugin-system.md`).

---

## Permisos base

El seed crea estos 20 permisos:

| Dominio      | Permisos                                                  |
| ------------ | --------------------------------------------------------- |
| Usuarios     | `user.read`, `user.write`                                  |
| Roles        | `role.read`, `role.write`                                  |
| Ajustes      | `setting.read`, `setting.write`                            |
| Plugins      | `block.read`, `block.manage`                               |
| Contenido    | `content.read`, `content.write`, `content.publish`         |
| Traducciones | `translation.read`, `translation.write`                    |
| Tema         | `theme.read`, `theme.write`                                |
| SEO          | `seo.read`, `seo.write`                                    |
| Medios       | `media.read`, `media.write`                                |
| Auditoría    | `audit.read`                                               |

> Nota: los permisos `theme.*` y `seo.*` están declarados en el catálogo para
> el gating de UI futuro, pero las rutas de ajustes actuales (`/settings/*`)
> se protegen con `setting.read`/`setting.write`. Los permisos `media.*` están
> definidos aunque el módulo de medios (tabla `Media`) aún no expone rutas.

---

## Roles por defecto

El seed crea cuatro roles **de sistema** (`system: true`):

| Clave         | Nombre                 | Qué puede hacer                                                                 |
| ------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `super_admin` | Super Administrador    | **Acceso total.** Todos los permisos. Rol raíz, no eliminable.                  |
| `admin`       | Administrador          | Administración operativa: todos los permisos **excepto** `role.*` (no gestiona roles). |
| `editor`      | Editor                 | Contenido y medios: `content.*`, `media.*`, `block.read`, `theme.read`, `seo.read`, `translation.read`. |
| `user`        | Usuario                | Rol básico de usuario final: solo `content.read`.                               |

Desglose exacto (desde `apps/api/prisma/seed.ts`):

| Rol           | Permisos                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `super_admin` | Todos (`user.*`, `role.*`, `setting.*`, `block.*`, `content.*`, `translation.*`, `theme.*`, `seo.*`, `media.*`, `audit.*`). |
| `admin`       | Todos **excepto** `role.read` y `role.write`.                                                     |
| `editor`      | `content.read`, `content.write`, `content.publish`, `media.read`, `media.write`, `block.read`, `theme.read`, `seo.read`, `translation.read`. |
| `user`        | `content.read`.                                                                                   |

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

## Crear un rol y asignar permisos

Se puede hacer desde la UI (**Roles y permisos**, `/roles`) o vía API.

**Ejemplo vía API:**

1. Listar permisos disponibles:

   ```bash
   curl http://localhost:4000/api/v1/permissions \
     -H 'Authorization: Bearer <accessToken>'
   ```

   ```json
   [
     { "key": "content.read", "description": "Ver contenido" },
     { "key": "content.write", "description": "Crear/editar contenido" }
   ]
   ```

2. Crear el rol:

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

3. Asignar el rol a un usuario (al crearlo o actualizarlo):

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

---

## Ver también

- [`docs/api/overview.md`](../api/overview.md) — endpoints de `roles` y `permissions`.
- [`docs/guides/crear-un-plugin.md`](./crear-un-plugin.md) — permisos de plugins.
