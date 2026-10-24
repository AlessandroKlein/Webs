import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Organización raíz por defecto (fallback single-tenant), idéntico a `DEFAULT_ORG_ID` de apps/api. */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;
    const maxMessageLength = Number(config.maxMessageLength ?? 500);

    // Resuelve la organización activa (tenant) con fallback a la org raíz 'principal'.
    const resolveOrgId = async (request: unknown): Promise<string> => {
      try {
        const { resolveTenant } = fastify as unknown as {
          resolveTenant?: (req: unknown) => Promise<{ organizationId?: string | null }>;
        };
        const tenant = resolveTenant ? await resolveTenant(request) : null;
        return tenant?.organizationId ?? ROOT_ORG_ID;
      } catch {
        return ROOT_ORG_ID;
      }
    };

    // Mensajes directos entre dos usuarios (ambos sentidos, asc).
    // GET /messages?from=&to=
    fastify.get('/messages', async (request: unknown) => {
      const { query } = request as { query?: { from?: string; to?: string } };
      const from = query?.from;
      const to = query?.to;
      if (from && to) {
        return db.chatMessage.findMany({
          where: { OR: [{ from, to }, { from: to, to: from }] },
          orderBy: { createdAt: 'asc' },
        });
      }
      // Retrocompatibilidad con el widget standalone del plugin (sin filtro).
      return db.chatMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    });

    // Conversaciones: agrupa los mensajes por el otro participante.
    // GET /conversations?userId=  →  [{ userId, name, lastMessage, updatedAt }]
    fastify.get('/conversations', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const userId = query?.userId;
      if (!userId) return [];

      const messages = (await db.chatMessage.findMany({
        where: { OR: [{ from: userId }, { to: userId }] },
        orderBy: { createdAt: 'asc' },
      })) as Array<{ from: string; to: string; body: string; createdAt: Date }>;

      const lastByUser = new Map<string, { lastMessage: string; updatedAt: Date }>();
      for (const m of messages) {
        const other: string = m.from === userId ? m.to : m.from;
        if (!other || other === userId) continue;
        lastByUser.set(other, { lastMessage: m.body, updatedAt: m.createdAt });
      }

      const users = (await db.user.findMany({
        select: { id: true, displayName: true, username: true, email: true },
      })) as Array<{ id: string; displayName: string | null; username: string | null; email: string }>;
      const nameById = new Map<string, string>();
      for (const u of users) {
        nameById.set(u.id, u.displayName ?? u.username ?? u.email);
      }

      return [...lastByUser.entries()]
        .map(([id, v]) => ({
          userId: id,
          name: nameById.get(id) ?? id,
          lastMessage: v.lastMessage,
          updatedAt: v.updatedAt,
        }))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    });

    // Salas disponibles (retrocompatibilidad con el widget standalone).
    fastify.get('/rooms', async () => {
      const rows = await db.chatMessage.findMany({ distinct: ['to'], select: { to: true } });
      const rooms = (rows as Array<{ to: string }>).map((r) => r.to).filter(Boolean);
      return Array.from(new Set(['general', ...rooms]));
    });

    fastify.post('/messages', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { from?: string; to?: string; body?: string } };
      const msg = await db.chatMessage.create({
        data: {
          from: body?.from ?? 'anon',
          to: body?.to ?? 'general',
          body: (body?.body ?? '').slice(0, maxMessageLength),
          organizationId: await resolveOrgId(request),
        },
      });
      if (fastify.events) {
        await fastify.events.emit('chat.message', {
          id: msg.id,
          from: msg.from,
          to: msg.to,
          body: msg.body,
          createdAt: msg.createdAt,
        });
      }
      // Tiempo real: avisa al destinatario y al remitente (si están conectados).
      const realtime = (fastify as unknown as { realtime?: { sendToUser: (u: string, e: string, p: unknown) => void } }).realtime;
      if (realtime) {
        realtime.sendToUser(msg.to, 'chat.message', msg);
        if (msg.from && msg.from !== msg.to) realtime.sendToUser(msg.from, 'chat.message', msg);
      }

      // Push notification al destinatario (solo si es un usuario real, no la sala
      // 'general' ni el remitente anónimo). Se emite `notification.created` para
      // actualizar la campana en vivo (ADR-0022).
      if (msg.to && msg.to !== 'general' && msg.to !== 'anon') {
        const notification = await db.notification.create({
          data: {
            title: 'Nuevo mensaje',
            body: msg.body.slice(0, 160),
            userId: msg.to,
            priority: 'normal',
            organizationId: msg.organizationId,
          },
        });
        if (fastify.events) {
          await fastify.events.emit('notification.created', { notification });
        }
        if (realtime) {
          realtime.sendToUser(msg.to, 'notification.created', notification);
        }
      }
      return msg;
    });

    // Usuarios disponibles para iniciar una conversación.
    fastify.get('/users', async () => {
      return db.user.findMany({
        select: { id: true, displayName: true, username: true, email: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  },
});
