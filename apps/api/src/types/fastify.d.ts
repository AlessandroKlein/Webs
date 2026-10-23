import type { PrismaClient } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import type { NotificationProviderAdapter, PaymentProviderAdapter, StorageDriver } from '@webs/plugin-sdk';
import type { Env } from '../config/env';
import type { AccessTokenPayload } from './auth';
import type { TenantContext } from '../lib/tenant';
import type { LicenseService } from '../modules/licenses/service';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Tenant resuelto (lo adjunta el preHandler `requireTenant`). */
    tenant?: TenantContext;
  }

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
    /** preHandler que resuelve y adjunta `request.tenant` (fail-closed, ADR-0006). */
    requireTenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Resuelve el tenant sin fallar (scoping opcional). */
    resolveTenant: (request: FastifyRequest) => Promise<TenantContext>;
    /** Devuelve el fragmento `where` de scoping según el tenant (ADR-0006). */
    resolveScope: (tenant: TenantContext) => Promise<Record<string, unknown>>;
    /** Config actual de un plugin (defaults del manifest + overrides de settings), resuelta en cada request (fix config-freeze). */
    getPluginConfig: (pluginId: string) => Promise<Record<string, unknown>>;
    /** Configuración de seguridad (sección `security`) cacheada al arranque. */
    securitySettings: {
      hsts?: boolean;
      hstsMaxAge?: number;
      secureCookies?: boolean;
      contentSecurityPolicy?: string;
    };
    /** Bus de eventos de negocio (automatizaciones de correo + suscriptores de plugins). */
    events: {
      emit: (event: string, payload: Record<string, unknown>) => Promise<void>;
      on: (event: string, handler: (payload: Record<string, unknown>) => Promise<void> | void) => void;
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
    /** Servicio de licencias (Licensify, node-locking offline). */
    license: LicenseService;
  }
}
