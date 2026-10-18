import type { FastifyInstance } from 'fastify';
import { readState } from '../../lib/state';
import { listTemplates } from '../templates';
import { SUPPORTED_PROVIDERS, install, testDatabase, type DatabaseConfig, type InstallPayload } from './service';

export default async function setupRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/setup/status',
    { schema: { tags: ['setup'] } },
    async () => {
      const state = readState();
      return {
        installed: state.installed,
        installedAt: state.installedAt ?? null,
        databaseProvider: state.databaseProvider ?? null,
        providers: SUPPORTED_PROVIDERS,
        version: '0.2.0',
      };
    },
  );

  fastify.post(
    '/setup/test-db',
    { schema: { tags: ['setup'] } },
    async (request) => {
      const db = (request.body as { database?: DatabaseConfig })?.database;
      if (!db?.provider) return { ok: false, error: 'Falta la configuración de base de datos' };
      return testDatabase(db);
    },
  );

  // Plantillas disponibles para elegir al final de la instalación.
  fastify.get(
    '/setup/templates',
    { schema: { tags: ['setup'] } },
    async () => listTemplates(),
  );

  fastify.post(
    '/setup/install',
    { schema: { tags: ['setup'] } },
    async (request) => {
      const payload = request.body as InstallPayload;
      if (!payload?.database?.provider || !payload?.site?.name || !payload?.admin?.email || !payload?.admin?.password) {
        return fastify.httpErrors.badRequest('Faltan campos obligatorios en la instalación');
      }
      return install(payload);
    },
  );
}
