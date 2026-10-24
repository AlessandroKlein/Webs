import type { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError } from '@webs/core';
import { findRemotePlugin } from '../../plugins/catalog';

/**
 * Vista RAW/Code de los datos de actualización (ADR-0026): expone el payload
 * crudo VERIFICADO (manifiesto, changelog, archivos, sha256, firma Ed25519 y
 * clave pública) de la app o de un plugin, en JSON (default) o YAML, con
 * redacción de campos sensibles y protegido por el permiso `update.manage`.
 *
 * No se re-descarga el artefacto: solo se re-exponen los metadatos ya resueltos
 * por el updater (GitHub Releases para la app, `RegistryPluginEntry` +
 * `PluginInstallation.manifest` para plugins). La clave privada nunca está en
 * runtime; solo se expone la pública y la firma (datos ya públicos del release).
 */

const GITHUB_RELEASES = 'https://api.github.com/repos/AlessandroKlein/Webs/releases';

export interface RawUpdateFile {
  path: string;
  url?: string;
  size?: number;
  sha256?: string;
}

export interface RawUpdateSignature {
  algorithm: 'ed25519';
  /** `base64url` (app/activación) o `base64` (manifiesto de plugin). */
  encoding: 'base64' | 'base64url';
  value: string | null;
  publicKeyPem: string | null;
}

export interface RawUpdatePayload {
  kind: 'app' | 'plugin';
  id: string | null;
  name: string;
  version: string;
  manifest: unknown;
  changelog: string | null;
  files: RawUpdateFile[];
  integrity?: { sha256: string };
  signature: RawUpdateSignature;
  source: { url: string | null; releasedAt: string | null };
}

// ---------------------------------------------------------------------------
// Redacción de campos sensibles (ADR-0026 §3): denylist de claves + heurística
// de patrón sobre valores. Defensa en profundidad (no garantía); la clave
// pública y la firma NO se redactan (son públicas).
// ---------------------------------------------------------------------------

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^sk-[A-Za-z0-9]{10,}/,
  /^xox[baprs]-[A-Za-z0-9-]+/,
  /^gh[psor]_[A-Za-z0-9]{20,}/,
  /^AIza[0-9A-Za-z_-]{30,}/,
];

export function isSensitiveKey(key: string): boolean {
  const n = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n === 'publickey') return false; // clave pública: se expone
  if (n === 'key' || n === 'privatekey' || n === 'apikey' || n === 'secretkey' || n === 'signingkey' || n === 'accesskey' || n === 'clientsecret') {
    return true;
  }
  return ['secret', 'token', 'password', 'passphrase', 'privatekey', 'cert'].some((p) => n.includes(p));
}

function redactStringValue(value: string): string {
  return SENSITIVE_VALUE_PATTERNS.some((re) => re.test(value)) ? '«redacted»' : value;
}

/** Redacta recursivamente claves y valores sensibles sin mutar el original. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? '«redacted»' : redact(v);
    }
    return out;
  }
  if (typeof value === 'string') return redactStringValue(value);
  return value;
}

// ---------------------------------------------------------------------------
// Serialización YAML mínima (JSON-compatible, sin dependencias).
// ---------------------------------------------------------------------------

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  return '';
}

export function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const lines = toYaml(item, indent + 1).split('\n');
          return `${pad}- ${lines[0]?.trimStart() ?? ''}\n${lines.slice(1).join('\n')}`;
        }
        return `${pad}- ${yamlScalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => {
        if (v !== null && typeof v === 'object') {
          const inner = toYaml(v, indent + 1);
          if (inner === '{}' || inner === '[]') return `${pad}${k}: ${inner}`;
          return `${pad}${k}:\n${inner}`;
        }
        return `${pad}${k}: ${yamlScalar(v)}`;
      })
      .join('\n');
  }
  return yamlScalar(value);
}

// ---------------------------------------------------------------------------
// Resolución de datos (no re-descarga el artefacto; solo metadatos).
// ---------------------------------------------------------------------------

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).trim();
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

async function resolveAppRaw(fastify: FastifyInstance, version?: string): Promise<RawUpdatePayload> {
  const target = version ? `tags/v${version.replace(/^v/, '')}` : 'latest';
  const res = await fetch(`${GITHUB_RELEASES}/${target}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new NotFoundError(`Release '${version ?? 'latest'}' no encontrada (HTTP ${res.status})`);
  const data = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
    body?: string | null;
    assets?: GithubAsset[];
  };

  const ver = (data.tag_name ?? version ?? '').replace(/^v/, '');
  const assets = data.assets ?? [];
  const files: RawUpdateFile[] = assets.map((a) => ({ path: a.name, url: a.browser_download_url, size: a.size }));

  const mainAsset = assets.find((a) => a.name?.endsWith('.tar.gz'));
  let sha256: string | undefined;
  let signature: string | null = null;
  if (mainAsset?.browser_download_url) {
    try {
      sha256 = (await fetchText(`${mainAsset.browser_download_url}.sha256`)).toLowerCase();
    } catch {
      /* sidecar ausente */
    }
    try {
      signature = await fetchText(`${mainAsset.browser_download_url}.sig`);
    } catch {
      /* sidecar ausente */
    }
  }

  return {
    kind: 'app',
    id: null,
    name: 'Webs',
    version: ver,
    manifest: { name: 'Webs', version: ver },
    changelog: data.body ?? null,
    files,
    integrity: sha256 ? { sha256 } : undefined,
    signature: {
      algorithm: 'ed25519',
      encoding: 'base64url',
      value: signature,
      publicKeyPem: fastify.config.UPDATE_PUBLIC_KEY ?? null,
    },
    source: { url: data.html_url ?? null, releasedAt: data.published_at ?? null },
  };
}

function derivePluginFiles(manifest: Record<string, unknown>): RawUpdateFile[] {
  const files: RawUpdateFile[] = [];
  if (typeof manifest.entry === 'string' && manifest.entry) files.push({ path: manifest.entry });
  if (typeof manifest.clientEntry === 'string' && manifest.clientEntry) files.push({ path: manifest.clientEntry });
  return files;
}

async function resolvePluginRaw(fastify: FastifyInstance, id: string, version?: string): Promise<RawUpdatePayload> {
  const entry = await findRemotePlugin(id);
  const inst = await fastify.prisma.pluginInstallation.findUnique({ where: { pluginId: id } });
  if (!entry && !inst) throw new NotFoundError(`Plugin '${id}' no disponible en el catálogo ni instalado`);

  const manifest = ((inst?.manifest as Record<string, unknown> | null) ?? entry ?? {}) as Record<string, unknown>;
  const ver = (version ?? entry?.version ?? String(inst?.version ?? '')).replace(/^v/, '');

  return {
    kind: 'plugin',
    id,
    name: entry?.name ?? String(inst?.name ?? id),
    version: ver,
    manifest,
    changelog: null,
    files: derivePluginFiles(manifest),
    integrity: entry?.sha256 ? { sha256: entry.sha256 } : undefined,
    signature: {
      algorithm: 'ed25519',
      encoding: 'base64', // manifiesto de plugin: base64 estándar sobre bytes raw (ADR-0010)
      value: entry?.signature ?? null,
      publicKeyPem: entry?.publicKey ?? null,
    },
    source: { url: entry?.url ?? entry?.downloadUrl ?? null, releasedAt: null },
  };
}

export default async function updateRawRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/system/update/raw',
    {
      schema: {
        tags: ['update'],
        querystring: {
          type: 'object',
          required: ['target'],
          properties: {
            target: { type: 'string', enum: ['app', 'plugin'] },
            id: { type: 'string' },
            version: { type: 'string' },
            format: { type: 'string', enum: ['json', 'yaml'] },
          },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('update.manage')],
    },
    async (request, reply) => {
      const query = (request.query ?? {}) as { target?: string; id?: string; version?: string; format?: string };
      const target = query.target;
      if (target !== 'app' && target !== 'plugin') {
        throw new BadRequestError("target debe ser 'app' o 'plugin'");
      }
      if (target === 'plugin' && !query.id) {
        throw new BadRequestError("target=plugin requiere el parámetro 'id' (pluginId)");
      }

      const payload = target === 'app' ? await resolveAppRaw(fastify, query.version) : await resolvePluginRaw(fastify, query.id!, query.version);
      const safe = redact(payload);

      if (query.format === 'yaml') {
        reply.header('Content-Type', 'text/yaml; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="update-raw-${target}.yaml"`);
        return toYaml(safe);
      }
      return safe;
    },
  );
}
