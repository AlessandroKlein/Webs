import type { FastifyInstance } from 'fastify';
import { audit } from '../../lib/audit';
import { checkUpdate, getStatus, rollback, startApply, type ApplyBody } from './service';

/**
 * Rutas del updater de la app (ADR-0010), bajo `/api/v1/system/update`.
 * Permisos: `check`/`status` = `setting.read`; `apply`/`rollback` = `setting.write`.
 */
export default async function updateRoutes(fastify: FastifyInstance): Promise<void> {
  // Consulta de actualizaciones disponibles (app + plugins).
  fastify.post(
    '/system/update/check',
    {
      schema: { tags: ['update'] },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async () => {
      const app = await checkUpdate();
      // Los plugins se actualizan por su propio flujo (tarea aparte del M2);
      // aquí se mantiene el contrato de ADR-0010 con la lista de plugins.
      return { app, plugins: [] };
    },
  );

  // Aplica una actualización de la app (descarga + verifica + swap/rolling).
  fastify.post(
    '/system/update/apply',
    {
      schema: {
        tags: ['update'],
        body: {
          type: 'object',
          required: ['target'],
          properties: {
            target: { type: 'string', enum: ['app'] },
            version: { type: 'string' },
            artifactUrl: { type: 'string' },
            digest: { type: 'string' },
            signature: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request, reply) => {
      const record = await startApply(fastify, request.body as ApplyBody);
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'update.apply',
        resource: 'system',
        resourceId: record.toVersion,
      });
      return reply.status(202).send(record);
    },
  );

  // Estado de una actualización (por id) o listado si no se pasa id.
  fastify.get(
    '/system/update/status',
    {
      schema: {
        tags: ['update'],
        querystring: {
          type: 'object',
          properties: { updateId: { type: 'string' } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => {
      const { updateId } = (request.query ?? {}) as { updateId?: string };
      return getStatus(updateId);
    },
  );

  // Rollback a la versión anterior (restaura el build preservado).
  fastify.post(
    '/system/update/rollback',
    {
      schema: { tags: ['update'] },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request, reply) => {
      const record = await rollback(fastify);
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'update.rollback',
        resource: 'system',
      });
      return reply.status(202).send(record);
    },
  );
}
