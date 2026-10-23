import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@webs/core';
import { DEFAULT_ORG_ID } from '../../lib/tenant';
import { getNotificationProvider, listNotificationProviders } from './registry';

/** Esquema de validación para el envío de una notificación por un proveedor. */
const sendSchema = z.object({
  provider: z.string().min(1),
  to: z.string().min(1),
  message: z.string().min(1),
  channel: z.string().optional(),
});

/**
 * Registra las rutas de notificaciones: bandeja in-app (inbox), listado de
 * proveedores disponibles y envío de notificaciones a través de un proveedor.
 */
export default async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Bandeja de notificaciones en-app (global, usa el modelo `notification`) --------
  fastify.get(
    '/notifications/inbox',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate] },
    async (request) => {
      const { userId } = request.query as { userId?: string };
      const now = new Date();
      const where = {
        ...(userId ? { userId } : {}),
        // Oculta notificaciones vencidas (caducadas).
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      };
      return fastify.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    },
  );

  // Creación de una notificación en la bandeja (requiere permiso de escritura de ajustes).
  fastify.post(
    '/notifications/inbox',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate, fastify.requireTenant, fastify.authorize('setting.write')] },
    async (request, reply) => {
      const body = request.body as { title?: string; body?: string; userId?: string; priority?: string; expiresAt?: string | null };
      const n = await fastify.prisma.notification.create({
        data: {
          title: body?.title ?? '',
          body: body?.body ?? '',
          userId: body?.userId ?? null,
          priority: body?.priority ?? 'normal',
          expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
          organizationId: request.tenant?.organizationId ?? DEFAULT_ORG_ID,
        },
      });
      // Tiempo real: avisa al usuario destinatario (si está conectado).
      if (n.userId) {
        const realtime = (fastify as unknown as { realtime?: { sendToUser: (u: string, e: string, p: unknown) => void } }).realtime;
        realtime?.sendToUser(n.userId, 'notification.created', n);
      }
      return reply.status(201).send(n);
    },
  );

  // Marca todas las notificaciones como leídas.
  fastify.patch(
    '/notifications/inbox/read-all',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate] },
    async () => {
      const result = await fastify.prisma.notification.updateMany({
        where: { read: false },
        data: { read: true },
      });
      return { ok: true, updated: result.count ?? 0 };
    },
  );

  // Marca una notificación como leída.
  fastify.patch(
    '/notifications/inbox/:id',
    { schema: { tags: ['notifications'], params: { type: 'object', properties: { id: { type: 'string' } } } }, preHandler: [fastify.authenticate] },
    async (request) => {
      const id = (request.params as { id: string }).id;
      return fastify.prisma.notification.update({ where: { id }, data: { read: true } });
    },
  );

  // Elimina una notificación de la bandeja (el usuario puede borrar notificaciones).
  fastify.delete(
    '/notifications/inbox/:id',
    { schema: { tags: ['notifications'], params: { type: 'object', properties: { id: { type: 'string' } } } }, preHandler: [fastify.authenticate] },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const notification = await fastify.prisma.notification.findUnique({ where: { id } });
      if (!notification) throw new NotFoundError('Notificación');
      await fastify.prisma.notification.delete({ where: { id } });
      return { ok: true, id };
    },
  );

  // -------- Proveedores de notificación disponibles --------
  fastify.get(
    '/notifications/providers',
    { schema: { tags: ['notifications'] }, preHandler: [fastify.authenticate] },
    async () => listNotificationProviders(),
  );

  // -------- Envío de notificación vía un proveedor --------
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
      // Emite el evento `notification.sent` para observadores (auditoría, webhooks, etc.).
      if (fastify.events) {
        await fastify.events.emit('notification.sent', {
          notification: { provider: provider.id, to: input.to, channel: input.channel ?? null, id: result.id },
        });
      }
      return result;
    },
  );
}
