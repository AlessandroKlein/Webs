import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { API_PREFIX, BadRequestError, ConflictError, NotFoundError } from '@webs/core';
import {
  PLUGIN_MANIFEST_FILENAME,
  BLOCK_MANIFEST_FILENAME,
  parsePluginManifest,
  type PluginFastify,
  type PluginManifest,
  type JsonSchema,
  type ServerPlugin,
  type ServerPluginContext,
} from '@webs/plugin-sdk';
import { pluginRegistry } from './registry';
import { CORE_SLOTS } from './slots';
import { pluginsDir } from '../lib/paths';
import { registerBlockEvent } from '../modules/email/events';
import { findRemotePlugin, type RegistryPluginEntry } from './catalog';
import { cacheDel } from '../lib/cache';

const execFileAsync = promisify(execFile);

/**
 * Nombres de manifiesto aceptados: `plugin.json` (nuevo) y `block.json`
 * (legacy, durante la migración M1).
 */
const MANIFEST_FILENAMES = [PLUGIN_MANIFEST_FILENAME, BLOCK_MANIFEST_FILENAME];

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

/** Localiza el manifiesto (`plugin.json` o `block.json`) dentro de un directorio. */
function findManifestFile(dir: string): string | null {
  for (const name of MANIFEST_FILENAMES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Dependencias de plugins (por id), aceptando el campo nuevo y el legacy. */
function pluginDependenciesOf(manifest: PluginManifest): string[] {
  return manifest.pluginDependencies ?? manifest.blockDependencies ?? [];
}

/** Resuelve el directorio de plugins locales a partir de `BLOCK_DIR`. */
export function resolvePluginDir(app: FastifyInstance): string {
  return pluginsDir(app.config.BLOCK_DIR);
}

/** @deprecated Usar {@link resolvePluginDir}. Alias por retrocompatibilidad. */
export const resolveBlockDir = resolvePluginDir;

/** Escanea el directorio de plugins y registra los manifiestos disponibles (catálogo). */
export function discoverPlugins(pluginDir: string): void {
  if (!fs.existsSync(pluginDir)) return;
  for (const entry of fs.readdirSync(pluginDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // No escanear directorios ocultos: `.backup/` y `.tmp-*` (updater, ADR-0010)
    // y `.git` no son plugins instalables.
    if (entry.name.startsWith('.')) continue;
    const manifestPath = findManifestFile(path.join(pluginDir, entry.name));
    if (!manifestPath) continue;
    try {
      const manifest = parsePluginManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
      pluginRegistry.registerAvailable(manifest);
    } catch (err) {
      console.warn(`[plugins] manifiesto inválido en ${manifestPath}:`, (err as Error).message);
    }
  }
}

/** @deprecated Usar {@link discoverPlugins}. Alias por retrocompatibilidad. */
export const discoverBlocks = discoverPlugins;

/** Localiza el directorio del paquete de un plugin (por id o por nombre npm). */
export function resolvePackageDir(app: FastifyInstance, manifest: PluginManifest): string | null {
  const pluginDir = resolvePluginDir(app);
  const candidates = [manifest.id, manifest.name.split('/').pop() ?? manifest.id, manifest.name];
  for (const c of candidates) {
    const p = path.join(pluginDir, c);
    if (findManifestFile(p)) return p;
  }

  // F11 (P1): el nombre del directorio puede no coincidir con el `id` ni con el
  // nombre npm del manifiesto (ej. dir `example-block` con id `example` y nombre
  // `@webs/plugin-example`). Escaneamos los subdirectorios y devolvemos el que
  // declare ese id/nombre en su manifiesto, para que la resolución no dependa
  // de la convención de nombres del directorio.
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(pluginDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(pluginDir, entry.name);
    const manifestPath = findManifestFile(dir);
    if (!manifestPath) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { id?: string; name?: string };
      if (raw.id === manifest.id || raw.name === manifest.name || raw.name === manifest.id) {
        return dir;
      }
    } catch {
      // manifiesto inválido: se ignora y se sigue con el siguiente directorio.
    }
  }
  return null;
}

/** Importa el punto de entrada del servidor y devuelve la definición del plugin. */
export async function loadPluginEntry(
  pkgDir: string,
  manifest: PluginManifest,
  cacheBust?: string,
): Promise<ServerPlugin> {
  const entryRel = manifest.entry ?? './dist/server.js';
  // F2 (P0): aislar el `import()` dinámico. El entry se resuelve SIEMPRE dentro
  // del directorio del paquete (nunca una ruta absoluta ni `..` que escape),
  // de modo que un manifiesto no puede apuntar a código arbitrario del host.
  const pkgRoot = path.resolve(pkgDir);
  const entryPath = path.resolve(pkgDir, entryRel);
  if (entryPath !== pkgRoot && !entryPath.startsWith(pkgRoot + path.sep)) {
    throw new Error(`El entry '${entryRel}' del plugin '${manifest.id}' sale de su directorio`);
  }
  // Hot-reload (ADR-0010): cache-busting del `import()` para cargar el build nuevo
  // sin reiniciar la app. El query string convierte el specifier en un módulo
  // distinto a ojos de Node, invalidando la caché de módulos para ese entry.
  // F8 (P1): convertir SIEMPRE a URL file://. En Windows una ruta absoluta como
  // `D:\...\server.js` se interpreta como scheme `D:` y el `import()` lanza
  // ERR_UNSUPPORTED_ESM_URL_SCHEME. El query string (solo con cache-bust) sirve
  // para invalidar la caché de módulos en hot-reload (ADR-0010).
  const specifier = `${pathToFileURL(entryPath).href}${cacheBust ? `?v=${encodeURIComponent(cacheBust)}` : ''}`;
  const mod = (await import(specifier)) as { default?: ServerPlugin };
  const serverPlugin = mod.default;
  if (!serverPlugin || !serverPlugin.manifest) {
    throw new Error(`El plugin '${manifest.id}' no default-exporta un ServerPlugin`);
  }
  return serverPlugin;
}

/** @deprecated Usar {@link loadPluginEntry}. Alias por retrocompatibilidad. */
export const loadBlockEntry = loadPluginEntry;

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
  serverPlugin: ServerPlugin,
  config: Record<string, unknown>,
  installationId: string,
): ServerPluginContext {
  return {
    fastify: fastify as unknown as PluginFastify,
    logger: fastify.log.child({ plugin: serverPlugin.manifest.id }),
    services: { db: fastify.prisma, cache: fastify.redis, events: fastify.events },
    config,
    installationId,
  };
}

/** Registra en BD los permisos que declara un plugin. */
export async function registerPluginPermissions(
  app: FastifyInstance,
  manifest: PluginManifest,
): Promise<void> {
  for (const key of manifest.permissions ?? []) {
    await app.prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permiso del plugin ${manifest.id}` },
    });
  }
}

/** @deprecated Usar {@link registerPluginPermissions}. Alias por retrocompatibilidad. */
export const registerBlockPermissions = registerPluginPermissions;

/**
 * Registra la metadata de un plugin (permisos, eventos, traducciones e items de
 * menú) en los registros globales. Se usa tanto en la activación inicial como en
 * el hot-reload (ADR-0010), donde NO se re-registran las rutas Fastify (Fastify 5
 * no soporta des-registrar rutas encapsuladas en caliente).
 */
async function registerPluginMetadata(app: FastifyInstance, manifest: PluginManifest): Promise<void> {
  await registerPluginPermissions(app, manifest);

  for (const eventKey of manifest.events ?? []) {
    registerBlockEvent({ key: eventKey, label: eventKey });
  }

  if (manifest.translations) {
    pluginRegistry.registerTranslations(manifest.id, manifest.translations);
  }

  // Items de menú nativos declarados por el plugin (se integran sin categoría "Plugins").
  pluginRegistry.registerMenuItems(manifest.id, manifest.menu ?? []);
}

/**
 * Registra las rutas Fastify de un plugin bajo `/api/v1/plugins/<id>` (canónico)
 * y `/api/v1/blocks/<id>` (shim legacy). Se llama UNA vez en el arranque para
 * TODOS los plugins disponibles, porque Fastify 5 no permite registrar rutas tras
 * `listen()`. Cada ruta queda "gateada": sólo responde si el plugin está
 * instalado y activado (registrado en `pluginRegistry.loaded`). Instalar/desinstalar
 * en runtime sólo cambia ese estado, sin tocar el router (F9, t46).
 */
export async function registerPluginRoutes(
  app: FastifyInstance,
  manifest: PluginManifest,
  config: Record<string, unknown>,
): Promise<void> {
  const pkgDir = resolvePackageDir(app, manifest);
  if (!pkgDir) {
    app.log.warn({ pluginId: manifest.id }, 'paquete del plugin no encontrado');
    return;
  }

  const serverPlugin = await loadPluginEntry(pkgDir, manifest);
  if (!serverPlugin.register) return;

  const registerRoutes = async (instance: FastifyInstance): Promise<void> => {
    // Gate fail-closed: la ruta sólo responde si el plugin está instalado y activado.
    instance.addHook('preHandler', async () => {
      if (!pluginRegistry.getLoadedPlugins().some((l) => l.manifest.id === manifest.id)) {
        throw new NotFoundError(`Plugin '${manifest.id}' no instalado`);
      }
    });
    await serverPlugin.register!(instance as unknown as PluginFastify, config);
  };

  await app.register(registerRoutes, { prefix: `${API_PREFIX}/plugins/${manifest.id}` });
  await app.register(registerRoutes, { prefix: `${API_PREFIX}/blocks/${manifest.id}` });
}

/**
 * Activa un plugin instalado: registra permisos, eventos, traducciones e items
 * de menú, ejecuta `onActivate` (una sola vez) y lo marca como cargado. Las rutas
 * ya están registradas desde el boot por {@link registerPluginRoutes}; activar
 * sólo las desbloquea (gate), por lo que responden de inmediato sin reiniciar.
 */
export async function loadAndActivate(
  app: FastifyInstance,
  installation: { id: string; pluginId: string; manifest: Prisma.JsonValue; config: Prisma.JsonValue },
): Promise<void> {
  const manifest = parsePluginManifest(installation.manifest);

  // F13 (P1): idempotencia — si el plugin ya está activo no lo reactivamos.
  if (pluginRegistry.getLoadedPlugins().some((l) => l.manifest.id === manifest.id)) {
    app.log.debug({ pluginId: manifest.id }, 'plugin ya activo; se omite la reactivación');
    return;
  }

  const config = (installation.config as Record<string, unknown>) ?? {};
  const pkgDir = resolvePackageDir(app, manifest);
  if (!pkgDir) {
    app.log.warn({ pluginId: manifest.id }, 'paquete del plugin no encontrado');
    return;
  }

  const serverPlugin = await loadPluginEntry(pkgDir, manifest);
  await registerPluginMetadata(app, manifest);

  if (serverPlugin.hooks.onActivate) {
    const ctx = makeContext(app, serverPlugin, config, installation.id);
    await serverPlugin.hooks.onActivate(ctx);
  }

  pluginRegistry.registerLoaded({
    manifest,
    serverPlugin,
    installationId: installation.id,
    config,
    sourcePath: pkgDir,
  });
}

/** Arranque: registra slots base, descubre el catálogo y activa los plugins instalados. */
export async function registerPlugins(app: FastifyInstance): Promise<void> {
  for (const slot of CORE_SLOTS) pluginRegistry.registerSlot(slot);

  const pluginDir = resolvePluginDir(app);
  discoverPlugins(pluginDir);

  const installations = await app.prisma.pluginInstallation.findMany();
  const configByPluginId = new Map<string, Record<string, unknown>>(
    installations.map((i) => [i.pluginId, (i.config as Record<string, unknown>) ?? {}]),
  );

  // F9 (t46): registrar las rutas de TODOS los plugins disponibles en el boot.
  // Fastify 5 no permite registrar rutas tras `listen()`, así que las registramos
  // todas ahora y las gateamos por estado de instalación. Instalar un plugin en
  // runtime activa sus rutas de inmediato (sin reinicio).
  for (const manifest of pluginRegistry.getAvailable()) {
    try {
      await registerPluginRoutes(app, manifest, configByPluginId.get(manifest.id) ?? {});
    } catch (err) {
      app.log.error({ err, pluginId: manifest.id }, 'no se pudo registrar las rutas del plugin');
    }
  }

  for (const installation of installations) {
    if (!installation.enabled) continue;
    try {
      await loadAndActivate(app, installation);
    } catch (err) {
      app.log.error({ err, pluginId: installation.pluginId }, 'no se pudo cargar el plugin');
    }
  }

  app.log.info({ count: pluginRegistry.getLoadedPlugins().length }, 'plugins cargados');
}

/** @deprecated Usar {@link registerPlugins}. Alias por retrocompatibilidad. */
export const registerBlocks = registerPlugins;

/** Instala un plugin (crea el registro en BD, ejecuta `onInstall` y lo activa). */
export async function installPlugin(app: FastifyInstance, pluginId: string, opts?: { activate?: boolean }) {
  const manifest = pluginRegistry.getAvailableManifest(pluginId);
  if (!manifest) throw new NotFoundError(`Plugin '${pluginId}' no disponible en el catálogo`);

  const existing = await app.prisma.pluginInstallation.findUnique({ where: { pluginId } });
  if (existing) throw new ConflictError('El plugin ya está instalado');

  const pkgDir = resolvePackageDir(app, manifest);
  if (!pkgDir) throw new NotFoundError('Paquete del plugin no encontrado');

  const serverPlugin = await loadPluginEntry(pkgDir, manifest);
  const config = schemaDefaults(manifest.settings);

  const installation = await app.prisma.pluginInstallation.create({
    data: {
      pluginId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled: true,
      config: asJson(config),
      manifest: asJson(manifest),
    },
  });

  await registerPluginPermissions(app, manifest);

  const ctx = makeContext(app, serverPlugin, config, installation.id);
  if (serverPlugin.hooks.onInstall) await serverPlugin.hooks.onInstall(ctx);

  // F9 (P1): activar el plugin inmediatamente (rutas/menú/permisos) sin esperar un
  // reinicio. `loadAndActivate` es idempotente y tolera el caso "app ya booteada".
  // `activate: false` permite al llamador (applyTemplate) diferir la activación
  // para aplicarle la configuración de la plantilla antes de activar una sola vez.
  if (opts?.activate !== false) {
    await loadAndActivate(app, installation);
  }

  await cacheDel(app.redis, 'blocks:catalog');
  return { id: installation.id, pluginId, manifest };
}

/** @deprecated Usar {@link installPlugin}. Alias por retrocompatibilidad. */
export const installBlock = installPlugin;

/** Dependencias de plugins (por id) que faltan instalar. */
export async function getMissingDependencies(app: FastifyInstance, manifest: PluginManifest): Promise<string[]> {
  const missing: string[] = [];
  for (const depId of pluginDependenciesOf(manifest)) {
    const inst = await app.prisma.pluginInstallation.findUnique({ where: { pluginId: depId } });
    if (!inst) missing.push(depId);
  }
  return missing;
}

/** Instala un plugin y sus dependencias (recursivo) si faltan. */
export async function installPluginWithDependencies(app: FastifyInstance, pluginId: string) {
  const manifest = pluginRegistry.getAvailableManifest(pluginId);
  if (!manifest) throw new NotFoundError(`Plugin '${pluginId}' no disponible en el catálogo`);

  const installedDependencies: string[] = [];
  for (const depId of pluginDependenciesOf(manifest)) {
    const inst = await app.prisma.pluginInstallation.findUnique({ where: { pluginId: depId } });
    if (!inst) {
      await installPluginWithDependencies(app, depId);
      installedDependencies.push(depId);
    }
  }

  const result = await installPlugin(app, pluginId);
  return { ...result, installedDependencies };
}

/** @deprecated Usar {@link installPluginWithDependencies}. Alias por retrocompatibilidad. */
export const installBlockWithDependencies = installPluginWithDependencies;

/** Plugins disponibles que proveen un grupo (ej. `payment`), con estado instalado. */
export async function getProviders(app: FastifyInstance, group: string): Promise<Array<{ id: string; name: string; installed: boolean }>> {
  const list = pluginRegistry.getAvailable().filter((m) => (m.provides ?? []).includes(group));
  const installed = new Set((await app.prisma.pluginInstallation.findMany({ select: { pluginId: true } })).map((i) => i.pluginId));
  return list.map((m) => ({ id: m.id, name: m.name, installed: installed.has(m.id) }));
}

/** Grupos de proveedores requeridos que no tienen ningún plugin instalado. */
export async function getMissingProviders(app: FastifyInstance, manifest: PluginManifest): Promise<Array<{ group: string; choices: Array<{ id: string; name: string }> }>> {
  const missing: Array<{ group: string; choices: Array<{ id: string; name: string }> }> = [];
  for (const group of manifest.requiresProviders ?? []) {
    const providers = await getProviders(app, group);
    if (!providers.some((p) => p.installed)) {
      missing.push({ group, choices: providers.map((p) => ({ id: p.id, name: p.name })) });
    }
  }
  return missing;
}

/** Desinstala un plugin (ejecuta `onUninstall` y elimina el registro). */
export async function uninstallPlugin(app: FastifyInstance, pluginId: string) {
  const installation = await app.prisma.pluginInstallation.findUnique({ where: { pluginId } });
  if (!installation) throw new NotFoundError('El plugin no está instalado');

  const manifest = parsePluginManifest(installation.manifest);
  const pkgDir = resolvePackageDir(app, manifest);
  if (pkgDir) {
    try {
      const serverPlugin = await loadPluginEntry(pkgDir, manifest);
      const ctx = makeContext(app, serverPlugin, installation.config as Record<string, unknown>, installation.id);
      if (serverPlugin.hooks.onUninstall) await serverPlugin.hooks.onUninstall(ctx);
    } catch (err) {
      app.log.warn({ err, pluginId }, 'no se pudo ejecutar onUninstall');
    }
  }

  await app.prisma.pluginInstallation.delete({ where: { pluginId } });
  // F9 (t46): al desinstalar, el plugin sale de `loaded` y sus rutas (registradas
  // en el boot, gateadas) vuelven a 404 de inmediato, sin reiniciar.
  pluginRegistry.unregisterLoaded(pluginId);
  pluginRegistry.unregisterMenuItems(pluginId);
  pluginRegistry.unregisterTranslations(pluginId);
  await cacheDel(app.redis, 'blocks:catalog');
}

/** @deprecated Usar {@link uninstallPlugin}. Alias por retrocompatibilidad. */
export const uninstallBlock = uninstallPlugin;

/** Resultado de descargar + verificar un plugin remoto (previo a instalar/actualizar). */
export interface StagedRemotePlugin {
  /** Directorio que contiene el `plugin.json` y el código fuente del plugin. */
  src: string;
  manifest: PluginManifest;
  /** Directorio temporal raíz (para limpiar una vez que `src` ya se movió). */
  tmpDir: string;
}

/**
 * Descarga un plugin remoto a un directorio temporal y verifica su integridad
 * (sha256 del manifiesto) y autenticidad (firma Ed25519 del manifiesto). NO
 * instala: deja el paquete staged para que el llamador decida (instalación o
 * swap atómico del updater, ADR-0010).
 */
export async function stageRemotePlugin(
  app: FastifyInstance,
  entry: RegistryPluginEntry,
): Promise<StagedRemotePlugin> {
  const tmp = path.join(pluginsDir(), `.tmp-${entry.id}-${Date.now()}`);
  let src: string;

  try {
    if (entry.downloadUrl) {
      // Descarga directa de un tarball (.tgz/.tar.gz) provisto por el creador.
      fs.mkdirSync(tmp, { recursive: true });
      const tgzPath = path.join(tmp, 'plugin.tgz');
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
      if (!/^(https?:\/\/|git@)/.test(entry.url)) throw new Error('URL de plugin inválida');
      await run('git', ['clone', '--depth', '1', entry.url, tmp]);
      src = entry.subdir ? path.join(tmp, entry.subdir) : tmp;
    }

    if (!findManifestFile(src)) {
      throw new Error('El paquete no contiene un plugin.json (ni block.json)');
    }
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new BadRequestError(`No se pudo descargar el plugin: ${(err as Error).message}`);
  }

  const manifestPath = findManifestFile(src) as string;
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');

  // F2 (P0): TODA descarga remota exige integridad (sha256) + autenticidad
  // (firma Ed25519) del manifiesto. Nunca se ejecuta código de un paquete remoto
  // cuyo manifiesto no esté firmado por su creador.
  if (!entry.sha256) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new BadRequestError('Actualización remota requiere sha256 del manifiesto');
  }
  const digest = createHash('sha256').update(manifestRaw).digest('hex');
  if (digest !== entry.sha256) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new BadRequestError('Verificación de integridad fallida (sha256)');
  }

  if (!entry.publicKey || !entry.signature) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new BadRequestError('Actualización remota requiere firma Ed25519 (publicKey + signature)');
  }
  try {
    const key = createPublicKey(entry.publicKey);
    const ok = verifySignature(null, Buffer.from(manifestRaw), key, Buffer.from(entry.signature, 'base64'));
    if (!ok) throw new Error('firma inválida');
  } catch {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new BadRequestError('Verificación de firma Ed25519 fallida');
  }

  const manifest = parsePluginManifest(JSON.parse(manifestRaw));
  return { src, manifest, tmpDir: tmp };
}

/**
 * Instala un plugin desde el catálogo remoto (marketplace). Descarga el código
 * fuente (`git clone`), lo ubica en `plugins/<id>` y ejecuta la instalación local.
 * El id final se toma del `plugin.json`/`block.json` (fuente de verdad).
 */
export async function installRemotePlugin(app: FastifyInstance, entry: RegistryPluginEntry) {
  const { src, manifest, tmpDir: tmp } = await stageRemotePlugin(app, entry);
  const dir = path.join(pluginsDir(), manifest.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(src, dir, { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  pluginRegistry.registerAvailable(manifest);
  return installPlugin(app, manifest.id);
}

/** @deprecated Usar {@link installRemotePlugin}. Alias por retrocompatibilidad. */
export const installRemoteBlock = installRemotePlugin;

/** Actualiza un plugin instalado a su última versión, preservando config y estado. */
export async function updatePlugin(app: FastifyInstance, pluginId: string) {
  const installation = await app.prisma.pluginInstallation.findUnique({ where: { pluginId } });
  if (!installation) throw new NotFoundError('El plugin no está instalado');

  const localManifest = pluginRegistry.getAvailableManifest(pluginId);
  if (localManifest) {
    await app.prisma.pluginInstallation.update({
      where: { pluginId },
      data: { name: localManifest.name, version: localManifest.version, manifest: asJson(localManifest) },
    });
    await cacheDel(app.redis, 'blocks:catalog');
    return { ok: true, pluginId, version: localManifest.version };
  }

  const entry = await findRemotePlugin(pluginId);
  if (!entry) throw new NotFoundError(`Plugin '${pluginId}' no disponible en el catálogo`);

  try {
    return await installRemotePlugin(app, entry);
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    const manifest = pluginRegistry.getAvailableManifest(pluginId);
    if (!manifest) throw err;
    await app.prisma.pluginInstallation.update({
      where: { pluginId },
      data: { name: manifest.name, version: manifest.version, manifest: asJson(manifest) },
    });
    await cacheDel(app.redis, 'blocks:catalog');
    return { ok: true, pluginId, version: manifest.version };
  }
}

/** @deprecated Usar {@link updatePlugin}. Alias por retrocompatibilidad. */
export const updateBlock = updatePlugin;

/**
 * Hot-reload de un plugin instalado tras un swap atómico (ADR-0010). Re-importa
 * el entry con cache-busting y re-registra su metadata (permisos/eventos/
 * traducciones/menú) y `onActivate` para que tome efecto SIN reiniciar la app.
 *
 * Limitación del runtime: las rutas Fastify del plugin NO se re-registran —
 * Fastify 5 no soporta des-registrar rutas encapsuladas en caliente, por lo que
 * los *handlers* de ruta del plugin se actualizan en el próximo reinicio del
 * proceso. La metadata (menú/traducciones/permisos) y los hooks sí se actualizan
 * en el momento.
 */
export async function reloadPlugin(
  app: FastifyInstance,
  pluginId: string,
  cacheBust: string,
): Promise<PluginManifest> {
  const installation = await app.prisma.pluginInstallation.findUnique({ where: { pluginId } });
  if (!installation) throw new NotFoundError('El plugin no está instalado');

  const manifest = parsePluginManifest(installation.manifest);
  const pkgDir = resolvePackageDir(app, manifest);
  if (!pkgDir) throw new NotFoundError('Paquete del plugin no encontrado');
  const config = (installation.config as Record<string, unknown>) ?? {};

  // 1) Desactivar la versión anterior (best-effort): onDeactivate + desregistro.
  const previous = pluginRegistry.getLoadedPlugins().find((p) => p.manifest.id === pluginId);
  if (previous?.serverPlugin.hooks.onDeactivate) {
    const deactivateCtx = makeContext(app, previous.serverPlugin, previous.config, installation.id);
    try {
      await previous.serverPlugin.hooks.onDeactivate(deactivateCtx);
    } catch (err) {
      app.log.warn({ err, pluginId }, 'onDeactivate falló durante el hot-reload');
    }
  }
  pluginRegistry.unregisterMenuItems(pluginId);
  pluginRegistry.unregisterTranslations(pluginId);
  pluginRegistry.unregisterLoaded(pluginId);

  // 2) Importar el build nuevo (cache-busted) y re-registrar metadata + onActivate.
  const serverPlugin = await loadPluginEntry(pkgDir, manifest, cacheBust);
  await registerPluginMetadata(app, manifest);
  const activateCtx = makeContext(app, serverPlugin, config, installation.id);
  if (serverPlugin.hooks.onActivate) await serverPlugin.hooks.onActivate(activateCtx);

  pluginRegistry.registerLoaded({
    manifest,
    serverPlugin,
    installationId: installation.id,
    config,
    sourcePath: pkgDir,
  });

  return manifest;
}
