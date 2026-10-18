import type { FastifyInstance } from 'fastify';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';
import { findUserWithPermissions, toPublicUser } from '../../lib/user';
import { audit } from '../../lib/audit';
import { createUser, deleteUser, listUsers, updateUser } from './service';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserBody,
  type UpdateUserBody,
} from './schema';

export default async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/users',
    {
      schema: {
        tags: ['users'],
        querystring: {
          type: 'object',
          properties: {
            ...(paginationQuerySchema.properties as object),
            q: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('user.read')],
    },
    async (request) => {
      const { page, pageSize } = pageParams(request.query as { page?: number; pageSize?: number });
      const q = (request.query as { q?: string }).q;
      const { items, total } = await listUsers(fastify, { page, pageSize, q });
      return pageResponse(items, total, page, pageSize);
    },
  );

  fastify.post(
    '/users',
    {
      schema: { tags: ['users'], body: createUserSchema },
      preHandler: [fastify.authenticate, fastify.authorize('user.write')],
    },
    async (request, reply) => {
      const body = request.body as CreateUserBody;
      const profile = await createUser(fastify, body);
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'user.create',
        resource: 'user',
        resourceId: profile.id,
      });
      return reply.status(201).send(toPublicUser(profile));
    },
  );

  fastify.get(
    '/users/:id',
    {
      schema: { tags: ['users'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('user.read')],
    },
    async (request) => {
      const profile = await findUserWithPermissions(
        fastify,
        (request.params as { id: string }).id,
      );
      if (!profile) return { user: null };
      return toPublicUser(profile);
    },
  );

  fastify.patch(
    '/users/:id',
    {
      schema: {
        tags: ['users'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: updateUserSchema,
      },
      preHandler: [fastify.authenticate, fastify.authorize('user.write')],
    },
    async (request) => {
      const body = request.body as UpdateUserBody;
      const profile = await updateUser(fastify, (request.params as { id: string }).id, body);
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'user.update',
        resource: 'user',
        resourceId: profile.id,
      });
      return toPublicUser(profile);
    },
  );

  fastify.delete(
    '/users/:id',
    {
      schema: { tags: ['users'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('user.write')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      await deleteUser(fastify, id);
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'user.delete',
        resource: 'user',
        resourceId: id,
      });
      return reply.status(204).send();
    },
  );
}
