import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { ForbiddenError } from '@webs/core';
import { appDir } from '../lib/paths';
import { readState } from '../lib/state';

const execFileAsync = promisify(execFile);

/** Versión del sistema (se actualiza en cada release). */
export const SYSTEM_VERSION = '2.6.0';

export default async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  // Versión actual + última disponible (desde GitHub Releases).
  fastify.get(
    '/system/version',
    { schema: { tags: ['system'] } },
    async () => {
      let latest = SYSTEM_VERSION;
      try {
        const res = await fetch('https://api.github.com/repos/AlessandroKlein/Webs/releases/latest', {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = (await res.json()) as { tag_name?: string };
          latest = (data.tag_name ?? SYSTEM_VERSION).replace(/^v/, '');
        }
      } catch {
        /* offline */
      }
      return { version: SYSTEM_VERSION, latest, hasUpdate: latest !== SYSTEM_VERSION };
    },
  );

  // Copia de seguridad descargable (JSON) con re-verificación de contraseña.
  fastify.get(
    '/system/backup',
    {
      schema: {
        tags: ['system'],
        querystring: { type: 'object', properties: { password: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request, reply) => {
      const userId = request.user?.sub;
      const password = (request.query as { password?: string }).password ?? '';

      const user = await fastify.prisma.user.findUnique({ where: { id: userId ?? '' } });
      if (!user) throw new ForbiddenError('Usuario no encontrado');

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new ForbiddenError('Contraseña incorrecta');

      const backup = await buildBackup(fastify);
      const date = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="webs-backup-${date}.json"`);
      return backup;
    },
  );

  // Respaldo de la base de datos (SQLite: copia; PostgreSQL/MySQL: dump).
  fastify.post(
    '/system/backup',
    { schema: { tags: ['system'] }, preHandler: [fastify.authenticate, fastify.authorize('setting.write')] },
    async () => {
      const script = path.resolve(appDir(), '../../scripts/backup.mjs');
      const { stdout } = await execFileAsync(process.execPath, [script], {
        env: {
          ...process.env,
          DATABASE_URL: readState().databaseUrl ?? '',
          DATA_DIR: path.resolve(appDir(), 'data'),
        },
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      const file = stdout.trim().split('\n').pop();
      return { ok: true, backup: file };
    },
  );
}

/**
 * Reúne los datos relevantes del sitio en un único objeto JSON para descargar.
 * Los usuarios se exportan sin `passwordHash` ni secretos de 2FA.
 */
async function buildBackup(fastify: FastifyInstance) {
  const [users, roles, settings, pages, content, products, orders, payments, inventory, memberships, subscriptions] =
    await Promise.all([
      fastify.prisma.user.findMany(),
      fastify.prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }),
      fastify.prisma.setting.findMany(),
      fastify.prisma.page.findMany(),
      fastify.prisma.content.findMany(),
      fastify.prisma.product.findMany(),
      fastify.prisma.order.findMany(),
      fastify.prisma.payment.findMany(),
      fastify.prisma.inventoryItem.findMany(),
      fastify.prisma.membership.findMany(),
      fastify.prisma.subscription.findMany(),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    version: SYSTEM_VERSION,
    data: {
      users: users.map(({ passwordHash: _passwordHash, twoFactorSecret: _twoFactorSecret, twoFactorBackupCodes: _twoFactorBackupCodes, ...safe }) => safe),
      roles: roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        system: r.system,
        permissions: r.permissions.map((rp) => rp.permission.key),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      settings,
      pages,
      content,
      products,
      orders,
      payments,
      inventory,
      memberships,
      subscriptions,
    },
  };
}
