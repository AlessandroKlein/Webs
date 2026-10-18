import Fastify, { type FastifyInstance } from 'fastify';
import { API_PREFIX } from '@webs/core';
import { loadEnv, corsOrigins, type Env } from './config/env';
import { createLogger } from './lib/logger';

import configPlugin from './plugins/config';
import dbPlugin from './plugins/db';
import redisPlugin from './plugins/redis';
import corsPlugin from './plugins/cors';
import helmetPlugin from './plugins/helmet';
import rateLimitPlugin from './plugins/rate-limit';
import sensiblePlugin from './plugins/sensible';
import swaggerPlugin from './plugins/swagger';
import authPlugin from './plugins/auth';
import errorHandlerPlugin from './plugins/error-handler';
import websocketPlugin from './plugins/websocket';

import healthRoutes from './modules/health';
import authRoutes from './modules/auth';
import usersRoutes from './modules/users';
import rolesRoutes from './modules/roles';
import settingsRoutes from './modules/settings';
import contentRoutes from './modules/content';
import translationsRoutes from './modules/translations';
import auditRoutes from './modules/audit';
import blocksRoutes from './modules/blocks';

import { registerBlocks } from './blocks/loader';

export interface BuildAppOptions {
  env?: Env;
  logger?: boolean;
}

/**
 * Construye la instancia de Fastify con todos los plugins y módulos.
 * Se separa de `index.ts` para poder instanciar la app en tests sin abrir puerto.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    logger: options.logger === false ? false : createLogger(env.LOG_LEVEL),
    disableRequestLogging: false,
    trustProxy: true,
  });

  // 1. Manejador de errores (primero, para capturar errores de todos).
  await app.register(errorHandlerPlugin);

  // 2. Infraestructura base.
  await app.register(configPlugin, { env });
  await app.register(dbPlugin);
  await app.register(redisPlugin, { redisUrl: env.REDIS_URL });
  await app.register(sensiblePlugin);
  await app.register(corsPlugin, { origins: corsOrigins(env) });
  await app.register(helmetPlugin);
  await app.register(rateLimitPlugin);
  await app.register(swaggerPlugin);

  // 3. Autenticación y tiempo real.
  await app.register(authPlugin, { jwtSecret: env.JWT_SECRET });
  await app.register(websocketPlugin);

  // 4. Módulos de dominio (bajo /api/v1).
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(usersRoutes, { prefix: API_PREFIX });
  await app.register(rolesRoutes, { prefix: API_PREFIX });
  await app.register(settingsRoutes, { prefix: API_PREFIX });
  await app.register(contentRoutes, { prefix: API_PREFIX });
  await app.register(translationsRoutes, { prefix: API_PREFIX });
  await app.register(auditRoutes, { prefix: API_PREFIX });
  await app.register(blocksRoutes, { prefix: API_PREFIX });

  // 5. Bloques instalados (cargan sus plugins, rutas, settings, slots y permisos).
  await registerBlocks(app);

  return app;
}
