import type { FastifyInstance } from 'fastify';
import { audit } from '../../lib/audit';
import { cacheDel } from '../../lib/cache';
import { isCoreFeature, listFeatures } from './features';

export default async function licenseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.read')],
    },
    async () => fastify.license.verify(),
  );

  fastify.get(
    '/features',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.read')],
    },
    async () => {
      const state = fastify.license.verify();
      const active = new Set(state.status === 'active' ? state.features : []);
      return {
        features: listFeatures().map((feature) => ({
          key: feature.key,
          label: feature.label,
          description: feature.description,
          area: feature.area,
          core: feature.core,
          enabled: isCoreFeature(feature.key) || active.has(feature.key),
        })),
      };
    },
  );

  fastify.get(
    '/fingerprint',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.manage')],
    },
    async () => ({ fingerprint: fastify.license.fingerprint() }),
  );

  fastify.post(
    '/activate',
    {
      schema: {
        tags: ['license'],
        body: {
          type: 'object',
          required: ['activationKey'],
          properties: { activationKey: { type: 'string', minLength: 8 } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('license.manage')],
    },
    async (request) => {
      const { activationKey } = request.body as { activationKey: string };
      const result = fastify.license.activate(activationKey);
      // La licencia cambió → invalidar el catálogo cacheado (`licensed` por feature).
      await cacheDel(fastify.redis, 'blocks:catalog');
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'license.activate',
        resource: 'license',
        resourceId: result.payload.productId,
      });
      return { ok: true, status: fastify.license.status() };
    },
  );

  fastify.post(
    '/deactivate',
    {
      schema: { tags: ['license'] },
      preHandler: [fastify.authenticate, fastify.authorize('license.manage')],
    },
    async (request) => {
      fastify.license.deactivate();
      // La licencia cambió → invalidar el catálogo cacheado (`licensed` por feature).
      await cacheDel(fastify.redis, 'blocks:catalog');
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'license.deactivate',
        resource: 'license',
      });
      return { ok: true, status: fastify.license.status() };
    },
  );
}
