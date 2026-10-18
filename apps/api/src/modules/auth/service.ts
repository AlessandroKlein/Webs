import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { ConflictError, UnauthorizedError } from '@webs/core';
import { findUserWithPermissions, type UserProfile } from '../../lib/user';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15; // 15 minutos
export const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(fastify: FastifyInstance, profile: UserProfile): string {
  return fastify.jwt.sign(
    { sub: profile.id, email: profile.email, permissions: profile.permissions },
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}

export async function createSession(
  fastify: FastifyInstance,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<string> {
  const token = generateRefreshToken();
  await fastify.prisma.session.create({
    data: {
      userId,
      refreshToken: hashRefreshToken(token),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

export async function login(
  fastify: FastifyInstance,
  email: string,
  password: string,
): Promise<UserProfile> {
  const user = await fastify.prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    throw new UnauthorizedError('Correo o contraseña inválidos');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Correo o contraseña inválidos');
  }
  const profile = await findUserWithPermissions(fastify, user.id);
  if (!profile) throw new UnauthorizedError();
  return profile;
}

export async function registerUser(
  fastify: FastifyInstance,
  input: { email: string; password: string; displayName?: string },
): Promise<UserProfile> {
  const existing = await fastify.prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('El correo ya está registrado');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await fastify.prisma.user.create({
    data: { email: input.email, passwordHash, displayName: input.displayName ?? null },
  });

  const userRole = await fastify.prisma.role.findUnique({ where: { key: 'user' } });
  if (userRole) {
    await fastify.prisma.userRole.create({ data: { userId: user.id, roleId: userRole.id } });
  }

  const profile = await findUserWithPermissions(fastify, user.id);
  if (!profile) throw new UnauthorizedError();
  return profile;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export async function refreshSession(
  fastify: FastifyInstance,
  rawToken: string,
): Promise<RefreshResult> {
  const session = await fastify.prisma.session.findUnique({
    where: { refreshToken: hashRefreshToken(rawToken) },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Sesión inválida o expirada');
  }

  const profile = await findUserWithPermissions(fastify, session.userId);
  if (!profile || !profile.active) throw new UnauthorizedError();

  // Rotación: revoca la sesión actual y emite una nueva.
  await fastify.prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const newToken = await createSession(fastify, session.userId, {
    userAgent: session.userAgent ?? undefined,
    ip: session.ip ?? undefined,
  });

  return {
    accessToken: signAccessToken(fastify, profile),
    refreshToken: newToken,
    user: profile,
  };
}

export async function revokeSession(fastify: FastifyInstance, rawToken: string): Promise<void> {
  if (!rawToken) return;
  await fastify.prisma.session.updateMany({
    where: { refreshToken: hashRefreshToken(rawToken) },
    data: { revokedAt: new Date() },
  });
}
