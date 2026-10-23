import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { audit } from '../../lib/audit';
import { collectPluginMenuItems } from '../../lib/plugin-menu';

/**
 * Administración del menú público (tabla `menus`, clave `main`).
 * - `GET  /menu`  → devuelve `{ items: [{ label, path, order }] }`.
 * - `PUT  /menu`  → reemplaza los items (upsert de la clave `main`).
 *
 * La lectura pública equivalente vive en `settings/routes.ts` (`GET /public/menu`),
 * que es lo que consume el encabezado del sitio.
 */

interface MenuItem {
  label: string;
  path: string;
  order?: number;
}

/** Normaliza y valida los items recibidos (descarta los inválidos). */
function normalizeItems(items: unknown): MenuItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === 'object')
    .map((it, index) => ({
      label: typeof it.label === 'string' ? it.label.trim() : '',
      path: typeof it.path === 'string' ? it.path.trim() : '',
      order: typeof it.order === 'number' ? it.order : index,
    }))
    .filter((it) => it.label !== '' && it.path !== '');
}

export default async function menuRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Administración: lectura del menú principal --------
  fastify.get(
    '/menu',
    { schema: { tags: ['menu'] }, preHandler: [fastify.authenticate, fastify.authorize('setting.read')] },
    async () => {
      const menu = await fastify.prisma.menu.findUnique({ where: { key: 'main' } });
      const coreItems = normalizeItems(menu?.items).map((item) => ({ ...item, feature: 'core' }));
      const pluginItems = collectPluginMenuItems('admin');
      return { items: [...coreItems, ...pluginItems] };
    },
  );

  // -------- Administración: reemplazo del menú principal --------
  fastify.put(
    '/menu',
    {
      schema: {
        tags: ['menu'],
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['label', 'path'],
                properties: {
                  label: { type: 'string' },
                  path: { type: 'string' },
                  order: { type: 'number' },
                },
              },
            },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const { items } = request.body as { items: unknown };
      const normalized = normalizeItems(items);
      const menu = await fastify.prisma.menu.upsert({
        where: { key: 'main' },
        update: { name: 'Menú principal', items: normalized as unknown as Prisma.InputJsonValue },
        create: { key: 'main', name: 'Menú principal', items: normalized as unknown as Prisma.InputJsonValue },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'menu.update', resource: 'menu', resourceId: menu.id });
      return { items: normalized };
    },
  );
}
