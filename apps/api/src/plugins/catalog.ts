import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { LocalizedString, PluginManifest } from '@webs/plugin-sdk';
import { pluginRegistry } from './registry';
import { pluginsDir } from '../lib/paths';
import { cacheGet, cacheSet } from '../lib/cache';

/**
 * Catálogo/marketplace de plugins. Combina:
 *  - plugins locales (descubiertos en `plugins/`), y
 *  - un índice remoto (JSON) configurable vía `BLOCK_REGISTRY_URL`.
 *
 * Formato del índice (plugin por entrada):
 * ```json
 * {
 *   "name": "Webs Plugin Registry",
 *   "blocks": [
 *     { "id": "store", "name": "@acme/plugin-store", "version": "1.0.0",
 *       "displayName": { "es": "Tienda", "en": "Store" },
 *       "description": { "es": "…", "en": "…" },
 *       "author": "Acme", "license": "MIT",
 *       "source": "git", "url": "https://github.com/acme/plugin-store.git",
 *       "subdir": "plugin" }
 *   ]
 * }
 * ```
 */

export type PluginSource = 'local' | 'git' | 'npm';

/** @deprecated Usar {@link PluginSource}. Alias por retrocompatibilidad. */
export type BlockSource = PluginSource;

export interface RegistryPluginEntry {
  id: string;
  name: string;
  version: string;
  displayName?: LocalizedString;
  description?: LocalizedString;
  author?: string;
  license?: string;
  homepage?: string;
  /** URL de una imagen/icono del plugin (se muestra en el catálogo). */
  icon?: string;
  /** URL directa de descarga (tarball .tgz/.tar.gz) si no se usa git/npm. */
  downloadUrl?: string;
  /** Cómo obtener el plugin. */
  source: PluginSource;
  /** URL del repo git o nombre del paquete npm. */
  url: string;
  /** Subdirectorio del repo que contiene el plugin (monorepos). */
  subdir?: string;
  /** SHA-256 del `plugin.json`/`block.json` (verificación de integridad, opcional). */
  sha256?: string;
  /** Clave pública Ed25519 (PEM) del creador para verificar la firma. */
  publicKey?: string;
  /** Firma Ed25519 (base64) del `plugin.json`/`block.json` hecha por el creador. */
  signature?: string;
  /** Si el plugin está verificado por un autor de confianza. */
  verified?: boolean;
}

/** @deprecated Usar {@link RegistryPluginEntry}. Alias por retrocompatibilidad. */
export type RegistryBlockEntry = RegistryPluginEntry;

export interface CatalogItem {
  id: string;
  name: string;
  version: string;
  displayName: LocalizedString;
  description: LocalizedString;
  author?: string;
  license?: string;
  homepage?: string;
  icon?: string;
  downloadUrl?: string;
  /** URL del repositorio fuente (GitHub/npm) desde donde se descarga el plugin. */
  repository?: string;
  source: PluginSource;
  installed: boolean;
  verified?: boolean;
  /** Categoría del plugin (agrupación en el catálogo). */
  category?: string;
  /** Versión instalada (null si no está instalado). */
  installedVersion?: string | null;
  /** true si hay una versión más nueva disponible. */
  hasUpdate?: boolean;
}

let cachedIndex: RegistryPluginEntry[] | null = null;
let cacheAt = 0;

async function loadRegistryIndex(): Promise<RegistryPluginEntry[]> {
  const url = process.env.BLOCK_REGISTRY_URL;

  if (url) {
    // Cache en memoria de 5 minutos.
    if (cachedIndex && Date.now() - cacheAt < 5 * 60_000) return cachedIndex;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { blocks?: RegistryPluginEntry[] };
      cachedIndex = json.blocks ?? [];
      cacheAt = Date.now();
      return cachedIndex;
    } catch (err) {
      console.warn('[plugins] no se pudo cargar el índice remoto:', (err as Error).message);
      return cachedIndex ?? [];
    }
  }

  // Índice local por defecto: plugins/catalog.json (antes blocks/catalog.json)
  const file = path.join(pluginsDir(), 'catalog.json');
  if (fs.existsSync(file)) {
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { blocks?: RegistryPluginEntry[] };
      return json.blocks ?? [];
    } catch (err) {
      console.warn('[plugins] índice local inválido:', (err as Error).message);
    }
  }
  return [];
}

export async function findRemotePlugin(id: string): Promise<RegistryPluginEntry | undefined> {
  const index = await loadRegistryIndex();
  return index.find((b) => b.id === id);
}

/** @deprecated Usar {@link findRemotePlugin}. Alias por retrocompatibilidad. */
export const findRemoteBlock = findRemotePlugin;

/**
 * Construye el catálogo fusionando los plugins descubiertos en disco (local) y
 * el índice del registro remoto. Origen de un plugin local (ADR-0016): campo
 * `source` del manifiesto > entrada del registro > `git` inferido si declara
 * `repository` > `local` (marcador interno, solo paquetes en disco sin fuente
 * remota declarada).
 */
export function buildCatalog(
  localManifests: PluginManifest[],
  registryEntries: RegistryPluginEntry[],
  installedMap: Map<string, string>,
): { local: CatalogItem[]; remote: CatalogItem[] } {
  const installedIds = new Set(installedMap.keys());
  const registryById = new Map(registryEntries.map((e) => [e.id, e]));

  const local: CatalogItem[] = localManifests.map((m) => {
    const entry = registryById.get(m.id);
    const installedVersion = installedMap.get(m.id) ?? null;
    const source: PluginSource = m.source ?? entry?.source ?? (m.repository ? 'git' : 'local');
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      displayName: m.displayName,
      description: m.description,
      author: m.author,
      license: m.license,
      homepage: m.homepage,
      repository: entry?.url ?? m.repository,
      source,
      category: m.category,
      installed: installedIds.has(m.id),
      installedVersion,
      hasUpdate: installedVersion !== null && installedVersion !== m.version,
    };
  });

  const localIds = new Set(local.map((l) => l.id));
  const remote: CatalogItem[] = registryEntries
    .filter((b) => !installedIds.has(b.id) && !localIds.has(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,
      version: b.version,
      displayName: b.displayName ?? { en: b.name },
      description: b.description ?? {},
      author: b.author,
      license: b.license,
      homepage: b.homepage,
      icon: b.icon,
      downloadUrl: b.downloadUrl,
      repository: b.url,
      source: b.source,
      installed: false,
      verified: b.verified,
    }));

  return { local, remote };
}

export async function getCatalog(fastify: FastifyInstance): Promise<{ local: CatalogItem[]; remote: CatalogItem[] }> {
  const cacheKey = 'blocks:catalog';
  const cached = await cacheGet<{ local: CatalogItem[]; remote: CatalogItem[] }>(fastify.redis, cacheKey);
  if (cached) return cached;

  const installations = await fastify.prisma.pluginInstallation.findMany({ select: { pluginId: true, version: true } });
  const installedMap = new Map(installations.map((i) => [i.pluginId, i.version]));

  const result = buildCatalog(pluginRegistry.getAvailable(), await loadRegistryIndex(), installedMap);
  await cacheSet(fastify.redis, cacheKey, result, 60);
  return result;
}
