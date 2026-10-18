import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { LocalizedString } from '@webs/plugin-sdk';
import { blockRegistry } from './registry';
import { blocksDir } from '../lib/paths';
import { cacheGet, cacheSet } from '../lib/cache';

/**
 * Catálogo/marketplace de bloques. Combina:
 *  - bloques locales (descubiertos en `blocks/`), y
 *  - un índice remoto (JSON) configurable vía `BLOCK_REGISTRY_URL`.
 *
 * Formato del índice (bloque por entrada):
 * ```json
 * {
 *   "name": "Webs Block Registry",
 *   "blocks": [
 *     { "id": "store", "name": "@acme/block-store", "version": "1.0.0",
 *       "displayName": { "es": "Tienda", "en": "Store" },
 *       "description": { "es": "…", "en": "…" },
 *       "author": "Acme", "license": "MIT",
 *       "source": "git", "url": "https://github.com/acme/block-store.git",
 *       "subdir": "block" }
 *   ]
 * }
 * ```
 */

export type BlockSource = 'local' | 'git' | 'npm';

export interface RegistryBlockEntry {
  id: string;
  name: string;
  version: string;
  displayName?: LocalizedString;
  description?: LocalizedString;
  author?: string;
  license?: string;
  homepage?: string;
  /** Cómo obtener el bloque. */
  source: BlockSource;
  /** URL del repo git o nombre del paquete npm. */
  url: string;
  /** Subdirectorio del repo que contiene el bloque (monorepos). */
  subdir?: string;
  /** SHA-256 del `block.json` (verificación de integridad, opcional). */
  sha256?: string;
  /** Clave pública Ed25519 (PEM) del creador para verificar la firma. */
  publicKey?: string;
  /** Firma Ed25519 (base64) del `block.json` hecha por el creador. */
  signature?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  version: string;
  displayName: LocalizedString;
  description: LocalizedString;
  author?: string;
  license?: string;
  homepage?: string;
  source: BlockSource;
  installed: boolean;
}

let cachedIndex: RegistryBlockEntry[] | null = null;
let cacheAt = 0;

async function loadRegistryIndex(): Promise<RegistryBlockEntry[]> {
  const url = process.env.BLOCK_REGISTRY_URL;

  if (url) {
    // Cache en memoria de 5 minutos.
    if (cachedIndex && Date.now() - cacheAt < 5 * 60_000) return cachedIndex;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { blocks?: RegistryBlockEntry[] };
      cachedIndex = json.blocks ?? [];
      cacheAt = Date.now();
      return cachedIndex;
    } catch (err) {
      console.warn('[blocks] no se pudo cargar el índice remoto:', (err as Error).message);
      return cachedIndex ?? [];
    }
  }

  // Índice local por defecto: blocks/catalog.json
  const file = path.join(blocksDir(), 'catalog.json');
  if (fs.existsSync(file)) {
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { blocks?: RegistryBlockEntry[] };
      return json.blocks ?? [];
    } catch (err) {
      console.warn('[blocks] índice local inválido:', (err as Error).message);
    }
  }
  return [];
}

export async function findRemoteBlock(id: string): Promise<RegistryBlockEntry | undefined> {
  const index = await loadRegistryIndex();
  return index.find((b) => b.id === id);
}

export async function getCatalog(fastify: FastifyInstance): Promise<{ local: CatalogItem[]; remote: CatalogItem[] }> {
  const cacheKey = 'blocks:catalog';
  const cached = await cacheGet<{ local: CatalogItem[]; remote: CatalogItem[] }>(fastify.redis, cacheKey);
  if (cached) return cached;

  const installations = await fastify.prisma.blockInstallation.findMany({ select: { blockId: true } });
  const installedIds = new Set(installations.map((i) => i.blockId));

  const local: CatalogItem[] = blockRegistry.getAvailable().map((m) => ({
    id: m.id,
    name: m.name,
    version: m.version,
    displayName: m.displayName,
    description: m.description,
    author: m.author,
    license: m.license,
    homepage: m.homepage,
    source: 'local',
    installed: installedIds.has(m.id),
  }));

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
      source: b.source,
      installed: false,
    }));

  const result = { local, remote };
  await cacheSet(fastify.redis, cacheKey, result, 60);
  return result;
}
