import type { FastifyInstance } from 'fastify';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';
import { findUserWithPermissions, toPublicUser } from '../../lib/user';
import { audit } from '../../lib/audit';
import { createUser, createInvite, deleteUser, listUsers, updateUser } from './service';
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserBody,
  type UpdateUserBody,
} from './schema';

export default async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // Invitación de un solo uso para que alguien se registre (link para enviar).
  fastify.post(
    '/users/invite',
    {
      schema: {
        tags: ['users'],
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' }, role: { type: 'string' } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('user.write')],
    },
    async (request, reply) => {
      const { email, role } = request.body as { email: string; role?: string };
      const { token, expiresAt } = await createInvite(fastify, email, role ?? 'user');
      audit(fastify, request, { actorId: request.user?.sub, action: 'user.invite', resource: 'user', resourceId: email });
      return reply.status(201).send({ email, token, inviteUrl: `/register?token=${token}`, expiresAt });
    },
  );

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
