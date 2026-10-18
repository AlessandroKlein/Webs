import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '@webs/core';

/**
 * Tokens de API (JWT). Permiten acceso programático a la API REST con permisos
 * acotados (scopes) y revocables, sin usar credenciales de usuario.
 */

export interface CreateApiTokenInput {
  name: string;
  scopes?: string[];
  /** Duración en días; omitido/null = sin caducidad. */
  expiresInDays?: number | null;
}

export async function createApiToken(
  fastify: FastifyInstance,
  userId: string,
  input: CreateApiTokenInput,
) {
  const scopes = input.scopes ?? [];
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;

  const record = await fastify.prisma.apiToken.create({
    data: { userId, name: input.name, scopes, expiresAt },
  });

  const payload = {
    sub: userId,
    type: 'api_token' as const,
    tokenId: record.id,
    scopes,
  };

  const token = input.expiresInDays
    ? fastify.jwt.sign(payload, { expiresIn: `${input.expiresInDays}d` })
    : fastify.jwt.sign(payload);

  return {
    id: record.id,
    name: record.name,
    scopes,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    token,
  };
}

export async function listApiTokens(fastify: FastifyInstance, userId: string) {
  const tokens = await fastify.prisma.apiToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      scopes: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
  });
  return tokens;
}

export async function revokeApiToken(fastify: FastifyInstance, id: string, userId: string): Promise<void> {
  const token = await fastify.prisma.apiToken.findFirst({ where: { id, userId } });
  if (!token) throw new NotFoundError('Token de API');
  await fastify.prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
}
