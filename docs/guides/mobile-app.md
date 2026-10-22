# Guía conceptual: app móvil

Este documento es una **guía conceptual** para la futura app móvil de Webs.
No asume una tecnología concreta (React Native, Flutter, etc.); describe cómo
consumir la API REST, manejar la autenticación y reutilizar los paquetes
compartidos del monorepo.

---

## 1. Consumir la API REST

La API es HTTP/JSON con prefijo `/api/v1` y documentación OpenAPI en `/docs`.
Recomendaciones para un cliente móvil:

- Definí un **cliente HTTP** tipado a partir de los contratos de la API.
- Tratá los errores por el campo estable `error.code` (no por `message`). Ver
  [`docs/api/overview.md`](../api/overview.md#formato-de-error).
- Reutilizá el envoltorio de paginación `{ items, total, page, pageSize,
  totalPages }` (0-indexed) para listas infinitas.

---

## 2. Autenticación (refresh token en almacenamiento seguro, no cookie)

La API **no depende de cookies** para clientes no-browser: `login`, `register`
y `refresh` devuelven el `refreshToken` **en el body**. Ver
[`docs/api/auth-flow.md`](../api/auth-flow.md).

Flujo recomendado para móvil:

1. **Login** con `POST /api/v1/auth/login`:

   ```http
   POST https://api.example.com/api/v1/auth/login
   Content-Type: application/json

   { "email": "usuario@example.com", "password": "clave-segura" }
   ```

   ```json
   { "accessToken": "…", "refreshToken": "…", "user": { "id": "…", "email": "…" } }
   ```

2. **Almacenar tokens de forma segura**:
   - **Access token** (15 min): en memoria; opcionalmente en el almacenamiento
     seguro si debe sobrevivir reinicios.
   - **Refresh token** (30 días): en el **almacenamiento seguro del sistema** —
     Keychain (iOS) o Keystore/EncryptedSharedPreferences (Android).
   - **Nunca** guardar tokens en `AsyncStorage`/`SharedPreferences` planos ni
     en logs.

3. **Adjuntar el access token** en cada petición:

   ```
   Authorization: Bearer <accessToken>
   ```

4. **Renovar con rotación**: cuando la API responda `401`, llamá a
   `POST /api/v1/auth/refresh` con el refresh token **en el body**:

   ```http
   POST https://api.example.com/api/v1/auth/refresh
   Content-Type: application/json

   { "refreshToken": "<refreshToken>" }
   ```

   La respuesta trae un **nuevo** access token **y un nuevo refresh token**;
   reemplazá ambos (el refresh anterior queda revocado). Si el refresh falla
   con `401 UNAUTHORIZED`, cerrá la sesión local y volvé al login.

5. **Logout**: `POST /api/v1/auth/logout` con `{ "refreshToken": "…" }` y luego
   borrá los tokens locales.

> La web usa cookie `httpOnly` para el refresh token; el móvil no. Ambos
> modelos conviven porque la API acepta el refresh token en body **o** cookie.

---

## 3. Tiempo real (WebSocket)

Conectate a `wss://api.example.com/ws` autenticando con el access token:

- Query: `wss://api.example.com/ws?token=<accessToken>`
- Cabecera: `Authorization: Bearer <accessToken>`

Protocolo JSON de canales (`subscribe` / `unsubscribe` / `publish` / `ping`).
Ver [`docs/api/websocket.md`](../api/websocket.md).

Recomendaciones móviles:

- Renová la conexión con un access token fresco al detectar cierre `4001`
  (`unauthorized`) o al refrescar el token.
- Usá `ping`/`pong` y reconexión con *backoff* para gestionar redes móviles.

---

## 4. Paquetes compartidos del monorepo

El monorepo ya separa la lógica reutilizable en `packages/`, lista para
consumir desde un cliente móvil TypeScript:

| Paquete                 | Qué aporta                                                                 | Útil para móvil |
| ----------------------- | -------------------------------------------------------------------------- | --------------- |
| `@webs/core`            | Constantes de negocio (`API_PREFIX`, `Permission`, locales), tipos (`Page`, `Result`, `ErrorBody`), códigos de error (`ErrorCode`). | ✅ Tipos/constantes de la API y errores. |
| `@webs/plugin-sdk`      | Contrato de plugins (`PluginManifest`, JSON Schema, slots, menú).        | ⚠️ Si el móvil renderiza plugins. |
| `@webs/i18n`            | Recursos base de traducción (`es`/`en`) e instancia i18next.                | ✅ Localización. |
| `@webs/ui`              | Tema y tokens CSS del frontend React.                                       | ❌ Específico de web/React. |

Para una app móvil, lo más reutilizable es **`@webs/core`** (tipos de la API,
códigos de error, permisos y paginación) y **`@webs/i18n`** (localización).
Podés publicar estos paquetes en un registro privado o consumirlos como
*workspace* si el cliente móvil vive en el mismo monorepo.

---

## 5. Notas de implementación sugerida

- **Manejo de errores**: mapeá `error.code` → experiencia de usuario
  (`UNAUTHORIZED` → reauth, `RATE_LIMITED` → espera, `VALIDATION_ERROR` →
  mensajes por `details[].field`).
- **Caché offline**: cacheá lecturas (`GET`) con validación por TTL y
  revalida al recuperar red.
- **Seguridad**: nunca persistas el access token fuera del almacenamiento
  seguro; rotá el refresh token exactamente una vez por refresh para evitar
  condiciones de carrera.

---

## Ver también

- [`docs/api/auth-flow.md`](../api/auth-flow.md) — detalle del flujo de auth.
- [`docs/api/websocket.md`](../api/websocket.md) — protocolo WebSocket.
- [`docs/api/overview.md`](../api/overview.md) — referencia de la API.
