# Protocolo WebSocket (`/ws`)

La plataforma expone un WebSocket en **`/ws`** (raíz, sin el prefijo
`/api/v1`), implementado en `apps/api/src/plugins/websocket.ts` con
`@fastify/websocket`.

Se usa para mensajería en tiempo real basada en **canales** (pub/sub), con
soporte para escalado horizontal mediante Redis.

---

## Conexión y autenticación

El WebSocket **exige autenticación**: se acepta un access token JWT válido de
dos formas equivalentes:

1. **Query string**: `?token=<accessToken>`
2. **Cabecera**: `Authorization: Bearer <accessToken>`

```text
ws://localhost:4000/ws?token=<accessToken>
```

Si el token falta, es inválido o expiró, el servidor envía un frame de error y
cierra la conexión con el código `4001`:

```json
{ "error": "unauthorized" }
```

> El payload máximo de cada frame es **1 MB** (`maxPayload: 1024 * 1024`).

En desarrollo, Vite proxea `/ws` hacia `ws://localhost:4000`, por lo que desde
el navegador puede conectarse a `ws://localhost:5173/ws`.

---

## Protocolo de mensajes (JSON)

Todos los mensajes, tanto entrantes como salientes, son **objetos JSON**. Los
mensajes que envía el cliente (entrantes) tienen un campo `type`:

| `type`        | Campos                          | Descripción                                      |
| ------------- | ------------------------------- | ------------------------------------------------ |
| `subscribe`   | `channel` (string)              | Suscribirse a un canal.                          |
| `unsubscribe` | `channel` (string)              | Desuscribirse de un canal.                       |
| `publish`     | `channel`, `payload` (any)      | Publicar un mensaje en un canal.                 |
| `ping`        | —                               | Keep-alive; responde `{ "type": "pong" }`.       |

### Suscripción

```json
{ "type": "subscribe", "channel": "orders" }
```

### Desuscripción

```json
{ "type": "unsubscribe", "channel": "orders" }
```

### Publicación

```json
{ "type": "publish", "channel": "orders", "payload": { "id": 123, "status": "paid" } }
```

### Ping / pong

```json
{ "type": "ping" }
```

El servidor responde:

```json
{ "type": "pong" }
```

---

## Mensajes salientes (del servidor al cliente)

### Broadcast de un canal

Cuando alguien publica en un canal, todos los suscriptores reciben:

```json
{ "channel": "orders", "payload": { "id": 123, "status": "paid" } }
```

### Errores

| Frame                                        | Situación                              |
| -------------------------------------------- | -------------------------------------- |
| `{ "error": "unauthorized" }`                | Token inválido/ausente (cierra `4001`) |
| `{ "error": "invalid_json" }`                | Frame entrante que no es JSON válido   |

> Los tipos de mensaje desconocidos se ignoran silenciosamente.

---

## Semántica de canales

- Los canales son cadenas arbitrarias definidas por la aplicación o los
  bloques (ej. `orders`, `notifications`, `site.<id>`).
- La suscripción es **por conexión** (`Map<channel, Set<WebSocket>>`), no hay
  ACL por canal en esta base: cualquier usuario autenticado puede suscribirse
  y publicar en cualquier canal. Si necesitás autorización por canal, agregá
  la validación en el handler `publish`/`subscribe`.

---

## Escalado horizontal con Redis pub/sub

Sin Redis, los mensajes solo llegan a los sockets de la **misma instancia**.
Con `REDIS_URL` configurada, el plugin:

1. Duplica la conexión Redis en un `pub` y un `sub`.
2. El `sub` se suscribe al canal interno **`webs:ws`**.
3. Cada vez que se publica un mensaje, además del broadcast local, se publica
   en Redis (`pub.publish('webs:ws', JSON.stringify({ channel, payload }))`).
4. Cada instancia recibe el mensaje de Redis y hace el broadcast local.

De este modo, un mensaje publicado en la instancia A llega a los suscriptores
conectados a la instancia B.

```text
            ┌──────────┐        ┌─────────────┐
Cliente A ─►│ Inst A   │──pub──►│             │
            └──────────┘        │    Redis    │
            ┌──────────┐        │ canal: webs:ws
Cliente B ─►│ Inst B   │◄─sub───│             │
            └──────────┘        └─────────────┘
```

> Para desplegar varias réplicas detrás de un balanceador, el reverse proxy
> debe reenviar el *upgrade* de WebSocket. Ver
> [`docs/guides/despliegue.md`](../guides/despliegue.md#reverse-proxy).

---

## Ejemplo completo (Node.js)

```ts
import WebSocket from 'ws';

const token = '<accessToken>';
const ws = new WebSocket(`ws://localhost:4000/ws?token=${token}`);

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'orders' }));
  ws.send(JSON.stringify({ type: 'publish', channel: 'orders', payload: { hello: 'world' } }));
});

ws.on('message', (raw) => {
  console.log('recibido:', raw.toString());
  // { "channel": "orders", "payload": { "hello": "world" } }
});
```

---

## Ver también

- [`docs/api/overview.md`](./overview.md) — convenciones de la API REST.
- [`docs/api/auth-flow.md`](./auth-flow.md) — cómo obtener el access token.
