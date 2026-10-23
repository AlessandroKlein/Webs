# Autenticación y RBAC

## Resumen

Webs usa un esquema de **doble token**:

- **Access token**: JWT de corta vida (**15 minutos**) que lleva en su payload los permisos
  efectivos del usuario. Se envía en la cabecera `Authorization: Bearer <token>` y se guarda
  **solo en memoria** en el frontend (no se persiste).
- **Refresh token**: valor **opaco** (no es JWT) de **30 días**, generado con
  `randomBytes(48)`, almacenado en BD **hasheado** (SHA-256) y entregado al cliente **por
  cookie `httpOnly` y también en el body** de login/refresh/register.

## Tokens

Definiciones en `apps/api/src/modules/auth/service.ts`:

```ts
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;                 // 15 minutos
export const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;    // 30 días

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- El **access token** se firma con `fastify.jwt.sign(...)` usando `JWT_SECRET`
  (`apps/api/src/plugins/auth.ts`):

```ts
fastify.jwt.sign(
  { sub: profile.id, email: profile.email, permissions: profile.permissions },
  { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
);
```

- El **refresh token** nunca viaja firmado: la BD guarda `sha256(refreshToken)` en
  `Session.refreshToken` (único). En cada uso se busca por ese hash.

Payloads tipados (`apps/api/src/types/auth.ts`):

```ts
export interface AccessTokenPayload {
  sub: string;          // id de usuario
  email: string;
  permissions: string[]; // permisos efectivos al emitir el token
}
```

## Modelo de sesión (Prisma)

```prisma
model Session {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(...)
  refreshToken String    @unique     // sha256(token)
  userAgent    String?
  ip           String?
  expiresAt    DateTime
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?
  @@index([userId])
}
```

La sesión registra `userAgent` e `ip` (auditoría) y se puede revocar (`revokedAt`).

## Flujo de login

`POST /api/v1/auth/login` (`apps/api/src/modules/auth/routes.ts` + `service.ts`):

```text
1. login(email, password)
   ├─ buscar User por email; 401 si no existe o !active
   ├─ bcrypt.compare(password, passwordHash); 401 si no coincide
   └─ findUserWithPermissions(user.id) → UserProfile (con permisos efectivos)
2. accessToken = signAccessToken(profile)          // JWT 15 min
3. refreshToken = createSession(userId, {ua, ip})  // opaco, hasheado en BD
4. setRefreshCookie(reply, refreshToken)           // httpOnly
5. audit(action: 'auth.login')
6. 200 { accessToken, refreshToken, user }
```

La cookie (`REFRESH_TOKEN_COOKIE = "webs_refresh_token"`, definida en `@webs/core`):

```ts
reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
  httpOnly: true,
  sameSite: 'lax',
  secure: fastify.config.NODE_ENV === 'production',
  path: '/',
  maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
});
```

## Flujo de refresh (con rotación)

`POST /api/v1/auth/refresh` — el refresh token puede venir del **body**
(`{ refreshToken }`) o de la **cookie**; tiene prioridad el body:

```ts
const token = request.body?.refreshToken ?? request.cookies[REFRESH_TOKEN_COOKIE];
```

`refreshSession()` (`service.ts`):

```text
1. session = Session.findUnique({ refreshToken: sha256(rawToken) })
2. 401 si !session || session.revokedAt || session.expiresAt < now
3. profile = findUserWithPermissions(session.userId); 401 si !profile || !active
4. ROTACIÓN: Session.update({ revokedAt: now })   // revoca la actual
5. newToken = createSession(...)                   // emite una nueva
6. devuelve { accessToken, refreshToken: newToken, user }
```

Esto implementa **rotación de refresh token**: cada refresh invalida el anterior y emite
uno nuevo, mitigando el robo/replay.

## Flujo de logout

`POST /api/v1/auth/logout`:

```ts
await revokeSession(fastify, token ?? '');   // marca revokedAt
reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
return { ok: true };
```

`revokeSession` usa `updateMany` por el hash del token (el token puede estar ausente en
clientes que no guardan cookie).

## Registro de usuario

`POST /api/v1/auth/register` — hashea la contraseña (`bcrypt.hash(..., 10)`), crea el
`User` y le asigna el rol `user` si existe. Devuelve los mismos tokens que el login.

## RBAC: roles y permisos

### Modelo

```prisma
model Role           { id, key @unique, name, description?, system, permissions RolePermission[], userRoles UserRole[] }
model Permission     { id, key @unique, description?, rolePermissions RolePermission[] }
model RolePermission { roleId, permissionId  @@id([roleId, permissionId]) }
model UserRole       { userId, roleId        @@id([userId, roleId]) }
```

La relación es **muchos-a-muchos** en ambos lados: un usuario tiene varios roles y un rol
tiene varios permisos.

### Roles del sistema

Definidos en `@webs/core` (`packages/core/src/constants.ts`) y sembrados en
`apps/api/prisma/seed.ts`:

| Rol (`key`) | `system` | Permisos sembrados | Notas |
|-------------|----------|--------------------|-------|
| `super_admin` | `true` | **Todos** los permisos base. | Rol raíz, no eliminable. |
| `admin` | `true` | Todos menos los que empiezan por `role.`. | Administración operativa. |
| `editor` | `true` | `content.*`, `media.*`, `plugin.read`, `theme.read`, `seo.read`, `translation.read`. | Gestión de contenido. |
| `user` | `true` | `content.read`. | Rol básico de usuario final. |

> `@webs/core` también declara `manager` y `guest` en la constante `SystemRole`, pero el
> seed actual solo crea los cuatro roles anteriores. Ver discrepancias.

### Convención de permisos

Los permisos siguen la convención **`<recurso>.<accion>`**. Los base están en
`@webs/core` (`Permission`) y en el seed:

```text
user.read        user.write
role.read        role.write
setting.read     setting.write
plugin.read       plugin.manage
content.read     content.write     content.publish
translation.read translation.write
theme.read       theme.write
seo.read         seo.write
media.read       media.write
audit.read
```

### Resolución de permisos efectivos

`findUserWithPermissions()` (`apps/api/src/lib/user.ts`) carga el usuario con
`roles → role → permissions → permission` y aplana las claves a un **Set** (deduplicado):

```ts
const permissions = [
  ...new Set(
    user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
  ),
];
```

El `UserProfile` resultante incluye `permissions: string[]`. Estos permisos se inyectan
en el payload del access token, de modo que la autorización no consulta la BD en cada
petición.

### Enforcement en Fastify

`apps/api/src/plugins/auth.ts` decora la instancia con dos preHandlers:

```ts
fastify.decorate('authenticate', async (request) => {
  await request.jwtVerify();            // 401 si no hay token válido
});

fastify.decorate('authorize', (permission: string) => {
  return async (request) => {
    const perms = request.user?.permissions ?? [];
    if (!perms.includes(permission)) {
      throw new ForbiddenError(`Se requiere el permiso '${permission}'`);
    }
  };
});
```

Uso típico en rutas:

```ts
fastify.get('/users', {
  preHandler: [fastify.authenticate, fastify.authorize('user.read')],
  // ...
});
```

### Gestión de roles desde la UI

`apps/api/src/modules/roles/routes.ts`:

- `GET /permissions` — lista todos los permisos (`role.read`).
- `GET /roles` — paginado (`role.read`).
- `POST /roles` — crea un rol (valida `key` con `^[a-z0-9][a-z0-9_]*$`) y enlaza permisos.
- `PATCH /roles/:id` — renombra/describe y reemplaza permisos. **Los roles `system` no
  pueden cambiar sus permisos** (solo renombrar).
- `DELETE /roles/:id` — **no se puede eliminar un rol `system`**.

### Gestión de usuarios

`apps/api/src/modules/users/service.ts` — `syncRoles()` reemplaza los roles del usuario
de forma transaccional; por defecto un usuario nuevo recibe `['user']`.

### Los plugins declaran permisos

Un plugin lista claves de permiso en `manifest.permissions`; el loader las persiste en la
tabla `Permission` vía `registerPluginPermissions()` (ver `docs/architecture/plugin-system.md`).
Luego pueden asignarse a roles.

## Discrepancias observadas

1. **`JWT_REFRESH_SECRET` está definido pero no se usa.** Está en `apps/api/src/config/env.ts`
   y en los `.env.example`, pero el refresh token es opaco y se almacena hasheado en BD;
   no se firma con ese secreto. El `RefreshTokenPayload` de `apps/api/src/types/auth.ts`
   lo describe como «JWT de larga vida», lo cual no coincide con la implementación real
   (token opaco).
2. **`manager` y `guest`** existen en `SystemRole` (`@webs/core`) pero no se siembran ni se
   referencian en ningún módulo.
