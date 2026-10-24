import Fastify, { type FastifyInstance } from 'fastify';
import { API_PREFIX, REFRESH_TOKEN_COOKIE } from '@webs/core';
import { loadEnv, corsOrigins, type Env } from './config/env';
import { createLogger } from './lib/logger';
import { readState } from './lib/state';
import { writeState } from './lib/state';
import { loadTls } from './lib/tls';

import configPlugin from './plugins/config';
import dbPlugin from './plugins/db';
import redisPlugin from './plugins/redis';
import corsPlugin from './plugins/cors';
import helmetPlugin from './plugins/helmet';
import rateLimitPlugin from './plugins/rate-limit';
import sensiblePlugin from './plugins/sensible';
import swaggerPlugin from './plugins/swagger';
import authPlugin from './plugins/auth';
import tenantPlugin from './plugins/tenant';
import errorHandlerPlugin from './plugins/error-handler';
import websocketPlugin from './plugins/websocket';
import securityPlugin from './plugins/security';
import eventsPlugin from './plugins/events';
import paymentsPlugin from './plugins/payments';
import shippingPlugin from './plugins/shipping';
import storagePlugin from './plugins/storage';
import notificationsPlugin from './plugins/notifications';
import licensePlugin from './plugins/license';

import healthRoutes from './modules/health';
import metricsRoutes from './modules/metrics';
import templatesRoutes from './modules/templates';
import { applyTemplate } from './modules/templates';
import paymentsRoutes from './modules/payments/routes';
import mediaRoutes from './modules/media/routes';
import notificationsRoutes from './modules/notifications/routes';
import expensesRoutes from './modules/expenses';
import systemRoutes from './modules/system';
import scalingRoutes from './modules/scaling';
import updateRoutes from './modules/update';
import pluginUpdateRoutes from './modules/update/plugins';
import pagesRoutes from './modules/pages/routes';
import menuRoutes from './modules/menu/routes';
import authRoutes from './modules/auth';
import passkeyRoutes from './modules/auth/passkeys';
import usersRoutes from './modules/users';
import rolesRoutes from './modules/roles';
import settingsRoutes from './modules/settings';
import { getSectionValue } from './modules/settings/service';
import contentRoutes from './modules/content';
import translationsRoutes from './modules/translations';
import auditRoutes from './modules/audit';
import pluginsRoutes, { pluginCrudRoutes } from './modules/plugins';
import setupRoutes from './modules/setup';
import emailRoutes, { startQueueProcessor } from './modules/email';
import i18nRoutes from './modules/i18n';
import apiTokensRoutes from './modules/api-tokens';
import licenseRoutes from './modules/licenses';
import generatedRoutes from './modules/generated';
import supportRoutes from './modules/support';
import inventoryModule from './modules/inventory';
import trackingRoutes from './modules/email/tracking';
import { startScheduler } from './modules/email/scheduler';

import { registerPlugins } from './plugins/loader';
import { seedDefaultEmailTemplates } from './modules/email/seed';

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
  const tls = loadTls(env);

  const app = Fastify({
    logger: options.logger === false ? false : createLogger(env.LOG_LEVEL),
    trustProxy: true,
    ...(tls ? { https: tls } : {}),
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

  // 2b. Salud siempre disponible (liveness/readiness): en un clúster limpio los
  //     probes de k8s deben responder antes de la instalación (F3/t43). /health
  //     responde 200 sin dependencias; /health/ready responde 503 hasta que la
  //     DB esté disponible (no 404).
  await app.register(healthRoutes);

  // 3. Modo instalación: solo el asistente de instalación.
  if (!state.installed) {
    await app.register(setupRoutes, { prefix: API_PREFIX });
    app.log.info('webs no instalado — asistente de instalación disponible en /api/v1/setup');
    return app;
  }

  // 4. Modo instalado: base de datos, seguridad, autenticación y tiempo real.
  await app.register(dbPlugin, { databaseUrl: state.databaseUrl });
  await app.register(redisPlugin, { redisUrl: env.REDIS_URL });
  await app.register(securityPlugin);
  await app.register(eventsPlugin);
  await app.register(paymentsPlugin);
  await app.register(shippingPlugin);
  await app.register(storagePlugin);
  await app.register(notificationsPlugin);
  await app.register(authPlugin, { jwtSecret: env.JWT_SECRET });
  await app.register(tenantPlugin);
  await app.register(websocketPlugin);
  await app.register(licensePlugin, { publicKey: env.LICENSE_PUBLIC_KEY });

  // Modo mantenimiento: bloquea rutas públicas salvo whitelist / autenticadas.
  await app.addHook('onRequest', async (request, reply) => {
    try {
      const section = (await getSectionValue(app, 'maintenance')) as { value?: Record<string, unknown> };
      if (!section.value?.maintenanceMode) return;
    } catch {
      return;
    }
    const url = request.url;
    if (
      url.startsWith('/health') ||
      url.startsWith('/api/v1/setup') ||
      url.startsWith('/api/v1/auth') ||
      url.startsWith('/api/v1/public')
    ) {
      return;
    }
    if (request.headers.authorization?.startsWith('Bearer ') || request.cookies?.[REFRESH_TOKEN_COOKIE]) {
      return;
    }
    return reply.status(503).send({ error: { code: 'MAINTENANCE_MODE', message: 'Sitio en mantenimiento' } });
  });

  // 5. Módulos de dominio (bajo /api/v1).
  await app.register(metricsRoutes, { prefix: API_PREFIX });
  await app.register(templatesRoutes, { prefix: API_PREFIX });
  await app.register(paymentsRoutes, { prefix: API_PREFIX });
  await app.register(mediaRoutes, { prefix: API_PREFIX });
  await app.register(notificationsRoutes, { prefix: API_PREFIX });
  await app.register(expensesRoutes, { prefix: API_PREFIX });
  await app.register(systemRoutes, { prefix: API_PREFIX });
  await app.register(scalingRoutes, { prefix: API_PREFIX });
  await app.register(updateRoutes, { prefix: API_PREFIX });
  await app.register(pluginUpdateRoutes, { prefix: API_PREFIX });
  await app.register(pagesRoutes, { prefix: API_PREFIX });
  await app.register(menuRoutes, { prefix: API_PREFIX });
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(passkeyRoutes, { prefix: API_PREFIX });
  await app.register(usersRoutes, { prefix: API_PREFIX });
  await app.register(rolesRoutes, { prefix: API_PREFIX });
  await app.register(settingsRoutes, { prefix: API_PREFIX });
  await app.register(contentRoutes, { prefix: API_PREFIX });
  await app.register(translationsRoutes, { prefix: API_PREFIX });
  await app.register(auditRoutes, { prefix: API_PREFIX });
  await app.register(pluginsRoutes, { prefix: API_PREFIX });
  // Retrocompatibilidad M1: /api/v1/blocks/* → mismas rutas CRUD de plugins.
  await app.register(pluginCrudRoutes, { prefix: `${API_PREFIX}/blocks` });
  await app.register(emailRoutes, { prefix: API_PREFIX });
  await app.register(i18nRoutes, { prefix: API_PREFIX });
  await app.register(apiTokensRoutes, { prefix: API_PREFIX });
  await app.register(licenseRoutes, { prefix: API_PREFIX });
  await app.register(generatedRoutes, { prefix: API_PREFIX });
  await app.register(supportRoutes, { prefix: API_PREFIX });
  await app.register(inventoryModule, { prefix: API_PREFIX });
  await app.register(trackingRoutes, { prefix: API_PREFIX });

  // 6. Plugins instalados (cargan sus plugins, rutas, settings, slots y permisos).
  await registerPlugins(app);

  // 6a. Siembra plantillas de correo por defecto (verificación, reset, bienvenida).
  await seedDefaultEmailTemplates(app);

  // 6b. Aplica la plantilla elegida en la instalación (si corresponde).
  if (state.pendingTemplate) {
    try {
      await applyTemplate(app, state.pendingTemplate);
      app.log.info({ template: state.pendingTemplate }, 'plantilla aplicada tras la instalación');
    } catch (err) {
      app.log.warn({ err, template: state.pendingTemplate }, 'no se pudo aplicar la plantilla');
    }
    writeState({ ...state, pendingTemplate: undefined });
  }

  // 7. Cola de envío y programador de campañas en segundo plano.
  startQueueProcessor(app);
  startScheduler(app);

  return app;
}
