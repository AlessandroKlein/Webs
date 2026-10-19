import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type Provider = { id: string; name: string; enabled?: boolean };

/**
 * notificaciones — servidor.
 *
 * Centro de notificaciones in-app. Rutas bajo `/api/v1/blocks/notificaciones`:
 *  - GET    /inbox?userId=   → lista Notification (de un usuario o todas).
 *  - POST   /send            → crea Notification y emite `notification.created`.
 *  - PATCH  /read/:id        → marca una como leída.
 *  - PATCH  /read-all        → marca todas (o las de un userId) como leídas.
 *  - DELETE /:id             → elimina una.
 *  - GET    /providers       → proveedores del settings (sms/whatsapp/push/email).
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const providers = (Array.isArray(config.providers) ? config.providers : []) as Provider[];

    fastify.get('/inbox', async (request: unknown) => {
      const { query } = request as { query?: { userId?: string } };
      const where = query?.userId ? { userId: query.userId } : {};
      return db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    });

    fastify.post('/send', async (request: unknown) => {
      const { body } = request as { body?: { userId?: string; title?: string; body?: string } };
      const title = (body?.title ?? '').trim();
      const message = body?.body ?? '';
      if (!title) return { ok: false, error: 'title es requerido' };

      const notification = await db.notification.create({
        data: { title, body: message, userId: body?.userId ?? null },
      });

      // Emite el evento de negocio si el emisor está disponible.
      if (fastify.events) {
        await fastify.events.emit('notification.created', { notification });
      }

      return { ok: true, notification };
    });

    fastify.patch('/read/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      const notification = await db.notification.update({
        where: { id: params.id },
        data: { read: true },
      });
      return { ok: true, notification };
    });

    fastify.patch('/read-all', async (request: unknown) => {
      const { body } = request as { body?: { userId?: string } };
      const where = body?.userId ? { userId: body.userId, read: false } : { read: false };
      const result = await db.notification.updateMany({ where, data: { read: true } });
      return { ok: true, updated: result.count ?? 0 };
    });

    fastify.delete('/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      if (!params?.id) return { ok: false, error: 'id es requerido' };
      await db.notification.delete({ where: { id: params.id } });
      return { ok: true };
    });

    fastify.get('/providers', async () =>
      providers.map((p) => ({ id: p.id, name: p.name, enabled: Boolean(p.enabled) })),
    );
  },
});
