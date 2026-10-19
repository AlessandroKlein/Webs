import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@webs/core';
import { getNotificationProvider, listNotificationProviders } from './registry';

const sendSchema = z.object({
  provider: z.string().min(1),
  to: z.string().min(1),
  message: z.string().min(1),
  channel: z.string().optional(),
});

export default async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // Bandeja de notificaciones en-app (global, usa el modelo `notification`).
  fastify.get(
    '/notifications/inbox',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate] },
    async () => fastify.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  );

  fastify.post(
    '/notifications/inbox',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate, fastify.authorize('setting.write')] },
    async (request, reply) => {
      const body = request.body as { title?: string; body?: string; userId?: string };
      const n = await fastify.prisma.notification.create({
        data: { title: body?.title ?? '', body: body?.body ?? '', userId: body?.userId ?? null },
      });
      return reply.status(201).send(n);
    },
  );

  fastify.patch(
    '/notifications/inbox/:id',
    { schema: { tags: ['notifications'], params: { type: 'object', properties: { id: { type: 'string' } } } }, preHandler: [fastify.authenticate] },
    async (request) => {
      const id = (request.params as { id: string }).id;
      return fastify.prisma.notification.update({ where: { id }, data: { read: true } });
    },
  );

  fastify.get(
    '/notifications/providers',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate] },
    async () => listNotificationProviders(),
  );

  fastify.post(
    '/notifications/send',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate, fastify.authorize('user.read')] },
    async (request) => {
      const parsed = sendSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Datos de notificación inválidos',
          parsed.error.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message })),
        );
      }
      const input = parsed.data;
      const provider = getNotificationProvider(input.provider);
      if (!provider) throw new NotFoundError(`Proveedor de notificaciones '${input.provider}'`);

      const result = await provider.send({ to: input.to, message: input.message, channel: input.channel });
      if (fastify.events) {
        await fastify.events.emit('notification.sent', {
          notification: { provider: provider.id, to: input.to, channel: input.channel ?? null, id: result.id },
        });
      }
      return result;
    },
  );
}
