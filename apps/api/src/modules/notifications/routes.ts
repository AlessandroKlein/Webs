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
