import Fastify, { type FastifyInstance } from 'fastify';
import { API_PREFIX } from '@webs/core';
import { loadEnv, corsOrigins, type Env } from './config/env';
import { createLogger } from './lib/logger';
import { readState } from './lib/state';

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
import setupRoutes from './modules/setup';
import emailRoutes, { startQueueProcessor } from './modules/email';
import i18nRoutes from './modules/i18n';

import { registerBlocks } from './blocks/loader';

export interface BuildAppOptions {
  env?: Env;
  logger?: boolean;
}

/**
 * Construye la instancia de Fastify. Si la plataforma aún no está instalada,
 * solo expone el asistente de instalación (`/api/v1/setup/*`); el resto de los
 * módulos se registran una vez completada la instalación.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const state = readState();

  const app = Fastify({
    logger: options.logger === false ? false : createLogger(env.LOG_LEVEL),
    disableRequestLogging: false,
    trustProxy: true,
  });

  // 1. Manejador de errores (primero, para capturar errores de todos).
  await app.register(errorHandlerPlugin);

  // 2. Infraestructura base (siempre disponible).
  await app.register(configPlugin, { env });
  await app.register(sensiblePlugin);
  await app.register(corsPlugin, { origins: corsOrigins(env) });
  await app.register(helmetPlugin);
  await app.register(rateLimitPlugin);
  await app.register(swaggerPlugin);

  // 3. Modo instalación: solo el asistente de instalación.
  if (!state.installed) {
    await app.register(setupRoutes, { prefix: API_PREFIX });
    app.log.info('webs no instalado — asistente de instalación disponible en /api/v1/setup');
    return app;
  }

  // 4. Modo instalado: base de datos, autenticación y tiempo real.
  await app.register(dbPlugin, { databaseUrl: state.databaseUrl });
  await app.register(redisPlugin, { redisUrl: env.REDIS_URL });
  await app.register(authPlugin, { jwtSecret: env.JWT_SECRET });
  await app.register(websocketPlugin);

  // 5. Módulos de dominio (bajo /api/v1).
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(usersRoutes, { prefix: API_PREFIX });
  await app.register(rolesRoutes, { prefix: API_PREFIX });
  await app.register(settingsRoutes, { prefix: API_PREFIX });
  await app.register(contentRoutes, { prefix: API_PREFIX });
  await app.register(translationsRoutes, { prefix: API_PREFIX });
  await app.register(auditRoutes, { prefix: API_PREFIX });
  await app.register(blocksRoutes, { prefix: API_PREFIX });
  await app.register(emailRoutes, { prefix: API_PREFIX });
  await app.register(i18nRoutes, { prefix: API_PREFIX });

  // 6. Bloques instalados (cargan sus plugins, rutas, settings, slots y permisos).
  await registerBlocks(app);

  // 7. Cola de envío de correos en segundo plano.
  startQueueProcessor(app);

  return app;
}
