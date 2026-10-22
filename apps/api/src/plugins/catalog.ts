import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { LocalizedString } from '@webs/plugin-sdk';
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

export async function getCatalog(fastify: FastifyInstance): Promise<{ local: CatalogItem[]; remote: CatalogItem[] }> {
  const cacheKey = 'blocks:catalog';
  const cached = await cacheGet<{ local: CatalogItem[]; remote: CatalogItem[] }>(fastify.redis, cacheKey);
  if (cached) return cached;

  const installations = await fastify.prisma.blockInstallation.findMany({ select: { blockId: true, version: true } });
  const installedMap = new Map(installations.map((i) => [i.blockId, i.version]));
  const installedIds = new Set(installations.map((i) => i.blockId));

  const local: CatalogItem[] = pluginRegistry.getAvailable().map((m) => {
    const installedVersion = installedMap.get(m.id) ?? null;
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      displayName: m.displayName,
      description: m.description,
      author: m.author,
      license: m.license,
      homepage: m.homepage,
      source: 'local',
      category: m.category,
      installed: installedIds.has(m.id),
      installedVersion,
      hasUpdate: installedVersion !== null && installedVersion !== m.version,
    };
  });

  const remote: CatalogItem[] = (await loadRegistryIndex())
    .filter((b) => !installedIds.has(b.id) && !local.some((l) => l.id === b.id))
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
      source: b.source,
      installed: false,
      verified: b.verified,
    }));

  const result = { local, remote };
  await cacheSet(fastify.redis, cacheKey, result, 60);
  return result;
}
