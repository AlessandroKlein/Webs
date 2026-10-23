import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError, ValidationError } from '@webs/core';
import { parsePluginManifest } from '@webs/plugin-sdk';
import { pluginRegistry } from '../../plugins/registry';
import { installPluginWithDependencies, installRemotePlugin, uninstallPlugin, updatePlugin, getMissingDependencies, getProviders, getMissingProviders } from '../../plugins/loader';
import { findRemotePlugin, getCatalog } from '../../plugins/catalog';
import { audit } from '../../lib/audit';
import { decryptSecretFields, encryptSecretFields, redactSecretFields, restoreMaskedSecrets } from '../../lib/crypto';
import { resolveFeature } from '../../lib/feature-gating';

const ajv = new Ajv({ allErrors: true, strict: false });

function serializeInstallation(inst: {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  enabled: boolean;
  config: unknown;
  manifest: unknown;
  installedAt: Date;
}) {
  const manifest = parsePluginManifest(inst.manifest);
  const config = inst.config !== null && typeof inst.config === 'object' && !Array.isArray(inst.config)
    ? redactSecretFields(manifest.settings, inst.config as Record<string, unknown>)
    : inst.config;
  return {
    id: inst.id,
    pluginId: inst.pluginId,
    name: inst.name,
    version: inst.version,
    enabled: inst.enabled,
    config,
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
    { schema: { tags: ['plugins'] }, preHandler: [fastify.authenticate, fastify.authorize('plugin.read')] },
    async () => {
      const [installations, catalog] = await Promise.all([
        fastify.prisma.pluginInstallation.findMany({ orderBy: { installedAt: 'desc' } }),
        Promise.resolve(pluginRegistry.getAvailable()),
      ]);

      const installedIds = new Set(installations.map((i) => i.pluginId));
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
    { schema: { tags: ['plugins'] }, preHandler: [fastify.authenticate, fastify.authorize('plugin.read')] },
    async () => getCatalog(fastify),
  );

  // Lista los plugins que proveen un grupo (ej. `payment`) para el selector.
  fastify.get(
    '/providers/:group',
    { schema: { tags: ['plugins'], params: { type: 'object', properties: { group: { type: 'string' } } } }, preHandler: [fastify.authenticate, fastify.authorize('plugin.read')] },
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
      preHandler: [fastify.authenticate, fastify.authorize('plugin.manage')],
    },
    async (request, reply) => {
      const body = request.body as { id: string; source?: 'git' | 'npm'; url?: string; subdir?: string; sha256?: string; publicKey?: string; signature?: string; autoDependencies?: boolean; providers?: Record<string, string[]> };
      const id = body.id;
      const autoDeps = body.autoDependencies !== false;

      // ADR-0019 (feature-gating): la instalación es la frontera autoritativa.
      // Un plugin con `feature` premium no licenciada se rechaza con 403, sin
      // importar lo que el cliente haya filtrado en su catálogo.
      const gatingManifest = pluginRegistry.getAvailableManifest(id);
      const gatingEntry = gatingManifest ? undefined : await findRemotePlugin(id);
      const feature = resolveFeature(gatingManifest?.feature ?? gatingEntry?.feature);
      if (!fastify.license.hasFeature(feature)) {
        return reply.code(403).send({
          error: 'feature_not_licensed',
          feature,
          message: `Este plugin requiere la feature premium "${feature}", que no está incluida en tu licencia.`,
        });
      }

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
          const inst = await fastify.prisma.pluginInstallation.findUnique({ where: { pluginId: pid } });
          if (!inst) {
            await installPluginWithDependencies(fastify, pid);
            installedProviders.push(pid);
          }
        }
      }

      let result;
      if (body.url) {
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
        // ADR-0016: el índice del registro es la única fuente de verdad de origen.
        // Preferimos la descarga remota (sha256 + Ed25519) cuando el plugin está en
        // el catálogo; el paquete en disco queda como fallback de desarrollo.
        const entry = await findRemotePlugin(id);
        if (entry) {
          result = await installRemotePlugin(fastify, entry);
        } else if (pluginRegistry.getAvailableManifest(id)) {
          result = await installPluginWithDependencies(fastify, id);
        } else {
          throw new NotFoundError(`Plugin '${id}' no encontrado en el catálogo`);
        }
      }

      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.install', resource: 'plugin', resourceId: id });
      return reply.status(201).send({ ...result, installedProviders });
    },
  );

  fastify.post(
    '/:id/activate',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('plugin.manage')],
    },
    async (request) => {
      const pluginId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.pluginInstallation.findUnique({ where: { pluginId } });
      if (!inst) throw new NotFoundError('Plugin');
      await fastify.prisma.pluginInstallation.update({ where: { pluginId }, data: { enabled: true } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.activate', resource: 'plugin', resourceId: pluginId });
      return { enabled: true };
    },
  );

  // Actualiza un plugin instalado a su última versión (preserva config).
  fastify.post(
    '/:id/update',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('plugin.manage')],
    },
    async (request) => {
      const pluginId = (request.params as { id: string }).id;
      const result = await updatePlugin(fastify, pluginId);
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.update', resource: 'plugin', resourceId: pluginId });
      return result;
    },
  );

  fastify.post(
    '/:id/deactivate',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('plugin.manage')],
    },
    async (request) => {
      const pluginId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.pluginInstallation.findUnique({ where: { pluginId } });
      if (!inst) throw new NotFoundError('Plugin');
      await fastify.prisma.pluginInstallation.update({ where: { pluginId }, data: { enabled: false } });
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.deactivate', resource: 'plugin', resourceId: pluginId });
      return { enabled: false };
    },
  );

  fastify.delete(
    '/:id',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('plugin.manage')],
    },
    async (request, reply) => {
      const pluginId = (request.params as { id: string }).id;
      await uninstallPlugin(fastify, pluginId);
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.uninstall', resource: 'plugin', resourceId: pluginId });
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
      const pluginId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.pluginInstallation.findUnique({ where: { pluginId } });
      if (!inst) throw new NotFoundError('Plugin');
      const manifest = parsePluginManifest(inst.manifest);
      const value = inst.config !== null && typeof inst.config === 'object' && !Array.isArray(inst.config)
        ? redactSecretFields(manifest.settings, inst.config as Record<string, unknown>)
        : inst.config;
      return { pluginId, schema: manifest.settings ?? null, value };
    },
  );

  fastify.put(
    '/:id/settings',
    {
      schema: { tags: ['plugins'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const pluginId = (request.params as { id: string }).id;
      const inst = await fastify.prisma.pluginInstallation.findUnique({ where: { pluginId } });
      if (!inst) throw new NotFoundError('Plugin');
      const manifest = parsePluginManifest(inst.manifest);
      const raw = request.body as Record<string, unknown>;
      const existingPlain = inst.config !== null && typeof inst.config === 'object' && !Array.isArray(inst.config)
        ? decryptSecretFields(manifest.settings, inst.config as Record<string, unknown>)
        : {};
      const value = restoreMaskedSecrets(manifest.settings, raw, existingPlain);

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

      const stored = encryptSecretFields(manifest.settings, value);
      await fastify.prisma.pluginInstallation.update({
        where: { pluginId },
        data: { config: stored as object },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.settings', resource: 'plugin', resourceId: pluginId });
      return { pluginId, value: redactSecretFields(manifest.settings, value) };
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
      return fastify.prisma.pluginPlacement.findMany({
        where,
        orderBy: [{ slotId: 'asc' }, { order: 'asc' }],
      });
    },
  );

  // -------- Slots y colocaciones --------

  fastify.get(
    '/slots',
    { schema: { tags: ['plugins'] }, preHandler: [fastify.authenticate, fastify.authorize('plugin.read')] },
    async () => pluginRegistry.getSlots(),
  );

  fastify.get(
    '/placements',
    {
      schema: {
        tags: ['plugins'],
        querystring: { type: 'object', properties: { slotId: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('plugin.read')],
    },
    async (request) => {
      const slotId = (request.query as { slotId?: string }).slotId;
      const where = slotId ? { slotId } : {};
      const placements = await fastify.prisma.pluginPlacement.findMany({
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
                required: ['pluginId'],
                properties: {
                  pluginId: { type: 'string' },
                  order: { type: 'integer' },
                  enabled: { type: 'boolean' },
                  config: { type: 'object' },
                },
              },
            },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('plugin.manage')],
    },
    async (request) => {
      const { slotId, blocks } = request.body as {
        slotId: string;
        blocks: { pluginId: string; order?: number; enabled?: boolean; config?: object }[];
      };

      await fastify.prisma.$transaction([
        fastify.prisma.pluginPlacement.deleteMany({ where: { slotId } }),
        fastify.prisma.pluginPlacement.createMany({
          data: blocks.map((b, i) => ({
            pluginId: b.pluginId,
            slotId,
            order: b.order ?? i,
            enabled: b.enabled ?? true,
            config: b.config ?? {},
          })),
        }),
      ]);

      audit(fastify, request, { actorId: request.user?.sub, action: 'plugin.placements', resource: 'slot', resourceId: slotId });
      return fastify.prisma.pluginPlacement.findMany({ where: { slotId }, orderBy: { order: 'asc' } });
    },
  );

  // -------- CRUD de plugins (canónico bajo `/plugins`) --------
  await fastify.register(pluginCrudRoutes, { prefix: '/plugins' });
}
