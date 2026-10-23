import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError } from '@webs/core';
import { SYSTEM_VERSION } from '../system';
import { sha256File, verifyEd25519 } from './verify';
import {
  applyBare,
  applyDocker,
  atomicRollback,
  atomicSwap,
  backupDir,
  detectMode,
  liveDistDir,
  readCurrentState,
  stagingDir,
  writeCurrentState,
} from './bootloader';

const execFileAsync = promisify(execFile);

/**
 * Servicio del updater de la app (ADR-0010). Máquina de estados en memoria +
 * persistencia de la versión aplicada en `data/updates/current-version.json`.
 *
 * Pipeline de `apply` (fases):
 *   checking → downloading → verifying → staging → applying → healthcheck → done
 *   (o `failed`); el `rollback` restaura el build anterior y marca `rolled_back`.
 */

export type UpdatePhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'staging'
  | 'applying'
  | 'healthcheck'
  | 'done'
  | 'rolled_back'
  | 'failed';

export interface UpdateRecord {
  updateId: string;
  target: 'app';
  fromVersion: string;
  toVersion: string;
  phase: UpdatePhase;
  mode?: 'bare' | 'docker';
  startedAt: string;
  finishedAt?: string;
  digest?: string;
  artifactPath?: string;
  backupPath?: string;
  error?: string;
}

export interface AppUpdateInfo {
  version: string;
  latest: string;
  hasUpdate: boolean;
  changelog: string | null;
  tag: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
}

export interface ApplyBody {
  target: 'app';
  /** Versión destino (sin 'v'). Por defecto, la última release de GitHub. */
  version?: string;
  /** URL directa del tarball. Por defecto, el asset `.tar.gz` del release. */
  artifactUrl?: string;
  /** sha256 hex del tarball. Por defecto se lee de `<artifactUrl>.sha256`. */
  digest?: string;
  /** Firma Ed25519 (base64url) sobre el digest. Por defecto `<artifactUrl>.sig`. */
  signature?: string;
}

/** Estado en memoria de las actualizaciones en curso/finalizadas. */
const updates = new Map<string, UpdateRecord>();

/** Consulta la última release de GitHub y la compara con la versión actual. */
export async function checkUpdate(): Promise<AppUpdateInfo> {
  let latest = SYSTEM_VERSION;
  let tag: string | null = null;
  let releaseUrl: string | null = null;
  let publishedAt: string | null = null;
  let changelog: string | null = null;
  try {
    const res = await fetch('https://api.github.com/repos/AlessandroKlein/Webs/releases/latest', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        tag_name?: string;
        html_url?: string;
        published_at?: string;
        body?: string;
      };
      tag = data.tag_name ?? null;
      latest = (data.tag_name ?? SYSTEM_VERSION).replace(/^v/, '');
      releaseUrl = data.html_url ?? null;
      publishedAt = data.published_at ?? null;
      changelog = data.body ?? null;
    }
  } catch {
    /* offline: devuelve la versión local como "última" */
  }
  return {
    version: SYSTEM_VERSION,
    latest,
    hasUpdate: latest !== SYSTEM_VERSION,
    changelog,
    tag,
    releaseUrl,
    publishedAt,
  };
}

/** Resuelve la URL del asset `.tar.gz` de una release concreta. */
async function resolveArtifactUrl(version: string): Promise<string> {
  const tag = version.replace(/^v/, '');
  const res = await fetch(`https://api.github.com/repos/AlessandroKlein/Webs/releases/tags/v${tag}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`release v${tag} no encontrada (${res.status})`);
  const data = (await res.json()) as { assets?: Array<{ name?: string; browser_download_url?: string }> };
  const asset = (data.assets ?? []).find((a) => a.name?.endsWith('.tar.gz'));
  if (!asset?.browser_download_url) {
    throw new Error(`la release v${tag} no incluye un artefacto .tar.gz`);
  }
  return asset.browser_download_url;
}

async function fetchText(url: string, timeoutMs = 30000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`no se pudo obtener ${url} (${res.status})`);
  return (await res.text()).trim();
}

async function downloadFile(url: string, dest: string, timeoutMs = 120_000): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`descarga fallida (${res.status}) desde ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

/** Extrae el tarball (requiere `tar` en el host/contenedor). */
async function extractTarball(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destDir]);
}

/** Health-check post-apply (solo Docker): espera /health/ready del contenedor nuevo. */
async function healthcheck(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health/ready`, {
        signal: AbortSignal.timeout(2000),
      });
      lastStatus = res.status;
      if (res.ok) return;
    } catch {
      /* contenedor aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`health-check fallido tras la actualización (último estado ${lastStatus || 'sin respuesta'})`);
}

/** Crea el registro y arranca el pipeline de actualización en segundo plano. */
export async function startApply(fastify: FastifyInstance, body: ApplyBody): Promise<UpdateRecord> {
  const info = await checkUpdate();
  const toVersion = (body.version ?? info.latest).replace(/^v/, '');
  if (toVersion === SYSTEM_VERSION && !body.version) {
    throw new ConflictError(`Ya estás en la última versión (${SYSTEM_VERSION})`);
  }

  const record: UpdateRecord = {
    updateId: randomUUID(),
    target: 'app',
    fromVersion: SYSTEM_VERSION,
    toVersion,
    phase: 'checking',
    startedAt: new Date().toISOString(),
  };
  updates.set(record.updateId, record);
  void runApply(fastify, record, body);
  return record;
}

async function runApply(fastify: FastifyInstance, record: UpdateRecord, body: ApplyBody): Promise<void> {
  const env = fastify.config;
  const stageDir = stagingDir(record.toVersion);
  try {
    if (!env.UPDATE_PUBLIC_KEY) {
      throw new Error('UPDATE_PUBLIC_KEY no configurada: no se puede verificar la autenticidad del artefacto');
    }

    // checking: resolver artefacto + metadatos de firma.
    const artifactUrl = body.artifactUrl ?? (await resolveArtifactUrl(record.toVersion));
    const digest = (body.digest ?? (await fetchText(`${artifactUrl}.sha256`))).trim().toLowerCase();
    const signature = (body.signature ?? (await fetchText(`${artifactUrl}.sig`))).trim();

    // downloading.
    record.phase = 'downloading';
    await mkdir(stageDir, { recursive: true });
    const artifactPath = path.join(stageDir, 'artifact.tar.gz');
    await downloadFile(artifactUrl, artifactPath);
    record.artifactPath = artifactPath;

    // verifying: sha256 del artefacto + firma Ed25519 sobre el digest.
    record.phase = 'verifying';
    const actualDigest = await sha256File(artifactPath);
    if (actualDigest !== digest) {
      throw new Error(`digest sha256 no coincide (esperado ${digest}, obtenido ${actualDigest})`);
    }
    if (!verifyEd25519(digest, signature, env.UPDATE_PUBLIC_KEY)) {
      throw new Error('firma Ed25519 inválida sobre el digest');
    }
    record.digest = digest;

    // staging: extraer el build nuevo.
    record.phase = 'staging';
    await extractTarball(artifactPath, stageDir);
    const stagedBuild = path.join(stageDir, 'dist');
    await rm(artifactPath, { force: true });

    // applying: swap atómico (bare) o rolling update (Docker).
    record.phase = 'applying';
    const mode = await detectMode(env);
    record.mode = mode;
    const live = liveDistDir();
    const backup = backupDir();
    if (mode === 'docker') {
      await applyDocker(env.UPDATE_DOCKER_SERVICE);
    } else {
      await atomicSwap(stagedBuild, live, backup);
      await applyBare();
    }
    record.backupPath = backup;

    // healthcheck (solo Docker; en bare lo asume el supervisor tras el reload).
    if (mode === 'docker') {
      record.phase = 'healthcheck';
      await healthcheck(env.PORT);
    }

    await writeCurrentState({
      version: record.toVersion,
      appliedAt: new Date().toISOString(),
      previousVersion: record.fromVersion,
      backupDir: mode === 'docker' ? null : backup,
    });

    record.phase = 'done';
    record.finishedAt = new Date().toISOString();
  } catch (err) {
    record.phase = 'failed';
    record.error = err instanceof Error ? err.message : String(err);
    record.finishedAt = new Date().toISOString();
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Estado de una actualización (por id) o listado completo si no se pasa id. */
export function getStatus(updateId?: string): UpdateRecord | { updates: UpdateRecord[] } {
  if (updateId) {
    const rec = updates.get(updateId);
    if (!rec) throw new NotFoundError('Actualización no encontrada');
    return rec;
  }
  return { updates: [...updates.values()] };
}

/** Restaura el build anterior (rollback a la versión previa). */
export async function rollback(fastify: FastifyInstance): Promise<UpdateRecord> {
  const current = await readCurrentState();
  if (!current || !current.backupDir) {
    throw new ConflictError('No hay una versión anterior para restaurar (sin backup)');
  }

  const record: UpdateRecord = {
    updateId: randomUUID(),
    target: 'app',
    fromVersion: current.version,
    toVersion: current.previousVersion ?? 'unknown',
    phase: 'applying',
    startedAt: new Date().toISOString(),
  };
  updates.set(record.updateId, record);

  try {
    const mode = await detectMode(fastify.config);
    record.mode = mode;
    if (mode === 'docker') {
      // En Docker el rollback es redeploy del tag anterior de la imagen (manual
      // o vía el orquestador); aquí se marca y se informa.
      throw new Error('rollback en Docker: re-desplegar la imagen de la versión anterior manualmente');
    }
    await atomicRollback(liveDistDir(), current.backupDir);
    await writeCurrentState({
      version: current.previousVersion ?? 'unknown',
      appliedAt: new Date().toISOString(),
      previousVersion: current.version,
      backupDir: null,
    });
    record.phase = 'rolled_back';
    record.finishedAt = new Date().toISOString();
  } catch (err) {
    record.phase = 'failed';
    record.error = err instanceof Error ? err.message : String(err);
    record.finishedAt = new Date().toISOString();
  }
  return record;
}
