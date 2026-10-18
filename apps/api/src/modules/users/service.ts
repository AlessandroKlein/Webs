import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError } from '@webs/core';
import { findUserWithPermissions, toPublicUser, type UserProfile } from '../../lib/user';

export interface ListUsersOptions {
  page: number;
  pageSize: number;
  q?: string;
}

export async function listUsers(fastify: FastifyInstance, opts: ListUsersOptions) {
  const where = opts.q ? { email: { contains: opts.q } } : {};
  const [items, total] = await fastify.prisma.$transaction([
    fastify.prisma.user.findMany({
      where,
      skip: opts.page * opts.pageSize,
      take: opts.pageSize,
      orderBy: { createdAt: 'desc' },
      include: { roles: { include: { role: true } } },
    }),
    fastify.prisma.user.count({ where }),
  ]);
  return {
    items: items.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      locale: u.locale,
      active: u.active,
      roles: u.roles.map((r) => r.role.key),
      createdAt: u.createdAt.toISOString(),
    })),
    total,
  };
}

export async function createUser(
  fastify: FastifyInstance,
  input: {
    email: string;
    password: string;
    displayName?: string;
    locale?: string;
    roles?: string[];
  },
): Promise<UserProfile> {
  const existing = await fastify.prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('El correo ya está registrado');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await fastify.prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName ?? null,
      locale: input.locale ?? 'es',
    },
  });

  await syncRoles(fastify, user.id, input.roles ?? ['user']);

  const profile = await findUserWithPermissions(fastify, user.id);
  if (!profile) throw new NotFoundError('Usuario');
  return profile;
}

export async function updateUser(
  fastify: FastifyInstance,
  id: string,
  input: {
    email?: string;
    password?: string;
    displayName?: string | null;
    locale?: string;
    active?: boolean;
    roles?: string[];
  },
): Promise<UserProfile> {
  const user = await fastify.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError('Usuario');

  const data: Record<string, unknown> = {};
  if (input.email !== undefined && input.email !== user.email) {
    const existing = await fastify.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError('El correo ya está registrado');
    data.email = input.email;
  }
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.locale !== undefined) data.locale = input.locale;
  if (input.active !== undefined) data.active = input.active;

  await fastify.prisma.user.update({ where: { id }, data });

  if (input.roles) await syncRoles(fastify, id, input.roles);

  const profile = await findUserWithPermissions(fastify, id);
  if (!profile) throw new NotFoundError('Usuario');
  return profile;
}

export async function deleteUser(fastify: FastifyInstance, id: string): Promise<void> {
  const user = await fastify.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError('Usuario');
  await fastify.prisma.user.delete({ where: { id } });
}

export async function syncRoles(
  fastify: FastifyInstance,
  userId: string,
  roleKeys: string[],
): Promise<void> {
  const roles = await fastify.prisma.role.findMany({ where: { key: { in: roleKeys } } });
  await fastify.prisma.$transaction([
    fastify.prisma.userRole.deleteMany({ where: { userId } }),
    fastify.prisma.userRole.createMany({
      data: roles.map((r) => ({ userId, roleId: r.id })),
    }),
  ]);
}

export { toPublicUser };
