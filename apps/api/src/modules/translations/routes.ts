import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '@webs/core';
import { audit } from '../../lib/audit';

interface TranslationBody {
  locale: string;
  namespace?: string;
  key: string;
  value: string;
}

const translationBodySchema = {
  type: 'object',
  required: ['locale', 'key', 'value'],
  properties: {
    locale: { type: 'string', minLength: 1 },
    namespace: { type: 'string', minLength: 1, default: 'translation' },
    key: { type: 'string', minLength: 1 },
    value: { type: 'string' },
  },
} as const;

export default async function translationsRoutes(fastify: FastifyInstance): Promise<void> {
  // Idiomas disponibles para el selector de filtros del panel.
  fastify.get(
    '/locales',
    { schema: { tags: ['translations'] } },
    async () => ({ locales: ['es', 'en'], defaultLocale: 'es' }),
  );

  // Listar traducciones (filtros opcionales por locale y namespace).
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
      const where: Prisma.TranslationWhereInput = {};
      if (locale) where.locale = locale;
      if (namespace) where.namespace = namespace;

      const items = await fastify.prisma.translation.findMany({
        where,
        orderBy: [{ locale: 'asc' }, { namespace: 'asc' }, { key: 'asc' }],
      });
      return { items };
    },
  );

  // Crear una traducción (o actualizarla si ya existe la misma clave natural).
  fastify.post(
    '/translations',
    {
      schema: { tags: ['translations'], body: translationBodySchema },
      preHandler: [fastify.authenticate, fastify.authorize('translation.write')],
    },
    async (request) => {
      const { locale, namespace = 'translation', key, value } = request.body as TranslationBody;

      const saved = await fastify.prisma.translation.upsert({
        where: { locale_namespace_key: { locale, namespace, key } },
        update: { value },
        create: { locale, namespace, key, value },
      });

      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'translation.update',
        resource: 'translation',
        resourceId: saved.id,
        metadata: { locale, namespace, key },
      });
      return saved;
    },
  );

  // Editar una traducción existente por id.
  fastify.put(
    '/translations/:id',
    {
      schema: {
        tags: ['translations'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: translationBodySchema,
      },
      preHandler: [fastify.authenticate, fastify.authorize('translation.write')],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const { locale, namespace = 'translation', key, value } = request.body as TranslationBody;

      const existing = await fastify.prisma.translation.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Traducción');

      const conflict = await fastify.prisma.translation.findUnique({
        where: { locale_namespace_key: { locale, namespace, key } },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictError('Ya existe una traducción con ese locale, namespace y clave');
      }

      const updated = await fastify.prisma.translation.update({
        where: { id },
        data: { locale, namespace, key, value },
      });

      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'translation.update',
        resource: 'translation',
        resourceId: id,
        metadata: { locale, namespace, key },
      });
      return updated;
    },
  );

  // Eliminar una traducción por id.
  fastify.delete(
    '/translations/:id',
    {
      schema: { tags: ['translations'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('translation.write')],
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const existing = await fastify.prisma.translation.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Traducción');

      await fastify.prisma.translation.delete({ where: { id } });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'translation.delete',
        resource: 'translation',
        resourceId: id,
      });
      return reply.status(204).send();
    },
  );
}
