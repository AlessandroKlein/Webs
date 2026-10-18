import type { FastifyInstance } from 'fastify';
import { audit } from '../../lib/audit';

export default async function translationsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/locales',
    { schema: { tags: ['translations'] } },
    async () => ({ locales: ['es', 'en'], defaultLocale: 'es' }),
  );

  fastify.get(
    '/translations',
    {
      schema: {
        tags: ['translations'],
        querystring: {
          type: 'object',
          properties: { locale: { type: 'string' }, namespace: { type: 'string' } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('translation.read')],
    },
    async (request) => {
      const { locale, namespace } = request.query as { locale?: string; namespace?: string };
      const where: Record<string, unknown> = {};
      if (locale) where.locale = locale;
      if (namespace) where.namespace = namespace;

      const translations = await fastify.prisma.translation.findMany({
        where,
        orderBy: { key: 'asc' },
      });

      const map: Record<string, string> = {};
      for (const t of translations) map[`${t.namespace}:${t.key}`] = t.value;
      return { items: translations, map };
    },
  );

  fastify.put(
    '/translations',
    {
      schema: {
        tags: ['translations'],
        body: {
          type: 'object',
          required: ['locale', 'key', 'value'],
          properties: {
            locale: { type: 'string' },
            namespace: { type: 'string', default: 'translation' },
            key: { type: 'string' },
            value: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('translation.write')],
    },
    async (request) => {
      const { locale, namespace = 'translation', key, value } = request.body as {
        locale: string;
        namespace?: string;
        key: string;
        value: string;
      };

      const saved = await fastify.prisma.translation.upsert({
        where: { locale_namespace_key: { locale, namespace, key } },
        update: { value },
        create: { locale, namespace, key, value },
      });

      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'translation.update',
        resource: 'translation',
        resourceId: `${locale}:${key}`,
      });
      return saved;
    },
  );
}
