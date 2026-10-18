# API REST — Resumen y convenciones

La plataforma **Webs** expone una API REST (HTTP/JSON) construida con
[Fastify](https://fastify.dev/). Este documento describe las convenciones
transversales y lista todos los endpoints, agrupados por módulo.

## Tabla de contenidos

- [Base URL y prefijo](#base-url-y-prefijo)
- [Autenticación](#autenticación)
- [Formato de error](#formato-de-error)
- [Paginación](#paginación)
- [Documentación interactiva (Swagger)](#documentación-interactiva-swagger)
- [Health / readiness](#health--readiness)
- [Endpoints por módulo](#endpoints-por-módulo)
  - [auth](#auth)
  - [users](#users)
  - [roles](#roles)
  - [settings](#settings)
  - [blocks](#blocks)
  - [content](#content)
  - [translations](#translations)
  - [audit](#audit)

---

## Base URL y prefijo

Todas las rutas de negocio viven bajo el prefijo **`/api/v1`** (constante
`API_PREFIX` en `packages/core`). Las rutas de infraestructura (health,
Swagger UI y WebSocket) quedan en la raíz, **sin** prefijo:

| Ruta          | Prefijo       | Descripción                          |
| ------------- | ------------- | ------------------------------------ |
| `/api/v1/*`   | `API_PREFIX`  | Endpoints REST de negocio            |
| `/health`     | —             | Liveness (sin autenticación)         |
| `/health/ready` | —           | Readiness (verifica la base de datos) |
| `/docs`       | —             | Swagger UI                           |
| `/ws`         | —             | WebSocket (ver `docs/api/websocket.md`) |

En desarrollo, el frontend (Vite en `http://localhost:5173`) proxea `/api` y
`/ws` hacia `http://localhost:4000`, por lo que las peticiones del navegador
pueden usar rutas relativas (`/api/v1/...`).

---

## Autenticación

Los endpoints protegidos exigen un **token de acceso** (JWT) en la cabecera
estándar:

```
Authorization: Bearer <accessToken>
```

El token de acceso caduca a los **15 minutos**. Para renovarlo se usa un
**refresh token** de larga duración (30 días) que viaja, según el cliente:

- **Web**: en una cookie `httpOnly` llamada `webs_refresh_token`.
- **Móvil / API**: en el cuerpo de la respuesta de login/register/refresh y
  reenviado explícitamente en el body de `/auth/refresh`.

Ver [`docs/api/auth-flow.md`](./auth-flow.md) para el flujo completo.

Los permisos se resuelven desde los roles del usuario y se validan por
endpoint mediante `fastify.authorize('<permiso>')`. La lista completa de
permisos y la convención de nombres está en
[`docs/guides/roles-permisos.md`](../guides/roles-permisos.md).

---

## Formato de error

Todo error se devuelve con un cuerpo consistente:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Correo o contraseña inválidos",
    "requestId": "req-1"
  }
}
```

| Campo        | Tipo       | Descripción                                                       |
| ------------ | ---------- | ----------------------------------------------------------------- |
| `code`       | `string`   | Código de error estable y versionado (ver tabla).                 |
| `message`    | `string`   | Mensaje legible (en el idioma del servidor).                      |
| `details`    | `array`    | *(opcional)* Detalle estructurado, típicamente de validación.     |
| `requestId`  | `string`   | Identificador de la petición (para correlacionar con los logs).   |

**Regla importante:** los clientes no deben parsear `message`; deben actuar
según `code`, que es estable. Códigos definidos en `packages/core`
(`ErrorCode`):

| `code`                | HTTP | Significado                              |
| --------------------- | ---- | ---------------------------------------- |
| `BAD_REQUEST`         | 400  | Petición mal formada                     |
| `UNAUTHORIZED`        | 401  | Falta token o credenciales inválidas     |
| `FORBIDDEN`           | 403  | Autenticado pero sin el permiso requerido |
| `NOT_FOUND`           | 404  | Recurso inexistente                      |
| `CONFLICT`            | 409  | Conflicto (ej. email o slug duplicado)   |
| `VALIDATION_ERROR`    | 422  | Error de validación de negocio           |
| `RATE_LIMITED`        | 429  | Límite de peticiones superado            |
| `PAYLOAD_TOO_LARGE`   | 413  | Cuerpo demasiado grande                  |
| `INTERNAL_ERROR`      | 500  | Error inesperado (mensaje genérico)      |
| `NOT_IMPLEMENTED`     | 501  | No implementado                          |
| `SERVICE_UNAVAILABLE` | 503  | Servicio no disponible                   |

> Nota: los errores de validación del *schema* de Fastify (body/query/params)
> devuelven `400` con `code: "VALIDATION_ERROR"`, mientras que los errores de
> validación de negocio (lanzados con `ValidationError`) devuelven `422`.

Ejemplo con `details` (validación):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Valor de ajustes inválido",
    "details": [
      { "field": "primaryColor", "message": "must match format \"color\"" }
    ],
    "requestId": "req-2"
  }
}
```

---

## Paginación

Los endpoints que devuelven listas aceptan los parámetros de *query*:

| Parámetro  | Tipo      | Default | Descripción                    |
| ---------- | --------- | ------- | ------------------------------ |
| `page`     | `integer` | `0`     | Índice de página **basado en 0** |
| `pageSize` | `integer` | `20`    | Tamaño de página (máx. `100`)  |

Y devuelven el envoltorio estándar:

```json
{
  "items": [ /* ... */ ],
  "total": 42,
  "page": 0,
  "pageSize": 20,
  "totalPages": 3
}
```

| Campo        | Tipo      | Descripción                                  |
| ------------ | --------- | -------------------------------------------- |
| `items`      | `array`   | Elementos de la página actual                |
| `total`      | `integer` | Total de elementos que coinciden con el filtro |
| `page`       | `integer` | Índice de página (0-based)                   |
| `pageSize`   | `integer` | Tamaño de página aplicado                    |
| `totalPages` | `integer` | Total de páginas (`0` cuando `total` es 0)   |

> ⚠️ La paginación es **0-indexed**: la primera página es `page=0`, no `1`.

---

## Documentación interactiva (Swagger)

La OpenAPI auto-generada y la Swagger UI están disponibles en:

- **Swagger UI**: [`http://localhost:4000/docs`](http://localhost:4000/docs)
- **Spec OpenAPI**: `/docs/json` (generada por `@fastify/swagger`)

Los *tags* documentados son: `auth`, `users`, `roles`, `settings`, `blocks`,
`content`, `translations`, `audit` y `health`.

---

## Health / readiness

| Método | Ruta           | Auth | Descripción                                            |
| ------ | -------------- | ---- | ------------------------------------------------------ |
| GET    | `/health`      | no   | Liveness: `{ "status": "ok", "uptime": <segundos> }`   |
| GET    | `/health/ready`| no   | Readiness: ejecuta `SELECT 1`; `503` si la BD no responde |

---

## Endpoints por módulo

Todas las rutas de esta sección están bajo **`/api/v1`**.

### auth

| Método | Ruta            | Permiso | Descripción                                                              |
| ------ | --------------- | ------- | ------------------------------------------------------------------------ |
| POST   | `/auth/login`   | público | Inicia sesión. Body: `{ email, password }`. Devuelve `accessToken`, `refreshToken` y `user`. |
| POST   | `/auth/register`| público | Registra un usuario (rol `user`). Body: `{ email, password, displayName? }`. Devuelve `201`. |
| POST   | `/auth/refresh` | público | Renueva el access token. Acepta `refreshToken` en el body o la cookie.   |
| POST   | `/auth/logout`  | público | Revoca la sesión y limpia la cookie. Body opcional: `{ refreshToken }`.  |
| GET    | `/auth/me`      | autenticado | Perfil del usuario autenticado y sus permisos efectivos.                  |

### users

| Método | Ruta          | Permiso      | Descripción                                                        |
| ------ | ------------- | ------------ | ------------------------------------------------------------------ |
| GET    | `/users`      | `user.read`  | Lista usuarios (paginado). Filtro opcional `q` (busca por email).  |
| POST   | `/users`      | `user.write` | Crea un usuario. Body: `{ email, password, displayName?, locale?, roles? }`. |
| GET    | `/users/:id`  | `user.read`  | Obtiene un usuario por id.                                          |
| PATCH  | `/users/:id`  | `user.write` | Actualiza un usuario. Body parcial (email, password, displayName, locale, active, roles). |
| DELETE | `/users/:id`  | `user.write` | Elimina un usuario. Devuelve `204`.                                 |

### roles

| Método | Ruta             | Permiso      | Descripción                                                  |
| ------ | ---------------- | ------------ | ------------------------------------------------------------ |
| GET    | `/permissions`   | `role.read`  | Lista todos los permisos registrados (`{ key, description }`). |
| GET    | `/roles`         | `role.read`  | Lista roles (paginado).                                       |
| POST   | `/roles`         | `role.write` | Crea un rol. Body: `{ key, name, description?, permissions? }`. |
| PATCH  | `/roles/:id`     | `role.write` | Actualiza un rol (nombre, descripción y/o permisos).          |
| DELETE | `/roles/:id`     | `role.write` | Elimina un rol no-de-sistema. Devuelve `204`.                 |

> Los roles de sistema (`system: true`) no se pueden eliminar y sus permisos
> no se pueden modificar.

### settings

| Método | Ruta             | Permiso        | Descripción                                            |
| ------ | ---------------- | -------------- | ------------------------------------------------------ |
| GET    | `/settings`      | `setting.read` | Lista todas las secciones con su esquema, defaults y valor actual. |
| GET    | `/settings/:key` | `setting.read` | Obtiene una sección por clave (ej. `site`, `appearance`). |
| PUT    | `/settings/:key` | `setting.write`| Reemplaza el valor de una sección (validado contra su JSON Schema). |

Secciones base: `site`, `appearance`, `seo`, `legal`, `contact`, `social`
(ver `apps/api/src/modules/settings/sections.ts`).

### blocks

| Método | Ruta                      | Permiso         | Descripción                                                         |
| ------ | ------------------------- | --------------- | ------------------------------------------------------------------- |
| GET    | `/blocks`                 | `block.read`    | Instalaciones (`installed`) y catálogo (`catalog`).                 |
| POST   | `/blocks/install`         | `block.manage`  | Instala un bloque. Body: `{ id }`.                                  |
| POST   | `/blocks/:id/activate`    | `block.manage`  | Activa un bloque instalado.                                          |
| POST   | `/blocks/:id/deactivate`  | `block.manage`  | Desactiva un bloque instalado.                                       |
| DELETE | `/blocks/:id`             | `block.manage`  | Desinstala un bloque. Devuelve `204`.                                |
| GET    | `/blocks/:id/settings`    | `setting.read`  | Devuelve el esquema y el valor de configuración del bloque.          |
| PUT    | `/blocks/:id/settings`    | `setting.write` | Guarda la configuración del bloque (validada contra su `settings`). |
| GET    | `/slots`                  | `block.read`    | Lista los slots (regiones) disponibles.                              |
| GET    | `/placements`             | `block.read`    | Lista colocaciones. Filtro opcional `?slotId=`.                      |
| PUT    | `/placements`             | `block.manage`  | Reemplaza las colocaciones de un slot. Body: `{ slotId, blocks[] }`. |

Slots base: `header`, `content`, `sidebar`, `footer`.

### content

| Método | Ruta           | Permiso         | Descripción                                                           |
| ------ | -------------- | --------------- | --------------------------------------------------------------------- |
| GET    | `/content`     | `content.read`  | Lista contenido (paginado). Filtros `type`, `status`, `q` (slug).     |
| POST   | `/content`     | `content.write` | Crea contenido. Body: `{ slug, title, type?, body?, status?, seo? }`. |
| GET    | `/content/:id` | `content.read`  | Obtiene un contenido por id.                                           |
| PATCH  | `/content/:id` | `content.write` | Actualiza contenido (slug, title, body, status, seo).                  |
| DELETE | `/content/:id` | `content.write` | Elimina contenido. Devuelve `204`.                                     |

`status` acepta `draft`, `published`, `archived`. `title` y `body` son
objetos clave-valor (localizados), p. ej. `{ "es": "Título", "en": "Title" }`.

### translations

| Método | Ruta            | Permiso            | Descripción                                                          |
| ------ | --------------- | ------------------ | -------------------------------------------------------------------- |
| GET    | `/locales`      | público            | Locales soportados: `{ locales: ["es","en"], defaultLocale: "es" }`. |
| GET    | `/translations` | `translation.read` | Lista traducciones. Filtros `locale`, `namespace`.                   |
| PUT    | `/translations` | `translation.write`| Crea o actualiza una traducción (upsert). Body: `{ locale, namespace?, key, value }`. |

### audit

| Método | Ruta     | Permiso     | Descripción                                            |
| ------ | -------- | ----------- | ------------------------------------------------------ |
| GET    | `/audit`  | `audit.read`| Lista el registro de auditoría (paginado). Filtros `action`, `resource`. |

---

## Cabeceras y CORS

- **CORS** con credenciales habilitadas; orígenes permitidos configurados en
  `CORS_ORIGIN` (separados por coma).
- **Rate limiting**: 300 peticiones por minuto por IP
  (`@fastify/rate-limit`).
- **Helmet**: cabeceras de seguridad estándar (CSP desactivado por defecto).

Ver también:

- [`docs/api/auth-flow.md`](./auth-flow.md) — autenticación paso a paso.
- [`docs/api/websocket.md`](./websocket.md) — protocolo WebSocket.
- [`docs/guides/despliegue.md`](../guides/despliegue.md) — variables de entorno y escalado.
