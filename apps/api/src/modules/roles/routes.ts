import type { FastifyInstance } from 'fastify';
import { ConflictError, ForbiddenError, NotFoundError } from '@webs/core';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { createRoleSchema, updateRoleSchema, type CreateRoleBody, type UpdateRoleBody } from './schema';

function serializeRole(role: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: { permission: { key: string; description: string | null } }[];
}) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    system: role.system,
    permissions: role.permissions.map((p) => p.permission.key),
  };
}

export default async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/permissions',
    {
      schema: { tags: ['roles'] },
      preHandler: [fastify.authenticate, fastify.authorize('role.read')],
    },
    async () => {
      const permissions = await fastify.prisma.permission.findMany({ orderBy: { key: 'asc' } });
      return permissions.map((p) => ({ key: p.key, description: p.description }));
    },
  );

  fastify.get(
    '/roles',
    {
      schema: { tags: ['roles'], querystring: paginationQuerySchema },
      preHandler: [fastify.authenticate, fastify.authorize('role.read')],
    },
    async (request) => {
      const { page, pageSize } = pageParams(request.query as { page?: number; pageSize?: number });
      const [roles, total] = await fastify.prisma.$transaction([
        fastify.prisma.role.findMany({
          skip: page * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'asc' },
          include: { permissions: { include: { permission: true } } },
        }),
        fastify.prisma.role.count(),
      ]);
      return pageResponse(roles.map(serializeRole), total, page, pageSize);
    },
  );

  fastify.post(
    '/roles',
    {
      schema: { tags: ['roles'], body: createRoleSchema },
      preHandler: [fastify.authenticate, fastify.authorize('role.write')],
    },
    async (request, reply) => {
      const body = request.body as CreateRoleBody;
      const existing = await fastify.prisma.role.findUnique({ where: { key: body.key } });
      if (existing) throw new ConflictError('Ya existe un rol con esa clave');

      const permissions = await fastify.prisma.permission.findMany({
        where: { key: { in: body.permissions ?? [] } },
      });

      const role = await fastify.prisma.role.create({
        data: {
          key: body.key,
          name: body.name,
          description: body.description ?? null,
          permissions: {
            create: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
        include: { permissions: { include: { permission: true } } },
      });

      audit(fastify, request, { actorId: request.user?.sub, action: 'role.create', resource: 'role', resourceId: role.id });
      return reply.status(201).send(serializeRole(role));
    },
  );

  fastify.patch(
    '/roles/:id',
    {
      schema: {
        tags: ['roles'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: updateRoleSchema,
      },
      preHandler: [fastify.authenticate, fastify.authorize('role.write')],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const body = request.body as UpdateRoleBody;
      const role = await fastify.prisma.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundError('Rol');
      if (role.system && body.permissions) {
        // Los roles de sistema mantienen sus permisos; sólo se permite renombrar.
        throw new ForbiddenError('No se pueden modificar los permisos de un rol de sistema');
      }

      if (body.permissions) {
        const permissions = await fastify.prisma.permission.findMany({
          where: { key: { in: body.permissions } },
        });
        await fastify.prisma.rolePermission.deleteMany({ where: { roleId: id } });
        await fastify.prisma.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }

      const updated = await fastify.prisma.role.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
        },
        include: { permissions: { include: { permission: true } } },
      });

      audit(fastify, request, { actorId: request.user?.sub, action: 'role.update', resource: 'role', resourceId: id });
      return serializeRole(updated);
    },
  );

  fastify.delete(
    '/roles/:id',
    {
      schema: { tags: ['roles'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('role.write')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const role = await fastify.prisma.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundError('Rol');
      if (role.system) throw new ForbiddenError('No se puede eliminar un rol de sistema');

      await fastify.prisma.role.delete({ where: { id } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'role.delete', resource: 'role', resourceId: id });
      return reply.status(204).send();
    },
  );
}
