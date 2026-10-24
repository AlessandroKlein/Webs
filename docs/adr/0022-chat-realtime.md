# ADR-0022: Chat en tiempo real (WebSocket + ventana flotante)

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 2.6.0 del monorepo — Milestone 8)
- **Decisión:** El chat usa el **WebSocket** ya existente de la plataforma
  (`apps/api/src/plugins/websocket.ts`, Redis pub/sub multi-instancia, ACL fail-closed) como
  canal de entrega, reemplazando el polling del cliente del plugin `chat`; se añade una
  **ventana flotante de notificación** por usuario (`user:<id>`) y por organización
  (`org:<id>`) suscrita a `chat.message` y `notification.created`. Se descarta SSE.

## Contexto

El plugin de chat existente (`plugins/chat`) ya persiste y difunde mensajes, pero su
**cliente** no usa el tiempo real:

- `plugins/chat/src/server.ts` — `POST /messages` emite `events.emit('chat.message')` y
  además `realtime.sendToUser(msg.to, 'chat.message', msg)` +
  `sendToUser(msg.from, 'chat.message', msg)`. Es decir, **el backend ya empuja por WS**.
- `plugins/chat/src/client.ts` — el cliente **ignora el WS** y hace polling:
  `setInterval(() => void refresh(), 3000)` re-leyendo `GET /api/v1/plugins/chat/messages`
  cada 3 segundos (latencia alta, tráfico innecesario, no escala).
- `apps/api/src/plugins/websocket.ts` (204 líneas) — infraestructura realtime ya en
  producción: `@fastify/websocket` en `/ws`, protocolo JSON
  `subscribe/unsubscribe/publish/ping`, mapas `userSockets`/`channels`, **Redis pub/sub
  `webs:ws`** para multi-instancia, decorador `fastify.realtime` con
  `sendToUser(userId, event, payload)` y `sendToChannel(channel, event, payload)`, y ACL F7
  fail-closed (`user:<id>` propio; `org:<id>` con membresía; `admin:*` admin/super_admin;
  resto denegado).
- `apps/web/src/lib/realtime.ts` + `useRealtime(event => …)` — hook del shell que ya consume
  el WS (el AdminLayout lo usa para invalidar `notifications-inbox` ante
  `notification.created`).

El problema no es la falta de transporte, sino que el cliente del plugin `chat` no se
suscribe a él.

## Decisión

### 1. Transporte: WebSocket (existente), no SSE

Se mantiene el **WebSocket** como único canal realtime y se **descarta SSE**:

| Criterio | WebSocket (elegido) | SSE |
|----------|--------------------|-----|
| Bidireccional | Sí (enviar y recibir sobre la misma conexión). | No (solo servidor→cliente; el envío sigue por HTTP). |
| Multi-instancia | Ya resuelto vía Redis pub/sub `webs:ws`. | Requiere fanout propio (Redis Streams u otro bus) no existente. |
| ACL por canal | Ya implementada (F7 fail-closed). | Habría que replicar la autorización por endpoint de stream. |
| Estado actual | Ya desplegado y en uso por el shell. | No existe. |

Elegir WebSocket no introduce dependencias ni infraestructura nueva; es el camino de menor
costo y ya está probado en multi-instancia.

### 2. Entrega sin recarga en el chat

El cliente de `plugins/chat` deja el polling y se suscribe al canal correspondiente:

- Mensajes directos (`to` = un usuario): canal `user:<id>` (entrega
  `sendToUser(participante, 'chat.message', msg)` — ya lo hace el servidor).
- Mensajes de sala (`to` = `general` u otra sala): canal `org:<organizationId>`
  (`sendToChannel('org:<orgId>', 'chat.message', msg)`, adicional al actual
  `sendToUser`). El plugin emite ambos según el destino.

El cliente escucha el evento `chat.message` y hace append local (sin re-fetch), manteniendo
el `GET /messages` solo para el historial inicial.

### 3. Ventana flotante de notificación por usuario/org

Se añade una **ventana flotante** (widget en el shell, no una página) que muestra los
mensajes de chat no leídos y las notificaciones entrantes en tiempo real:

- Suscripciones: `user:<id>` (mensajes directos y notificaciones personales) y
  `org:<id>` (mensajes de sala de la organización del tenant activo).
- Eventos: `chat.message` (chat) y `notification.created` (campana). El contador de no
  leídos se actualiza al recibir el evento sin recargar (el shell ya invalida
  `notifications-inbox` en `notification.created`; se extiende el mismo patrón a `chat.message`).
- ACL: los canales `user:<id>`/`org:<id>` ya están permitidos por F7 (membresía de la org);
  no se relaja la política.

### 4. Contrato de eventos realtime

Se fijan los nombres de evento (payload = mensaje/notificación serializado):

| Evento | Canal | Origen |
|--------|-------|--------|
| `chat.message` | `user:<id>` (directo) / `org:<id>` (sala) | `plugins/chat` POST /messages |
| `notification.created` | `user:<id>` | módulo notifications |
| `ticket.created`/`ticket.updated`/`ticket.assigned`/`ticket.resolved` | `user:<id>` (asignado/creador) | ADR-0021 |

## Consecuencias

### Positivas

- Entrega en milisegundos sin polling (menos latencia y menos carga en la API).
- Reutiliza el WS existente (ACL, Redis, multi-instancia) sin infraestructura ni dependencia
  nueva.
- La ventana flotante unifica chat + notificaciones bajo la misma suscripción realtime.

### Negativas

- El cliente del plugin pasa a depender del WS del shell (`useRealtime`/conexión `/ws`); un
  cliente embebido sin WS cae al fallback de polling (degradación controlada).
- Hay que cuidar la duplicación de entrega en multi-instancia (el servidor debe emitir por
  Redis **una sola vez**; el decorador ya centraliza el broadcast).

## Notas

- No confundir con el protocolo `publish` del WS (publicación a un canal explícito): aquí el
  chat usa `sendToUser`/`sendToChannel` del decorador `fastify.realtime`.
- `ChatMessage` (schema.prisma:336-347) ya tiene `from`/`to`/`body` y `@@index([to,createdAt])`;
  el ADR no cambia el modelo, solo la entrega.
- Implementación (M8) y guía del chat quedan para las tareas siguientes.
