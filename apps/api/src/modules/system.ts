import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { appDir } from '../lib/paths';
import { readState } from '../lib/state';

const execFileAsync = promisify(execFile);

export default async function systemRoutes(fastify: FastifyInstance): Promise<void> {
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
