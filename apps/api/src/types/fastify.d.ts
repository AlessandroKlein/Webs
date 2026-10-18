import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import type { AccessTokenPayload } from './auth';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Configuración tipada de entorno. */
    config: Env;
    /** Cliente Prisma. */
    prisma: PrismaClient;
    /** Cliente Redis (null si no está configurado). */
    redis: Redis | null;
    /** preHandler que exige un token de acceso válido. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler factory que exige un permiso concreto. */
    authorize: (
      permission: string,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
