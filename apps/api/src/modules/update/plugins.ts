import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '@webs/core';
import { reloadPlugin, stageRemotePlugin } from '../../plugins/loader';
import { findRemotePlugin, type RegistryPluginEntry } from '../../plugins/catalog';
import { dataDir, pluginsDir } from '../../lib/paths';
import { atomicRollback, atomicSwap } from './bootloader';
import { cacheDel } from '../../lib/cache';
import { audit } from '../../lib/audit';

/** Normaliza una versión para comparación (ignora el prefijo `v`). */
const v = (x: string | undefined): string => String(x ?? '').replace(/^v/, '');

type PluginUpdatePhase =
  | 'checking'
  | 'downloading'
  | 'applying'
  | 'reloading'
  | 'done'
  | 'rolled_back'
  | 'failed';

interface PluginUpdateRecord {
  updateId: string;
  pluginId: string;
  fromVersion: string;
  toVersion: string;
  phase: PluginUpdatePhase;
  startedAt: string;
  finishedAt?: string;
  backupDir?: string;
  error?: string;
}

interface PluginRollbackState {
  pluginId: string;
  version: string;
  previousVersion: string;
  previousName: string;
  previousManifest: unknown;
  backupDir: string;
  appliedAt: string;
}

/** Estado en memoria de las actualizaciones (para `/status`). */
const pluginUpdates = new Map<string, PluginUpdateRecord>();

function pluginStateDir(): string {
  return path.join(dataDir(), 'updates', 'plugin-state');
}
function pluginStateFile(pluginId: string): string {
  return path.join(pluginStateDir(), `${pluginId}.json`);
}
function writePluginRollbackState(state: PluginRollbackState): void {
  fs.mkdirSync(pluginStateDir(), { recursive: true });
  fs.writeFileSync(pluginStateFile(state.pluginId), JSON.stringify(state, null, 2));
}
function readPluginRollbackState(pluginId: string): PluginRollbackState | undefined {
  try {
    return JSON.parse(fs.readFileSync(pluginStateFile(pluginId), 'utf8')) as PluginRollbackState;
  } catch {
    return undefined;
  }
}
function clearPluginRollbackState(pluginId: string): void {
  try {
    fs.rmSync(pluginStateFile(pluginId), { force: true });
  } catch {
    /* noop */
  }
}

/** Consulta actualizaciones disponibles (instaladas vs última versión del catálogo). */
export async function checkPluginUpdates(
  fastify: FastifyInstance,
  pluginId?: string,
): Promise<Array<{
  pluginId: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  source?: string;
  url?: string;
}>> {
  const installations = await fastify.prisma.pluginInstallation.findMany(
    pluginId ? { where: { pluginId } } : undefined,
  );
  const results = [];
  for (const inst of installations) {
    const entry = await findRemotePlugin(inst.pluginId);
    results.push({
      pluginId: inst.pluginId,
      name: inst.name ?? inst.pluginId,
      installedVersion: inst.version,
      latestVersion: entry?.version ?? inst.version,
      hasUpdate: entry ? v(entry.version) !== v(inst.version) : false,
      source: entry?.source,
      url: entry?.url ?? entry?.downloadUrl,
    });
  }
  return results;
}

/** Inicia una actualización de plugin en segundo plano y devuelve el registro. */
export async function startPluginApply(
  fastify: FastifyInstance,
  body: { pluginId: string; version?: string },
): Promise<PluginUpdateRecord> {
  const pluginId = body?.pluginId;
  if (!pluginId) throw new BadRequestError('Falta pluginId');

  const installation = await fastify.prisma.pluginInstallation.findUnique({
    where: { pluginId },
  });
  if (!installation) throw new NotFoundError(`Plugin '${pluginId}' no está instalado`);

  const entry = await findRemotePlugin(pluginId);
  if (!entry) throw new NotFoundError(`Plugin '${pluginId}' no disponible en el catálogo`);

  if (v(body.version ?? entry.version) === v(installation.version)) {
    throw new ConflictError('El plugin ya está en la versión solicitada');
  }

  const record: PluginUpdateRecord = {
    updateId: randomUUID(),
    pluginId,
    fromVersion: installation.version,
    toVersion: body.version ?? entry.version ?? 'latest',
    phase: 'checking',
    startedAt: new Date().toISOString(),
  };
  pluginUpdates.set(record.updateId, record);

  void runPluginApply(fastify, record, entry, installation).catch((err: unknown) => {
    record.phase = 'failed';
    record.error = err instanceof Error ? err.message : String(err);
    record.finishedAt = new Date().toISOString();
  });
  return record;
}

async function runPluginApply(
  fastify: FastifyInstance,
  record: PluginUpdateRecord,
  entry: RegistryPluginEntry,
  installation: { name: string; version: string; manifest: Prisma.JsonValue },
): Promise<void> {
  const pluginId = record.pluginId;
  const liveDir = path.join(pluginsDir(), pluginId);
  const backupDir = path.join(pluginsDir(), '.backup', `${pluginId}-${v(installation.version)}`);
  let swapped = false;

  try {
    // 1) Descargar + verificar (sha256 del manifiesto + firma Ed25519) a staging.
    record.phase = 'downloading';
    const staged = await stageRemotePlugin(fastify, entry);

    // 2) Swap atómico: live → backup, staged → live (rollback interno en atomicSwap).
    record.phase = 'applying';
    await atomicSwap(staged.src, liveDir, backupDir);
    swapped = true;
    record.backupDir = backupDir;
    fs.rmSync(staged.tmpDir, { recursive: true, force: true });

    // 3) Persistir la nueva versión en BD y hot-reload (import cache-busted).
    record.phase = 'reloading';
    await fastify.prisma.pluginInstallation.update({
      where: { pluginId },
      data: {
        name: staged.manifest.name,
        version: staged.manifest.version,
        manifest: staged.manifest as unknown as Prisma.InputJsonValue,
      },
    });
    await reloadPlugin(fastify, pluginId, staged.manifest.version);
    await cacheDel(fastify.redis, 'blocks:catalog');

    writePluginRollbackState({
      pluginId,
      version: staged.manifest.version,
      previousVersion: installation.version,
      previousName: installation.name,
      previousManifest: installation.manifest,
      backupDir,
      appliedAt: new Date().toISOString(),
    });

    record.phase = 'done';
    record.finishedAt = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record.phase = 'failed';
    record.error = message;
    record.finishedAt = new Date().toISOString();

    // Rollback best-effort si el swap ya se aplicó: restaurar archivos + BD + reload previo.
    if (swapped) {
      try {
        await atomicRollback(liveDir, backupDir);
        await fastify.prisma.pluginInstallation.update({
          where: { pluginId },
          data: {
            name: installation.name,
            version: installation.version,
            manifest: installation.manifest as unknown as Prisma.InputJsonValue,
          },
        });
        await reloadPlugin(fastify, pluginId, installation.version);
      } catch (rollbackErr) {
        record.error += `; rollback falló: ${
          rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
        }`;
      }
    }
  }
}

/** Estado de las actualizaciones de plugin (por id o listado completo). */
export function getPluginUpdateStatus(updateId?: string): PluginUpdateRecord | PluginUpdateRecord[] | null {
  if (updateId) return pluginUpdates.get(updateId) ?? null;
  return [...pluginUpdates.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Restaura la versión anterior de un plugin desde el backup preservado. */
export async function rollbackPluginUpdate(
  fastify: FastifyInstance,
  pluginId: string,
): Promise<PluginUpdateRecord> {
  const state = readPluginRollbackState(pluginId);
  if (!state) throw new NotFoundError(`No hay rollback disponible para '${pluginId}'`);
  const liveDir = path.join(pluginsDir(), pluginId);
  if (!fs.existsSync(state.backupDir)) {
    throw new NotFoundError(`El backup de '${pluginId}' no existe`);
  }

  const record: PluginUpdateRecord = {
    updateId: randomUUID(),
    pluginId,
    fromVersion: state.version,
    toVersion: state.previousVersion,
    phase: 'checking',
    startedAt: new Date().toISOString(),
  };
  pluginUpdates.set(record.updateId, record);

  try {
    record.phase = 'applying';
    await atomicRollback(liveDir, state.backupDir);

    record.phase = 'reloading';
    await fastify.prisma.pluginInstallation.update({
      where: { pluginId },
      data: {
        name: state.previousName,
        version: state.previousVersion,
        manifest: state.previousManifest as Prisma.InputJsonValue,
      },
    });
    await reloadPlugin(fastify, pluginId, state.previousVersion);
    await cacheDel(fastify.redis, 'blocks:catalog');
    clearPluginRollbackState(pluginId);

    record.phase = 'rolled_back';
    record.finishedAt = new Date().toISOString();
  } catch (err) {
    record.phase = 'failed';
    record.error = err instanceof Error ? err.message : String(err);
    record.finishedAt = new Date().toISOString();
  }
  return record;
}

/**
 * Rutas del actualizador de PLUGINS (ADR-0010), bajo
 * `/api/v1/system/plugins/update`. Permisos: `check`/`status` = `setting.read`;
 * `apply`/`rollback` = `setting.write`.
 */
export default async function pluginUpdateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/system/plugins/update/check',
    {
      schema: {
        tags: ['update'],
        body: { type: 'object', properties: { pluginId: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => {
      const { pluginId } = (request.body ?? {}) as { pluginId?: string };
      return checkPluginUpdates(fastify, pluginId);
    },
  );

  fastify.post(
    '/system/plugins/update/apply',
    {
      schema: {
        tags: ['update'],
        body: {
          type: 'object',
          required: ['pluginId'],
          properties: {
            pluginId: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request, reply) => {
      const record = await startPluginApply(
        fastify,
        request.body as { pluginId: string; version?: string },
      );
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'update.plugin.apply',
        resource: 'plugin',
        resourceId: record.pluginId,
      });
      return reply.status(202).send(record);
    },
  );

  fastify.get(
    '/system/plugins/update/status',
    {
      schema: {
        tags: ['update'],
        querystring: { type: 'object', properties: { updateId: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => {
      const { updateId } = (request.query ?? {}) as { updateId?: string };
      return getPluginUpdateStatus(updateId);
    },
  );

  fastify.post(
    '/system/plugins/update/rollback',
    {
      schema: {
        tags: ['update'],
        body: {
          type: 'object',
          required: ['pluginId'],
          properties: { pluginId: { type: 'string' } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request, reply) => {
      const { pluginId } = (request.body ?? {}) as { pluginId: string };
      const record = await rollbackPluginUpdate(fastify, pluginId);
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'update.plugin.rollback',
        resource: 'plugin',
        resourceId: pluginId,
      });
      return reply.status(202).send(record);
    },
  );
}
