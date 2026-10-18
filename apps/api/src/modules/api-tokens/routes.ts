import type { FastifyInstance } from 'fastify';
import { audit } from '../../lib/audit';
import { createApiToken, listAllApiTokens, listApiTokens, revokeAnyApiToken, revokeApiToken } from './service';

export default async function apiTokensRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api-tokens',
    {
      schema: { tags: ['api-tokens'] },
      preHandler: [fastify.authenticate],
    },
    async (request) => listApiTokens(fastify, request.user.sub),
  );

  fastify.post(
    '/api-tokens',
    {
      schema: {
        tags: ['api-tokens'],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            scopes: { type: 'array', items: { type: 'string' } },
            expiresInDays: { type: 'integer', minimum: 1, nullable: true },
            rateLimit: { type: 'integer', minimum: 1, nullable: true },
          },
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        scopes?: string[];
        expiresInDays?: number | null;
        rateLimit?: number | null;
      };
      const result = await createApiToken(fastify, request.user.sub, body, request.user.permissions ?? []);
      audit(fastify, request, {
        actorId: request.user.sub,
        action: 'apiToken.create',
        resource: 'api_token',
        resourceId: result.id,
      });
      return reply.status(201).send(result);
    },
  );

  fastify.delete(
    '/api-tokens/:id',
    {
      schema: {
        tags: ['api-tokens'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      await revokeApiToken(fastify, id, request.user.sub);
      audit(fastify, request, { actorId: request.user.sub, action: 'apiToken.revoke', resource: 'api_token', resourceId: id });
      return reply.status(204).send();
    },
  );

  // -------- Administración (todos los usuarios) --------

  fastify.get(
    '/admin/api-tokens',
    {
      schema: { tags: ['api-tokens'] },
      preHandler: [fastify.authenticate, fastify.authorize('apiToken.read')],
    },
    async () => listAllApiTokens(fastify),
  );

  fastify.delete(
    '/admin/api-tokens/:id',
    {
      schema: { tags: ['api-tokens'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('apiToken.write')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      await revokeAnyApiToken(fastify, id);
      audit(fastify, request, { actorId: request.user.sub, action: 'apiToken.admin.revoke', resource: 'api_token', resourceId: id });
      return reply.status(204).send();
    },
  );
}
