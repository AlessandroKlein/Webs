import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { NotificationProviderAdapter, PaymentProviderAdapter, StorageDriver } from '@webs/plugin-sdk';
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
    /** Configuración de seguridad (sección `security`) cacheada al arranque. */
    securitySettings: {
      hsts?: boolean;
      hstsMaxAge?: number;
      secureCookies?: boolean;
      contentSecurityPolicy?: string;
    };
    /** Emisor de eventos de negocio (dispara automatizaciones de correo). */
    events: {
      emit: (event: string, payload: Record<string, unknown>) => Promise<void>;
    };
    /** Registro de proveedores de pago (los bloques de pasarela se registran acá). */
    payments: {
      register: (adapter: PaymentProviderAdapter) => void;
    };
    /** Registro de drivers de almacenamiento (bloques S3/R2/MinIO). */
    storage: {
      register: (driver: StorageDriver) => void;
    };
    /** Registro de proveedores de notificaciones (bloques Twilio, etc.). */
    notifications: {
      register: (adapter: NotificationProviderAdapter) => void;
    };
  }
}
