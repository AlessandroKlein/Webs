import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { NotFoundError, ValidationError } from '@webs/core';
import { parseBlockManifest } from '@webs/plugin-sdk';
import { blockRegistry } from '../../blocks/registry';
import { installBlock, installBlockWithDependencies, installRemoteBlock, uninstallBlock, updateBlock, getMissingDependencies } from '../../blocks/loader';
import { findRemoteBlock, getCatalog } from '../../blocks/catalog';
import { audit } from '../../lib/audit';

const ajv = new Ajv({ allErrors: true, strict: false });

function serializeInstallation(inst: {
  id: string;
  blockId: string;
  name: string;
  version: string;
  enabled: boolean;
  config: unknown;
  manifest: unknown;
  installedAt: Date;
}) {
  return {
    id: inst.id,
    blockId: inst.blockId,
    name: inst.name,
    version: inst.version,
    enabled: inst.enabled,
    config: inst.config,
    manifest: inst.manifest,
    installedAt: inst.installedAt.toISOString(),
  };
}

export default async function blocksRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Lectura pública (sitio público, sin autenticación) --------

  fastify.get(
    '/public/placements',
    {
      schema: {
        tags: ['blocks'],
        querystring: { type: 'object', properties: { slotId: { type: 'string' } } },
      },
    },
    async (request) => {
      const slotId = (request.query as { slotId?: string }).slotId;
      const where = slotId ? { slotId, enabled: true } : { enabled: true };
      return fastify.prisma.blockPlacement.findMany({
        where,
        orderBy: [{ slotId: 'asc' }, { order: 'asc' }],
      });
    },
  );

  // -------- Catálogo e instalaciones --------

  fastify.get(
    '/blocks',
    { schema: { tags: ['blocks'] }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async () => {
      const [installations, catalog] = await Promise.all([
        fastify.prisma.blockInstallation.findMany({ orderBy: { installedAt: 'desc' } }),
        Promise.resolve(blockRegistry.getAvailable()),
      ]);

      const installedIds = new Set(installations.map((i) => i.blockId));
      return {
        installed: installations.map(serializeInstallation),
        catalog: catalog.map((manifest) => ({
          ...manifest,
          installed: installedIds.has(manifest.id),
        })),
      };
    },
  );

  fastify.get(
    '/blocks/catalog',
    { schema: { tags: ['blocks'] }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async () => getCatalog(fastify),
  );

  fastify.post(
    '/blocks/install',
    {
      schema: {
        tags: ['blocks'],
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            source: { type: 'string', enum: ['git', 'npm'] },
            url: { type: 'string' },
            subdir: { type: 'string' },
            autoDependencies: { type: 'boolean', default: true },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request, reply) => {
      const body = request.body as { id: string; source?: 'git' | 'npm'; url?: string; subdir?: string; autoDependencies?: boolean };
      const id = body.id;
      const autoDeps = body.autoDependencies !== false;

      // Si no queremos autoinstalar dependencias, devolvemos las que faltan (diálogo).
      if (!autoDeps) {
        const manifest = blockRegistry.getAvailableManifest(id);
        const missingDependencies = manifest ? await getMissingDependencies(fastify, manifest) : [];
        return reply.send({ id, missingDependencies });
      }

      let result;
      if (blockRegistry.getAvailableManifest(id)) {
        result = await installBlockWithDependencies(fastify, id);
      } else if (body.url) {
        result = await installRemoteBlock(fastify, {
          id,
          name: id,
          version: 'latest',
          source: body.source ?? 'git',
          url: body.url,
          subdir: body.subdir,
        });
      } else {
        const entry = await findRemoteBlock(id);
        if (!entry) throw new NotFoundError(`Bloque '${id}' no encontrado en el catálogo`);
        result = await installRemoteBlock(fastify, entry);
      }

      audit(fastify, request, { actorId: request.user?.sub, action: 'block.install', resource: 'block', resourceId: id });
      return reply.status(201).send(result);
    },
  );

  fastify.post(
    '/blocks/:id/activate',
    {
      schema: { tags: ['blocks'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Bloque');
      await fastify.prisma.blockInstallation.update({ where: { blockId }, data: { enabled: true } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'block.activate', resource: 'block', resourceId: blockId });
      return { enabled: true };
    },
  );

  // Actualiza un bloque instalado a su última versión (preserva config).
  fastify.post(
    '/blocks/:id/update',
    {
      schema: { tags: ['blocks'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const result = await updateBlock(fastify, blockId);
      audit(fastify, request, { actorId: request.user?.sub, action: 'block.update', resource: 'block', resourceId: blockId });
      return result;
    },
  );

  fastify.post(
    '/blocks/:id/deactivate',
    {
      schema: { tags: ['blocks'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Bloque');
      await fastify.prisma.blockInstallation.update({ where: { blockId }, data: { enabled: false } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'block.deactivate', resource: 'block', resourceId: blockId });
      return { enabled: false };
    },
  );

  fastify.delete(
    '/blocks/:id',
    {
      schema: { tags: ['blocks'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request, reply) => {
      const blockId = (request.params as { id: string }).id;
      await uninstallBlock(fastify, blockId);
      audit(fastify, request, { actorId: request.user?.sub, action: 'block.uninstall', resource: 'block', resourceId: blockId });
      return reply.status(204).send();
    },
  );

  // -------- Configuración de un bloque --------

  fastify.get(
    '/blocks/:id/settings',
    {
      schema: { tags: ['blocks'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Bloque');
      const manifest = parseBlockManifest(inst.manifest);
      return { blockId, schema: manifest.settings ?? null, value: inst.config };
    },
  );

  fastify.put(
    '/blocks/:id/settings',
    {
      schema: { tags: ['blocks'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Bloque');
      const manifest = parseBlockManifest(inst.manifest);
      const value = request.body;

      if (manifest.settings) {
        const validate = ajv.compile(manifest.settings);
        if (!validate(value)) {
          throw new ValidationError(
            'Configuración de bloque inválida',
            (validate.errors ?? []).map((e) => ({
              field: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || undefined,
              message: e.message ?? 'valor inválido',
            })),
          );
        }
      }

      await fastify.prisma.blockInstallation.update({
        where: { blockId },
        data: { config: value as object },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'block.settings', resource: 'block', resourceId: blockId });
      return { blockId, value };
    },
  );

  // -------- Slots y colocaciones --------

  fastify.get(
    '/slots',
    { schema: { tags: ['blocks'] }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async () => blockRegistry.getSlots(),
  );

  fastify.get(
    '/placements',
    {
      schema: {
        tags: ['blocks'],
        querystring: { type: 'object', properties: { slotId: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('block.read')],
    },
    async (request) => {
      const slotId = (request.query as { slotId?: string }).slotId;
      const where = slotId ? { slotId } : {};
      const placements = await fastify.prisma.blockPlacement.findMany({
        where,
        orderBy: [{ slotId: 'asc' }, { order: 'asc' }],
      });
      return placements;
    },
  );

  fastify.put(
    '/placements',
    {
      schema: {
        tags: ['blocks'],
        body: {
          type: 'object',
          required: ['slotId', 'blocks'],
          properties: {
            slotId: { type: 'string' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                required: ['blockId'],
                properties: {
                  blockId: { type: 'string' },
                  order: { type: 'integer' },
                  enabled: { type: 'boolean' },
                  config: { type: 'object' },
                },
              },
            },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const { slotId, blocks } = request.body as {
        slotId: string;
        blocks: { blockId: string; order?: number; enabled?: boolean; config?: object }[];
      };

      await fastify.prisma.$transaction([
        fastify.prisma.blockPlacement.deleteMany({ where: { slotId } }),
        fastify.prisma.blockPlacement.createMany({
          data: blocks.map((b, i) => ({
            blockId: b.blockId,
            slotId,
            order: b.order ?? i,
            enabled: b.enabled ?? true,
            config: b.config ?? {},
          })),
        }),
      ]);

      audit(fastify, request, { actorId: request.user?.sub, action: 'block.placements', resource: 'slot', resourceId: slotId });
      return fastify.prisma.blockPlacement.findMany({ where: { slotId }, orderBy: { order: 'asc' } });
    },
  );
}
