import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { API_PREFIX, BadRequestError, ConflictError, NotFoundError } from '@webs/core';
import {
  BLOCK_MANIFEST_FILENAME,
  parseBlockManifest,
  type BlockFastify,
  type BlockManifest,
  type JsonSchema,
  type ServerBlock,
  type ServerBlockContext,
} from '@webs/plugin-sdk';
import { blockRegistry } from './registry';
import { CORE_SLOTS } from './slots';
import { blocksDir } from '../lib/paths';
import { registerBlockEvent } from '../modules/email/events';
import { findRemoteBlock, type RegistryBlockEntry } from './catalog';

const execFileAsync = promisify(execFile);

async function run(cmd: string, args: string[]): Promise<void> {
  const resolved = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
  try {
    await execFileAsync(resolved, args, { windowsHide: true });
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(`${cmd} ${args.join(' ')}: ${e.stderr ?? e.message}`);
  }
}

const asJson = (v: unknown): Prisma.InputJsonValue => v as unknown as Prisma.InputJsonValue;

/** Resuelve el directorio de bloques locales a partir de `BLOCK_DIR`. */
export function resolveBlockDir(app: FastifyInstance): string {
  return blocksDir(app.config.BLOCK_DIR);
}

/** Escanea el directorio de bloques y registra los manifiestos disponibles (catálogo). */
export function discoverBlocks(blockDir: string): void {
  if (!fs.existsSync(blockDir)) return;
  for (const entry of fs.readdirSync(blockDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(blockDir, entry.name, BLOCK_MANIFEST_FILENAME);
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = parseBlockManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      blockRegistry.registerAvailable(manifest);
    } catch (err) {
      console.warn(`[blocks] manifiesto inválido en ${manifestPath}:`, (err as Error).message);
    }
  }
}

/** Localiza el directorio del paquete de un bloque (por id o por nombre npm). */
export function resolvePackageDir(app: FastifyInstance, manifest: BlockManifest): string | null {
  const blockDir = resolveBlockDir(app);
  const candidates = [manifest.id, manifest.name.split('/').pop() ?? manifest.id];
  for (const c of candidates) {
    const p = path.join(blockDir, c);
    if (fs.existsSync(path.join(p, BLOCK_MANIFEST_FILENAME))) return p;
  }
  return null;
}

/** Importa el punto de entrada del servidor y devuelve la definición del bloque. */
export async function loadBlockEntry(pkgDir: string, manifest: BlockManifest): Promise<ServerBlock> {
  const entryRel = manifest.entry ?? './dist/server.js';
  const entryPath = path.join(pkgDir, entryRel);
  const mod = (await import(entryPath)) as { default?: ServerBlock };
  const serverBlock = mod.default;
  if (!serverBlock || !serverBlock.manifest) {
    throw new Error(`El bloque '${manifest.id}' no default-exporta un ServerBlock`);
  }
  return serverBlock;
}

/** Extrae los valores `default` de un JSON Schema para la configuración inicial. */
export function schemaDefaults(schema?: JsonSchema): Record<string, unknown> {
  if (!schema?.properties) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    if (value && 'default' in value) {
      out[key] = value.default;
    } else if (value?.type === 'object' && value.properties) {
      out[key] = schemaDefaults(value);
    }
  }
  return out;
}

function makeContext(
  fastify: FastifyInstance,
  serverBlock: ServerBlock,
  config: Record<string, unknown>,
  installationId: string,
): ServerBlockContext {
  return {
    fastify: fastify as unknown as BlockFastify,
    logger: fastify.log.child({ block: serverBlock.manifest.id }),
    services: { db: fastify.prisma, cache: fastify.redis, events: fastify.events },
    config,
    installationId,
  };
}

/** Registra en BD los permisos que declara un bloque. */
export async function registerBlockPermissions(
  app: FastifyInstance,
  manifest: BlockManifest,
): Promise<void> {
  for (const key of manifest.permissions ?? []) {
    await app.prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permiso del bloque ${manifest.id}` },
    });
  }
}

/**
 * Carga y activa un bloque instalado: registra permisos y el plugin Fastify
 * (rutas/decoradores) bajo `/api/v1/blocks/<id>`. La configuración del bloque
 * vive en `BlockInstallation.config` (única fuente de verdad) y se expone vía
 * `GET/PUT /blocks/:id/settings`.
 */
export async function loadAndActivate(
  app: FastifyInstance,
  installation: { id: string; blockId: string; manifest: Prisma.JsonValue; config: Prisma.JsonValue },
): Promise<void> {
  const manifest = parseBlockManifest(installation.manifest);
  const config = (installation.config as Record<string, unknown>) ?? {};
  const pkgDir = resolvePackageDir(app, manifest);
  if (!pkgDir) {
    app.log.warn({ blockId: manifest.id }, 'paquete del bloque no encontrado');
    return;
  }

  const serverBlock = await loadBlockEntry(pkgDir, manifest);
  await registerBlockPermissions(app, manifest);

  for (const eventKey of manifest.events ?? []) {
    registerBlockEvent({ key: eventKey, label: eventKey });
  }

  if (manifest.translations) {
    blockRegistry.registerTranslations(manifest.id, manifest.translations);
  }

  if (serverBlock.register) {
    await app.register(async (instance) => {
      const ctx = makeContext(instance, serverBlock, config, installation.id);
      if (serverBlock.hooks.onActivate) await serverBlock.hooks.onActivate(ctx);
      if (serverBlock.register) await serverBlock.register(instance as unknown as BlockFastify, config);
    }, { prefix: `${API_PREFIX}/blocks/${manifest.id}` });
  }

  blockRegistry.registerLoaded({
    manifest,
    serverBlock,
    installationId: installation.id,
    config,
    sourcePath: pkgDir,
  });
}

/** Arranque: registra slots base, descubre el catálogo y activa los bloques instalados. */
export async function registerBlocks(app: FastifyInstance): Promise<void> {
  for (const slot of CORE_SLOTS) blockRegistry.registerSlot(slot);

  const blockDir = resolveBlockDir(app);
  discoverBlocks(blockDir);

  const installations = await app.prisma.blockInstallation.findMany({ where: { enabled: true } });
  for (const installation of installations) {
    try {
      await loadAndActivate(app, installation);
    } catch (err) {
      app.log.error({ err, blockId: installation.blockId }, 'no se pudo cargar el bloque');
    }
  }

  app.log.info({ count: blockRegistry.getLoadedBlocks().length }, 'bloques cargados');
}

/** Instala un bloque (crea el registro en BD y ejecuta `onInstall`). */
export async function installBlock(app: FastifyInstance, blockId: string) {
  const manifest = blockRegistry.getAvailableManifest(blockId);
  if (!manifest) throw new NotFoundError(`Bloque '${blockId}' no disponible en el catálogo`);

  const existing = await app.prisma.blockInstallation.findUnique({ where: { blockId } });
  if (existing) throw new ConflictError('El bloque ya está instalado');

  const pkgDir = resolvePackageDir(app, manifest);
  if (!pkgDir) throw new NotFoundError('Paquete del bloque no encontrado');

  const serverBlock = await loadBlockEntry(pkgDir, manifest);
  const config = schemaDefaults(manifest.settings);

  const installation = await app.prisma.blockInstallation.create({
    data: {
      blockId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled: true,
      config: asJson(config),
      manifest: asJson(manifest),
    },
  });

  await registerBlockPermissions(app, manifest);

  const ctx = makeContext(app, serverBlock, config, installation.id);
  if (serverBlock.hooks.onInstall) await serverBlock.hooks.onInstall(ctx);

  return { id: installation.id, blockId, manifest };
}

/** Dependencias de bloques (por id) que faltan instalar. */
export async function getMissingDependencies(app: FastifyInstance, manifest: BlockManifest): Promise<string[]> {
  const missing: string[] = [];
  for (const depId of manifest.blockDependencies ?? []) {
    const inst = await app.prisma.blockInstallation.findUnique({ where: { blockId: depId } });
    if (!inst) missing.push(depId);
  }
  return missing;
}

/** Instala un bloque y sus dependencias (recursivo) si faltan. */
export async function installBlockWithDependencies(app: FastifyInstance, blockId: string) {
  const manifest = blockRegistry.getAvailableManifest(blockId);
  if (!manifest) throw new NotFoundError(`Bloque '${blockId}' no disponible en el catálogo`);

  const installedDependencies: string[] = [];
  for (const depId of manifest.blockDependencies ?? []) {
    const inst = await app.prisma.blockInstallation.findUnique({ where: { blockId: depId } });
    if (!inst) {
      await installBlockWithDependencies(app, depId);
      installedDependencies.push(depId);
    }
  }

  const result = await installBlock(app, blockId);
  return { ...result, installedDependencies };
}

/** Bloques disponibles que proveen un grupo (ej. `payment`), con estado instalado. */
export async function getProviders(app: FastifyInstance, group: string): Promise<Array<{ id: string; name: string; installed: boolean }>> {
  const list = blockRegistry.getAvailable().filter((m) => (m.provides ?? []).includes(group));
  const installed = new Set((await app.prisma.blockInstallation.findMany({ select: { blockId: true } })).map((i) => i.blockId));
  return list.map((m) => ({ id: m.id, name: m.name, installed: installed.has(m.id) }));
}

/** Grupos de proveedores requeridos que no tienen ningún bloque instalado. */
export async function getMissingProviders(app: FastifyInstance, manifest: BlockManifest): Promise<Array<{ group: string; choices: Array<{ id: string; name: string }> }>> {
  const missing: Array<{ group: string; choices: Array<{ id: string; name: string }> }> = [];
  for (const group of manifest.requiresProviders ?? []) {
    const providers = await getProviders(app, group);
    if (!providers.some((p) => p.installed)) {
      missing.push({ group, choices: providers.map((p) => ({ id: p.id, name: p.name })) });
    }
  }
  return missing;
}

/** Desinstala un bloque (ejecuta `onUninstall` y elimina el registro). */
export async function uninstallBlock(app: FastifyInstance, blockId: string) {
  const installation = await app.prisma.blockInstallation.findUnique({ where: { blockId } });
  if (!installation) throw new NotFoundError('El bloque no está instalado');

  const manifest = parseBlockManifest(installation.manifest);
  const pkgDir = resolvePackageDir(app, manifest);
  if (pkgDir) {
    try {
      const serverBlock = await loadBlockEntry(pkgDir, manifest);
      const ctx = makeContext(app, serverBlock, installation.config as Record<string, unknown>, installation.id);
      if (serverBlock.hooks.onUninstall) await serverBlock.hooks.onUninstall(ctx);
    } catch (err) {
      app.log.warn({ err, blockId }, 'no se pudo ejecutar onUninstall');
    }
  }

  await app.prisma.blockInstallation.delete({ where: { blockId } });
}

/**
 * Instala un bloque desde el catálogo remoto (marketplace). Descarga el código
 * fuente (`git clone`), lo ubica en `blocks/<id>` y ejecuta la instalación local.
 * El id final se toma del `block.json` (fuente de verdad).
 */
export async function installRemoteBlock(app: FastifyInstance, entry: RegistryBlockEntry) {
  const tmp = path.join(blocksDir(), `.tmp-${entry.id}-${Date.now()}`);
  let src: string;

  try {
    if (entry.downloadUrl) {
      // Descarga directa de un tarball (.tgz/.tar.gz) provisto por el creador.
      fs.mkdirSync(tmp, { recursive: true });
      const tgzPath = path.join(tmp, 'block.tgz');
      const res = await fetch(entry.downloadUrl);
      if (!res.ok) throw new Error(`descarga HTTP ${res.status}`);
      fs.writeFileSync(tgzPath, Buffer.from(await res.arrayBuffer()));
      const extract = path.join(tmp, 'pkg');
      fs.mkdirSync(extract, { recursive: true });
      await run('tar', ['-xzf', tgzPath, '-C', extract]);
      src = path.join(extract, 'package');
    } else if (entry.source === 'npm') {
      fs.mkdirSync(tmp, { recursive: true });
      const spec = entry.version && entry.version !== 'latest' ? `${entry.url}@${entry.version}` : entry.url;
      await run('npm', ['pack', spec, '--pack-destination', tmp]);
      const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
      if (!tgz) throw new Error('npm pack no generó un tarball');
      const extract = path.join(tmp, 'pkg');
      fs.mkdirSync(extract, { recursive: true });
      await run('tar', ['-xzf', path.join(tmp, tgz), '-C', extract]);
      src = path.join(extract, 'package');
    } else {
      if (!/^(https?:\/\/|git@)/.test(entry.url)) throw new Error('URL de bloque inválida');
      await run('git', ['clone', '--depth', '1', entry.url, tmp]);
      src = entry.subdir ? path.join(tmp, entry.subdir) : tmp;
    }

    if (!fs.existsSync(path.join(src, BLOCK_MANIFEST_FILENAME))) {
      throw new Error('El paquete no contiene un block.json');
    }
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new BadRequestError(`No se pudo descargar el bloque: ${(err as Error).message}`);
  }

  const manifestRaw = fs.readFileSync(path.join(src, BLOCK_MANIFEST_FILENAME), 'utf8');
  if (entry.sha256) {
    const digest = createHash('sha256').update(manifestRaw).digest('hex');
    if (digest !== entry.sha256) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new BadRequestError('Verificación de integridad fallida (sha256)');
    }
  }

  // Firma Ed25519 del creador (opcional): garantiza autoría e integridad.
  if (entry.publicKey && entry.signature) {
    try {
      const key = createPublicKey(entry.publicKey);
      const ok = verifySignature(null, Buffer.from(manifestRaw), key, Buffer.from(entry.signature, 'base64'));
      if (!ok) throw new Error('firma inválida');
    } catch {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new BadRequestError('Verificación de firma Ed25519 fallida');
    }
  }

  const manifest = parseBlockManifest(JSON.parse(manifestRaw));
  const dir = path.join(blocksDir(), manifest.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(src, dir, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  blockRegistry.registerAvailable(manifest);
  return installBlock(app, manifest.id);
}

/** Actualiza un bloque instalado a su última versión, preservando config y estado. */
export async function updateBlock(app: FastifyInstance, blockId: string) {
  const installation = await app.prisma.blockInstallation.findUnique({ where: { blockId } });
  if (!installation) throw new NotFoundError('El bloque no está instalado');

  const localManifest = blockRegistry.getAvailableManifest(blockId);
  if (localManifest) {
    await app.prisma.blockInstallation.update({
      where: { blockId },
      data: { name: localManifest.name, version: localManifest.version, manifest: asJson(localManifest) },
    });
    return { ok: true, blockId, version: localManifest.version };
  }

  const entry = await findRemoteBlock(blockId);
  if (!entry) throw new NotFoundError(`Bloque '${blockId}' no disponible en el catálogo`);

  try {
    return await installRemoteBlock(app, entry);
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    const manifest = blockRegistry.getAvailableManifest(blockId);
    if (!manifest) throw err;
    await app.prisma.blockInstallation.update({
      where: { blockId },
      data: { name: manifest.name, version: manifest.version, manifest: asJson(manifest) },
    });
    return { ok: true, blockId, version: manifest.version };
  }
}
