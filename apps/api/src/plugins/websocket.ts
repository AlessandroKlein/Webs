import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';

type IncomingMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'publish'; channel: string; payload: unknown }
  | { type: 'ping' };

/**
 * WebSocket base en `/ws`.
 *
 * Protocolo JSON:
 *   - `{ "type": "subscribe", "channel": "..." }`   suscribirse a un canal
 *   - `{ "type": "unsubscribe", "channel": "..." }` desuscribirse
 *   - `{ "type": "publish", "channel": "...", "payload": ... }` publicar
 *
 * Escalado horizontal: con `REDIS_URL` configurada, los mensajes publicados se
 * replican entre instancias mediante pub/sub de Redis, de modo que un mensaje
 * enviado a una instancia llega a los suscriptores de todas.
 */
export default fp(async (fastify) => {
  await fastify.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  // Conexiones por usuario (clave: user id).
  const userSockets = new Map<string, Set<WebSocket>>();
  // Suscripciones: canal -> sockets.
  const channels = new Map<string, Set<WebSocket>>();

  const subscribe = (channel: string, socket: WebSocket) => {
    const set = channels.get(channel) ?? new Set<WebSocket>();
    set.add(socket);
    channels.set(channel, set);
  };

  const unsubscribe = (channel: string, socket: WebSocket) => {
    const set = channels.get(channel);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) channels.delete(channel);
  };

  let broadcast = (channel: string, payload: unknown) => {
    const frame = JSON.stringify({ channel, payload });
    channels.get(channel)?.forEach((s) => {
      // readyState OPEN === 1 (WebSocket)
      if (s.readyState === 1) s.send(frame);
    });
  };

  // Replica broadcasts entre instancias vía Redis pub/sub.
  const redis = fastify.redis;
  if (redis) {
    const pub = redis.duplicate();
    const sub = redis.duplicate();
    void sub.subscribe('webs:ws').catch(() => {});
    sub.on('message', (_ch, message) => {
      try {
        const parsed = JSON.parse(message) as { channel: string; payload: unknown };
        broadcast(parsed.channel, parsed.payload);
      } catch {
        /* ignora frames malformados */
      }
    });
    fastify.addHook('onClose', async () => {
      await pub.quit();
      await sub.quit();
    });
    // Sobrescribe broadcast local para publicar también en Redis.
    const localBroadcast = broadcast;
    broadcast = (channel, payload) => {
      localBroadcast(channel, payload);
      void pub.publish('webs:ws', JSON.stringify({ channel, payload }));
    };
  }

  // API de tiempo real para el resto de la app: envía un evento a un usuario
  // (canal `user:<id>`) o a un canal arbitral. Formato de frame: { channel, event, payload }.
  fastify.decorate('realtime', {
    sendToUser: (userId: string, event: string, payload: unknown) => {
      const frame = JSON.stringify({ channel: `user:${userId}`, event, payload });
      userSockets.get(userId)?.forEach((s) => {
        if (s.readyState === 1) s.send(frame);
      });
    },
    sendToChannel: (channel: string, event: string, payload: unknown) => {
      const frame = JSON.stringify({ channel, event, payload });
      channels.get(channel)?.forEach((s) => {
        if (s.readyState === 1) s.send(frame);
      });
    },
  });

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    // Autenticación: token en query `?token=` o cabecera `Authorization: Bearer`.
    let userId: string | null = null;
    try {
      const token =
        (request.query as { token?: string })?.token ??
        request.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (token) {
        const decoded = fastify.jwt.verify<{ sub: string }>(token);
        userId = decoded.sub ?? null;
      }
    } catch {
      userId = null;
    }

    if (!userId) {
      socket.send(JSON.stringify({ error: 'unauthorized' }));
      socket.close(4001, 'unauthorized');
      return;
    }
    const uid = userId;

    const set = userSockets.get(uid) ?? new Set<WebSocket>();
    set.add(socket);
    userSockets.set(uid, set);

    const cleanup = () => {
      set.delete(socket);
      if (set.size === 0) userSockets.delete(uid);
      channels.forEach((socks, channel) => {
        socks.delete(socket);
        if (socks.size === 0) channels.delete(channel);
      });
    };

    // F7 (P1): ACL de canales. `user:<id>` es siempre el propio usuario; `org:<id>`
    // exige membresía (o admin/super_admin); `admin:*` solo admin/super_admin;
    // cualquier otro canal se deniega. Los roles/membresías se cargan de forma
    // asíncrona y se mantiene fail-closed (solo `user:<self>` se permite) hasta
    // que estén listos.
    let roles = new Set<string>();
    let orgIds = new Set<string>();

    const canAccess = (channel: string): boolean => {
      if (channel === `user:${uid}`) return true;
      if (channel.startsWith('admin:')) return roles.has('admin') || roles.has('super_admin');
      if (channel.startsWith('org:')) {
        const orgId = channel.slice(4);
        if (roles.has('admin') || roles.has('super_admin')) return true;
        return orgIds.has(orgId);
      }
      return false;
    };

    void (async () => {
      try {
        const userRoles = await fastify.prisma.userRole.findMany({
          where: { userId: uid },
          select: { role: { select: { key: true } } },
        });
        roles = new Set(userRoles.map((ur) => ur.role.key));
        const memberships = await fastify.prisma.membership.findMany({
          where: { userId: uid, status: 'active' },
          select: { organizationId: true },
        });
        orgIds = new Set(memberships.map((m) => m.organizationId));
      } catch {
        /* mantiene roles/orgIds vacíos → fail-closed */
      }
    })();

    socket.on('message', (raw) => {
      let msg: IncomingMessage;
      try {
        msg = JSON.parse(raw.toString()) as IncomingMessage;
      } catch {
        socket.send(JSON.stringify({ error: 'invalid_json' }));
        return;
      }

      switch (msg.type) {
        case 'ping':
          socket.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'subscribe':
          if (!canAccess(msg.channel)) {
            socket.send(JSON.stringify({ error: 'forbidden', channel: msg.channel }));
            break;
          }
          subscribe(msg.channel, socket);
          break;
        case 'unsubscribe':
          unsubscribe(msg.channel, socket);
          break;
        case 'publish':
          if (!canAccess(msg.channel)) {
            socket.send(JSON.stringify({ error: 'forbidden', channel: msg.channel }));
            break;
          }
          broadcast(msg.channel, msg.payload);
          break;
        default:
          break;
      }
    });

    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
});
