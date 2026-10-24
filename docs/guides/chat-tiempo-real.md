# Chat en tiempo real y ventana flotante

Guía operativa del chat en tiempo real (ADR-0022). El chat entre usuarios usa el canal
WebSocket existente de la plataforma para entregar mensajes y notificaciones **sin
recargar la página**, y una ventana/flotante de notificación por usuario y organización.

## 1. Arquitectura de entrega

- **WebSocket** (`apps/api/src/plugins/websocket.ts`, 204 líneas) expone `/ws`
  (`@fastify/websocket`) con protocolo JSON `subscribe`/`unsubscribe`/`publish`/`ping`.
- **Multi-instancia**: Redis pub/sub en el canal `webs:ws` replica los broadcasts entre
  réplicas de la API (necesario en cluster/k8s).
- **Decorator** `fastify.realtime`:
  - `sendToUser(userId, event, payload)` → entrega a los sockets del usuario.
  - `sendToChannel(channel, event, payload)` → entrega a todos los suscriptores del canal.
- **ACL fail-closed (F7)**: un socket solo puede suscribirse a
  - `user:<id>` si es su propio id;
  - `org:<id>` si es miembro (o admin/super_admin);
  - `admin:*` solo admin/super_admin;
  - el resto se deniega.

> ADR-0022 eligió WebSocket (ya existente) por encima de SSE: un solo canal bidireccional
> reutilizable para chat, tickets y notificaciones, con la misma infraestructura Redis.

## 2. Flujo de un mensaje directo (DM)

El plugin `chat` (`plugins/chat/src/server.ts`, 147 líneas) es la fuente de mensajes:

1. `POST /messages` (autenticado) crea el `ChatMessage` (con `from`, `to`, `body`
   recortado a `maxMessageLength`, `organizationId` resuelto del tenant).
2. Emite `events.emit('chat.message', ...)` (bus interno + automatizaciones de email).
3. **Tiempo real**: `realtime.sendToUser(msg.to, 'chat.message', msg)` al destinatario y
   al remitente (si está conectado) — sin recargar.
4. **Push notification** (solo si `to` es un usuario real, no la sala `general` ni `anon`):
   crea un `Notification` y emite `notification.created` (events + realtime) para
   actualizar la campana en vivo.

### 2.1 Rutas del plugin

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/messages?from=&to=` | Hilo entre dos usuarios (ambos sentidos, asc). Sin filtros → últimos 100 (retrocompat). |
| `GET` | `/conversations?userId=` | Lista de conversaciones del usuario (agrupa por el otro participante). |
| `GET` | `/rooms` | Salas disponibles (`general` + `to` distintos). |
| `POST` | `/messages` | Envía un mensaje (autenticado). |
| `GET` | `/users` | Usuarios disponibles para iniciar conversación. |

## 3. Ventana flotante (consumo en el frontend)

El chat de usuarios es **SocialDirect** (vía `/social`), que consume los eventos en vivo
con `useRealtime()`:

- Al recibir `chat.message`, invalida el hilo abierto y la lista de conversaciones (sin
  recargar).
- Al recibir `notification.created`, actualiza la campana de notificaciones.

La ventana flotante se suscribe a `user:<id>` (mensajes directos) y, para avisos de
organización, a `org:<id>`; ambos canales los autoriza la ACL del §1.

> El admin chat (`/admin/chat`) fue **retirado** en M8 (ruta de App.tsx, `ChatPage.tsx` y
> el item de menú admin de `plugins/chat/plugin.json` eliminados). El chat de usuarios
> (SocialDirect) sigue funcional.

## 4. Contrato de eventos realtime

| Evento | Canal | Payload | Consumidor |
|--------|-------|---------|------------|
| `chat.message` | `user:<id>` | `{ id, from, to, body, createdAt }` | SocialDirect (hilo + conversaciones). |
| `notification.created` | `user:<id>` | `Notification` | Campana de notificaciones. |
| `ticket.update` | `org:<id>` (futuro) | ticket actualizado | Panel de soporte (ver ADR-0021). |

## 5. Configuración del plugin `chat`

`plugins/chat/plugin.json`:

- `settings.maxMessageLength` (default `500`): recorte de `body`.
- `settings.room` (`general`): sala por defecto para el widget standalone.
- `settings.allowCommunities`, `settings.moderation` (`none|basic`): opciones de moderación.

## 6. Verificación rápida

```bash
# Conectarse (auth por token)
# ws://localhost:4000/ws?token=<jwt>
# → {"type":"subscribe","channel":"user:<mi-id>"}

# Enviar DM
curl -X POST http://localhost:4000/api/v1/plugins/chat/messages \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"to":"<destinatario-id>","body":"Hola"}'
```

El destinatario conectado recibe `chat.message` + `notification.created` en su socket, sin
recargar.

Referencias: [ADR-0022](../adr/0022-chat-realtime.md), [WebSocket (referencia API)](../api/websocket.md).
