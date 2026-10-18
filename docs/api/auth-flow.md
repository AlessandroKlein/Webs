# Flujo de autenticación

Este documento describe el flujo completo de autenticación de la API de Webs:
login, registro, refresco de tokens, cierre de sesión y la diferencia entre
autenticarse desde la **web** y desde una **app móvil / API de terceros**.

## Conceptos clave

| Concepto       | Duración  | Transporte                                                        | Almacenamiento                  |
| -------------- | --------- | ----------------------------------------------------------------- | ------------------------------- |
| Access token   | 15 min    | Cabecera `Authorization: Bearer <token>`                          | Memoria (web) / almacenamiento seguro (móvil) |
| Refresh token  | 30 días   | Cookie `httpOnly` (web) o body (móvil)                            | Cookie httpOnly (web) / secure storage (móvil) |

- El **access token** es un JWT firmado con `JWT_SECRET`. Su *payload*
  (`sub`, `email`, `permissions`) lo emite `signAccessToken` en
  `apps/api/src/modules/auth/service.ts`.
- El **refresh token** **no es un JWT**: es un valor aleatorio (48 bytes en
  hex). La API almacena en la base de datos únicamente su hash SHA-256
  (`Session.refreshToken`), junto con `expiresAt`, `revokedAt`, `userAgent` e
  `ip`.
- La cookie se llama `webs_refresh_token` (constante `REFRESH_TOKEN_COOKIE` en
  `@webs/core`).

---

## 1. Login

**Request**

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"changeme"}'
```

**Response (`200 OK`)**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "9f2c...<96 caracteres hex>...",
  "user": {
    "id": "0192...",
    "email": "admin@example.com",
    "displayName": "Super Admin",
    "avatarUrl": null,
    "locale": "es",
    "active": true
  }
}
```

Además, la respuesta incluye una cabecera `Set-Cookie`:

```
Set-Cookie: webs_refresh_token=<refreshToken>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax
```

> En producción (`NODE_ENV=production`) la cookie incluye `Secure`.

**Qué hace la API** (`apps/api/src/modules/auth/service.ts`):

1. Busca el usuario por `email` y verifica que `active` sea `true`.
2. Compara la contraseña con `bcrypt.compare` contra `passwordHash`.
3. Resuelve los permisos efectivos desde sus roles.
4. Firma el access token y crea una `Session` (hash del refresh token).

**Errores habituales**

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Correo o contraseña inválidos", "requestId": "req-1" } }
```

---

## 2. Registro

**Request**

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"nuevo@example.com","password":"una-clave-larga","displayName":"Nuevo Usuario"}'
```

**Response (`201 Created`)**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "a1b2...",
  "user": {
    "id": "0192...",
    "email": "nuevo@example.com",
    "displayName": "Nuevo Usuario",
    "avatarUrl": null,
    "locale": "es",
    "active": true
  }
}
```

**Reglas:**

- `email` y `password` son obligatorios; `password` debe tener al menos 8
  caracteres. `displayName` es opcional.
- Si el email ya existe, devuelve `409` con `code: "CONFLICT"`.
- Al nuevo usuario se le asigna automáticamente el rol **`user`**.
- El registro inicia sesión automáticamente (devuelve access + refresh token).

---

## 3. Uso del access token

Los endpoints protegidos requieren:

```bash
curl http://localhost:4000/api/v1/auth/me \
  -H 'Authorization: Bearer <accessToken>'
```

**Response (`200 OK`)**

```json
{
  "user": {
    "id": "0192...",
    "email": "admin@example.com",
    "displayName": "Super Admin",
    "avatarUrl": null,
    "locale": "es",
    "active": true
  },
  "permissions": ["user.read", "user.write", "role.read", "..." ]
}
```

Si el token es inválido o expiró:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Token de acceso inválido o expirado", "requestId": "req-3" } }
```

---

## 4. Refresh (rotación de tokens)

Cuando el access token caduca (15 min), se obtiene uno nuevo con el refresh
token. **El refresh token rota**: la API revoca la sesión actual y emite una
nueva.

**Request (vía body)**

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken-actual>"}'
```

**Request (vía cookie, como hace la web)**

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -b 'webs_refresh_token=<refreshToken-actual>'
```

La API acepta el token **o bien en el body** (`refreshToken`) **o bien en la
cookie**. Si no hay ninguno:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Sin sesión", "requestId": "req-4" } }
```

**Response (`200 OK`)**

```json
{
  "accessToken": "eyJhbGciOi...<NUEVO>",
  "refreshToken": "<NUEVO refresh token>",
  "user": { "id": "0192...", "email": "admin@example.com", "displayName": "Super Admin", "avatarUrl": null, "locale": "es", "active": true }
}
```

**Rotación (importante):**

1. La API busca la `Session` por `hash(refreshToken)`.
2. Valida que no esté revocada ni expirada.
3. Marca la sesión actual como `revokedAt = now()`.
4. Crea una **nueva** sesión y devuelve un **nuevo** refresh token.

Por lo tanto, el refresh token anterior queda **inservible** después del primer
uso. Los clientes deben reemplazar siempre el token guardado por el devuelto.

---

## 5. Logout

**Request**

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

**Response (`200 OK`)**

```json
{ "ok": true }
```

La API revoca la sesión (marca `revokedAt`) y, en la web, limpia la cookie con
`clearCookie`. El logout es **idempotente** y no exige autenticación.

---

## 6. Web vs. app móvil

### Web (navegador)

La app web (React) usa el patrón *access token en memoria + refresh token en
cookie httpOnly*:

- `apps/web/src/lib/token.ts` mantiene el access token **solo en memoria**
  (no se persiste en `localStorage`).
- El refresh token viaja en la cookie `httpOnly`, por lo que **no es accesible
  desde JavaScript** (mitiga XSS).
- `apps/web/src/lib/api.ts` adjunta `credentials: 'include'` en cada fetch y,
  ante un `401`, intenta `POST /api/v1/auth/refresh` una vez y reintenta.

```ts
// apps/web/src/lib/api.ts (resumen)
const res = await fetch(`${BASE_URL}${path}`, {
  ...options,
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
});
if (res.status === 401) {
  const refreshed = await tryRefresh(); // POST /api/v1/auth/refresh (cookie)
  if (refreshed) res = await doFetch(getAccessToken());
}
```

### App móvil / API de terceros

Sin cookies gestionadas por un navegador, el cliente:

1. Guarda el **refresh token** en un almacenamiento seguro del sistema
   (Keychain en iOS, Keystore/EncryptedSharedPreferences en Android). **Nunca**
   en `localStorage`/preferencias planas.
2. Guarda el **access token** en memoria (y opcionalmente en el mismo
   almacenamiento seguro si necesita sobrevivir reinicios).
3. Envía el refresh token **en el body** de `/auth/refresh` (no depende de
   cookies).
4. Reemplaza ambos tokens tras cada refresh (rotación).

```bash
# Renovar desde una app móvil
curl -X POST https://api.example.com/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'
```

> La API **también** devuelve el refresh token en el body de
> login/register/refresh precisamente para soportar clientes no-browser.
> Ver [`docs/guides/mobile-app.md`](../guides/mobile-app.md).

---

## Resumen del ciclo

```text
┌──────────┐  POST /auth/login (email, password)          ┌──────────┐
│  Cliente │ ──────────────────────────────────────────► │    API   │
│          │  ◄── 200 { accessToken, refreshToken, user }│          │
│          │                                             │          │
│          │  GET /auth/me  (Authorization: Bearer)      │          │
│          │ ──────────────────────────────────────────► │          │
│          │  ◄── 200 { user, permissions }              │          │
│          │                                             │          │
│          │  [access token expira a los 15 min]          │          │
│          │  POST /auth/refresh (refreshToken/cookie)    │          │
│          │ ──────────────────────────────────────────► │          │
│          │  ◄── 200 { accessToken(NUEVO), refreshToken(NUEVO) } │
│          │                                             │          │
│          │  POST /auth/logout (refreshToken)            │          │
│          │ ──────────────────────────────────────────► │          │
│          │  ◄── 200 { ok: true }                       │          │
└──────────┘                                             └──────────┘
```

## Ver también

- [`docs/api/overview.md`](./overview.md) — convenciones generales de la API.
- [`docs/api/websocket.md`](./websocket.md) — autenticación del WebSocket.
- [`docs/guides/roles-permisos.md`](../guides/roles-permisos.md) — permisos.
