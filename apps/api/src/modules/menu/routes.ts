import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { audit } from '../../lib/audit';
import { collectPluginMenuItems, type ResolvedPluginMenuItem } from '../../lib/plugin-menu';

/**
 * Administración del menú de administración (tabla `menus`, clave `admin`).
 * - `GET  /menu`  → devuelve `{ items: [{ label, path, order }] }`.
 * - `PUT  /menu`  → reemplaza los items (upsert de la clave `admin`).
 *
 * El menú PÚBLICO vive en la clave `main` (lectura en `settings/routes.ts`
 * `GET /public/menu`, sembrado por `templates.ts`), separado del panel admin.
 */

interface MenuItem {
  label: string;
  path: string;
  order?: number;
  section?: string;
  feature?: string;
  permissions?: string[];
}

/** Origen del ítem: núcleo (Prisma `menus` clave `main`) o plugin instalado. */
type MenuItemSource = 'core' | 'plugin';

/** Ítem tal como lo expone `GET /menu` (spec `menu-admin-redesign.md`). */
interface AdminMenuItem extends MenuItem {
  id: string | null;
  source: MenuItemSource;
}

/** Normaliza y valida los items recibidos (descarta los inválidos). */
export function normalizeItems(items: unknown): MenuItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((it): it is Record<string, unknown> => Boolean(it) && typeof it === 'object')
    .map((it, index) => ({
      label: typeof it.label === 'string' ? it.label.trim() : '',
      path: typeof it.path === 'string' ? it.path.trim() : '',
      order: typeof it.order === 'number' ? it.order : index,
      section: typeof it.section === 'string' ? it.section : undefined,
      feature: typeof it.feature === 'string' ? it.feature : undefined,
      permissions: Array.isArray(it.permissions)
        ? it.permissions.filter((p): p is string => typeof p === 'string')
        : undefined,
    }))
    .filter((it) => it.label !== '' && it.path !== '');
}

/** Ordena por `order` ascendente (estable). */
export function sortByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Construye el menú admin completo (spec `menu-admin-redesign.md`): ítems core
 * (Prisma `menus` clave `admin`) + ítems de plugins instalados, deduplicados por
 * `path` (el core gana) y con el campo `source` (`core` | `plugin`).
 */
export function buildAdminMenu(
  coreRaw: unknown,
  pluginItems: ResolvedPluginMenuItem[],
): AdminMenuItem[] {
  const coreItems: AdminMenuItem[] = normalizeItems(coreRaw).map((item) => ({
    id: null,
    source: 'core',
    ...item,
    feature: item.feature ?? 'core',
    permissions: item.permissions ?? [],
  }));
  const corePaths = new Set(coreItems.map((item) => item.path));
  const plugins: AdminMenuItem[] = pluginItems
    .filter((item) => !corePaths.has(item.path))
    .map((item) => ({ ...item, source: 'plugin' }));
  return [...sortByOrder(coreItems), ...sortByOrder(plugins)];
}

export default async function menuRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Administración: lectura del menú principal --------
  fastify.get(
    '/menu',
    { schema: { tags: ['menu'] }, preHandler: [fastify.authenticate, fastify.authorize('setting.read')] },
    async () => {
      const menu = await fastify.prisma.menu.findUnique({ where: { key: 'admin' } });
      return { items: buildAdminMenu(menu?.items, collectPluginMenuItems('admin')) };
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
                  section: { type: 'string' },
                  feature: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
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
        where: { key: 'admin' },
        update: { name: 'Menú de administración', items: normalized as unknown as Prisma.InputJsonValue },
        create: { key: 'admin', name: 'Menú de administración', items: normalized as unknown as Prisma.InputJsonValue },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'menu.update', resource: 'menu', resourceId: menu.id });
      return { items: normalized };
    },
  );
}
