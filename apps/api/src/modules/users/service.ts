import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
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
      username: u.username,
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
    username?: string;
    locale?: string;
    roles?: string[];
  },
): Promise<UserProfile> {
  const existing = await fastify.prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('El correo ya está registrado');

  if (input.username) {
    const byUsername = await fastify.prisma.user.findUnique({ where: { username: input.username } });
    if (byUsername) throw new ConflictError('El nombre de usuario ya está en uso');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await fastify.prisma.user.create({
    data: {
      email: input.email,
      username: input.username ?? null,
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
    username?: string | null;
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
  if (input.username !== undefined && input.username !== user.username) {
    if (input.username) {
      const byUsername = await fastify.prisma.user.findUnique({ where: { username: input.username } });
      if (byUsername) throw new ConflictError('El nombre de usuario ya está en uso');
    }
    data.username = input.username;
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

/** Crea una invitación de un solo uso (token opaco con expiración). */
export async function createInvite(
  fastify: FastifyInstance,
  email: string,
  role = 'user',
  ttlDays = 7,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  await fastify.prisma.invite.create({ data: { email, token, role, expiresAt } });
  return { token, expiresAt };
}

/** Consume una invitación válida (devuelve la invitación o null si es inválida). */
export async function consumeInvite(
  fastify: FastifyInstance,
  token: string,
): Promise<{ email: string; role: string } | null> {
  const invite = await fastify.prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  await fastify.prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  return { email: invite.email, role: invite.role };
}
