import type { FastifyInstance } from 'fastify';
import { AVAILABLE_LOCALES } from '@webs/i18n';
import { buildResources, getDefaultLocale, getEnabledLocales } from './service';

/**
 * Endpoints públicos de internacionalización:
 *  - `GET /public/locales` → catálogo de idiomas disponibles.
 *  - `GET /public/i18n` → idiomas habilitados y sus recursos (solo esos).
 */
export default async function i18nRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/public/locales',
    { schema: { tags: ['i18n'] } },
    async () => ({ locales: AVAILABLE_LOCALES }),
  );

  fastify.get(
    '/public/i18n',
    { schema: { tags: ['i18n'] } },
    async () => {
      const locales = await getEnabledLocales(fastify);
      const resources = await buildResources(fastify, locales);
      return { locales, defaultLocale: await getDefaultLocale(fastify), resources };
    },
  );
}
