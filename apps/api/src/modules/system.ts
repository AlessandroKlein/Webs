import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { appDir } from '../lib/paths';
import { readState } from '../lib/state';

const execFileAsync = promisify(execFile);

/** Versión del sistema (se actualiza en cada release). */
export const SYSTEM_VERSION = '1.47.0';

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
