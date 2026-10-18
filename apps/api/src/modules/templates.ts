import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@webs/core';
import { installBlock, loadAndActivate } from '../blocks/loader';
import { blockRegistry } from '../blocks/registry';
import { templatesDir } from '../lib/paths';
import { audit } from '../lib/audit';

/**
 * Plantillas (presets): definen una composición de bloques + settings + menú
 * para montar un sitio (gimnasio, mercado, blog…) activando los bloques.
 *
 * Formato de cada `templates/<id>.json`:
 * ```json
 * {
 *   "id": "gym", "name": "Gimnasio", "description": "…",
 *   "blocks": [{ "id": "example", "config": { "greeting": "Hola" } }],
 *   "settings": { "site": { "name": "Mi Gimnasio" }, "appearance": { "primaryColor": "#16a34a" } },
 *   "menu": [{ "label": "Inicio", "path": "/", "order": 0 }]
 * }
 * ```
 */

interface TemplateBlock {
  id: string;
  config?: Record<string, unknown>;
}
interface Template {
  id: string;
  name: string;
  description?: string;
  blocks?: TemplateBlock[];
  settings?: Record<string, Record<string, unknown>>;
  menu?: Array<{ label: string; path: string; order?: number }>;
}

function readTemplates(): Template[] {
  const dir = templatesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Template;
      } catch {
        return null;
      }
    })
    .filter((t): t is Template => Boolean(t && t.id && t.name));
}

export async function applyTemplate(fastify: FastifyInstance, id: string) {
  const template = readTemplates().find((t) => t.id === id);
  if (!template) throw new NotFoundError('Plantilla');

  let blocksInstalled = 0;

  // 1) Instalar + configurar + activar bloques (best-effort).
  for (const b of template.blocks ?? []) {
    if (!blockRegistry.getAvailableManifest(b.id)) {
      fastify.log.warn({ blockId: b.id, template: id }, 'bloque no disponible; se omite');
      continue;
    }
    const existing = await fastify.prisma.blockInstallation.findUnique({ where: { blockId: b.id } });
    if (!existing) {
      await installBlock(fastify, b.id);
      blocksInstalled += 1;
    }
    if (b.config) {
      await fastify.prisma.blockInstallation.update({
        where: { blockId: b.id },
        data: { config: b.config as Prisma.InputJsonValue, enabled: true },
      });
    }
    if (!blockRegistry.getLoadedBlocks().some((l) => l.manifest.id === b.id)) {
      const inst = await fastify.prisma.blockInstallation.findUnique({ where: { blockId: b.id } });
      if (inst) await loadAndActivate(fastify, inst);
    }
  }

  // 2) Aplicar settings (site, appearance, …).
  for (const [key, value] of Object.entries(template.settings ?? {})) {
    await fastify.prisma.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, schemaKey: key },
      create: { key, value: value as Prisma.InputJsonValue, schemaKey: key },
    });
  }

  // 3) Crear/actualizar el menú principal.
  if (template.menu) {
    await fastify.prisma.menu.upsert({
      where: { key: 'main' },
      update: { name: 'Menú principal', items: template.menu as Prisma.InputJsonValue },
      create: { key: 'main', name: 'Menú principal', items: template.menu as Prisma.InputJsonValue },
    });
  }

  return { ok: true, template: template.id, blocksInstalled };
}

export default async function templatesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/templates',
    { schema: { tags: ['templates'] }, preHandler: [fastify.authenticate, fastify.authorize('setting.write')] },
    async () => readTemplates(),
  );

  fastify.post(
    '/templates/:id/apply',
    {
      schema: { tags: ['templates'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const result = await applyTemplate(fastify, id);
      audit(fastify, request, { actorId: request.user?.sub, action: 'template.apply', resource: 'template', resourceId: id });
      return result;
    },
  );
}
