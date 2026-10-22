import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError, ValidationError } from '@webs/core';
import { parsePluginManifest } from '@webs/plugin-sdk';
import { pluginRegistry } from '../../plugins/registry';
import { installPluginWithDependencies, installRemotePlugin, uninstallPlugin, updatePlugin, getMissingDependencies, getProviders, getMissingProviders } from '../../plugins/loader';
import { findRemotePlugin, getCatalog } from '../../plugins/catalog';
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

/**
 * Rutas CRUD de plugins. Se registran bajo `/plugins` (canónico) y, durante la
 * migración M1, también bajo `/blocks` (alias de retrocompatibilidad).
 */
export async function pluginCrudRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Catálogo e instalaciones --------

  fastify.get(
    '/',
    { schema: { tags: ['plugins'] }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async () => {
      const [installations, catalog] = await Promise.all([
        fastify.prisma.blockInstallation.findMany({ orderBy: { installedAt: 'desc' } }),
        Promise.resolve(pluginRegistry.getAvailable()),
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
    '/catalog',
    { schema: { tags: ['plugins'] }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async () => getCatalog(fastify),
  );

  // Lista los plugins que proveen un grupo (ej. `payment`) para el selector.
  fastify.get(
    '/providers/:group',
    { schema: { tags: ['plugins'], params: { type: 'object', properties: { group: { type: 'string' } } } }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async (request) => {
      const group = (request.params as { group: string }).group;
      const providers = await getProviders(fastify, group);
      return { group, providers };
    },
  );

  fastify.post(
    '/install',
    {
      schema: {
        tags: ['plugins'],
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            source: { type: 'string', enum: ['git', 'npm'] },
            url: { type: 'string' },
            subdir: { type: 'string' },
            sha256: { type: 'string' },
            publicKey: { type: 'string' },
            signature: { type: 'string' },
            autoDependencies: { type: 'boolean', default: true },
            providers: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request, reply) => {
      const body = request.body as { id: string; source?: 'git' | 'npm'; url?: string; subdir?: string; sha256?: string; publicKey?: string; signature?: string; autoDependencies?: boolean; providers?: Record<string, string[]> };
      const id = body.id;
      const autoDeps = body.autoDependencies !== false;

      // Si no queremos autoinstalar dependencias, devolvemos las que faltan (diálogo).
      if (!autoDeps) {
        const manifest = pluginRegistry.getAvailableManifest(id);
        const missingDependencies = manifest ? await getMissingDependencies(fastify, manifest) : [];
        const missingProviders = manifest ? await getMissingProviders(fastify, manifest) : [];
        return reply.send({ id, missingDependencies, missingProviders });
      }

      // Si el plugin necesita proveedores y no hay ninguno instalado ni elegido,
      // devolvemos el selector (grupos + opciones) para que el usuario elija.
      const localManifest = pluginRegistry.getAvailableManifest(id);
      if (localManifest && !body.providers) {
        const missingProviders = await getMissingProviders(fastify, localManifest);
        if (missingProviders.length) {
          return reply.send({ id, needsProviderSelection: true, missingProviders });
        }
      }

      // Instala los proveedores elegidos (por grupo → ids) antes que el plugin.
      const installedProviders: string[] = [];
      for (const ids of Object.values(body.providers ?? {})) {
        for (const pid of ids) {
          const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId: pid } });
          if (!inst) {
            await installPluginWithDependencies(fastify, pid);
            installedProviders.push(pid);
          }
        }
      }

      let result;
      if (pluginRegistry.getAvailableManifest(id)) {
        result = await installPluginWithDependencies(fastify, id);
      } else if (body.url) {
        // F2 (P0): la instalación por URL directa queda PROHIBIDA sin firma
        // verificable. El manifest descargado debe venir firmado (Ed25519) y con
        // su sha256; `installRemotePlugin` valida ambas antes de ejecutar código.
        if (!body.publicKey || !body.signature || !body.sha256) {
          throw new BadRequestError(
            'La instalación por URL requiere firma Ed25519 (publicKey + signature) y sha256 del manifiesto',
          );
        }
        result = await installRemotePlugin(fastify, {
          id,
          name: id,
          version: 'latest',
          source: body.source ?? 'git',
          url: body.url,
          subdir: body.subdir,
          sha256: body.sha256,
          publicKey: body.publicKey,
          signature: body.signature,
        });
      } else {
        const entry = await findRemotePlugin(id);
        if (!entry) throw new NotFoundError(`Plugin '${id}' no encontrado en el catálogo`);
        result = await installRemotePlugin(fastify, entry);
      }

      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.install', resource: 'plugin', resourceId: id });
      return reply.status(201).send({ ...result, installedProviders });
    },
  );

  fastify.post(
    '/:id/activate',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Plugin');
      await fastify.prisma.blockInstallation.update({ where: { blockId }, data: { enabled: true } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.activate', resource: 'plugin', resourceId: blockId });
      return { enabled: true };
    },
  );

  // Actualiza un plugin instalado a su última versión (preserva config).
  fastify.post(
    '/:id/update',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const result = await updatePlugin(fastify, blockId);
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.update', resource: 'plugin', resourceId: blockId });
      return result;
    },
  );

  fastify.post(
    '/:id/deactivate',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Plugin');
      await fastify.prisma.blockInstallation.update({ where: { blockId }, data: { enabled: false } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.deactivate', resource: 'plugin', resourceId: blockId });
      return { enabled: false };
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('block.manage')],
    },
    async (request, reply) => {
      const blockId = (request.params as { id: string }).id;
      await uninstallPlugin(fastify, blockId);
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.uninstall', resource: 'plugin', resourceId: blockId });
      return reply.status(204).send();
    },
  );

  // -------- Configuración de un plugin --------

  fastify.get(
    '/:id/settings',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Plugin');
      const manifest = parsePluginManifest(inst.manifest);
      return { blockId, schema: manifest.settings ?? null, value: inst.config };
    },
  );

  fastify.put(
    '/:id/settings',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const blockId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId } });
      if (!inst) throw new NotFoundError('Plugin');
      const manifest = parsePluginManifest(inst.manifest);
      const value = request.body;

      if (manifest.settings) {
        const validate = ajv.compile(manifest.settings);
        if (!validate(value)) {
          throw new ValidationError(
            'Configuración de plugin inválida',
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
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.settings', resource: 'plugin', resourceId: blockId });
      return { blockId, value };
    },
  );
}

export default async function pluginsRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Lectura pública (sitio público, sin autenticación) --------

  fastify.get(
    '/public/placements',
    {
      schema: {
        tags: ['plugins'],
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

  // -------- Slots y colocaciones --------

  fastify.get(
    '/slots',
    { schema: { tags: ['plugins'] }, preHandler: [fastify.authenticate, fastify.authorize('block.read')] },
    async () => pluginRegistry.getSlots(),
  );

  fastify.get(
    '/placements',
    {
      schema: {
        tags: ['plugins'],
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
        tags: ['plugins'],
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

      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.placements', resource: 'slot', resourceId: slotId });
      return fastify.prisma.blockPlacement.findMany({ where: { slotId }, orderBy: { order: 'asc' } });
    },
  );

  // -------- CRUD de plugins (canónico bajo `/plugins`) --------
  await fastify.register(pluginCrudRoutes, { prefix: '/plugins' });
}
