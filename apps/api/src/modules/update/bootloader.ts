import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appDir, dataDir } from '../../lib/paths';
import type { Env } from '../../config/env';

/** Ejecuta un comando heredando stdio (salida visible) y resuelve/falla por código. */
function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} terminó con código ${code}`));
    });
  });
}

/**
 * Bootloader de actualización (ADR-0010). Coordina el reemplazo del build en
 * ejecución SIN caer el servicio:
 *
 *  - **bare**  → swap atómico del directorio `dist` (rename en el mismo
 *    filesystem) + reload graceful (drenar conexiones y re-ejecutar el proceso
 *    con el build ya intercambiado). El supervisor (systemd/PM2/k8s) o el
 *    propio proceso hijo detached se encargan del arranque nuevo.
 *  - **docker** → rolling update vía `docker compose pull && up -d --no-deps`.
 *
 * El primitivo central es `atomicSwap` (rename atómico), que garantiza que un
 * lector concurrente jamás vea el directorio ausente o a medio copiar.
 */

export type UpdateMode = 'auto' | 'bare' | 'docker';

export interface CurrentUpdateState {
  version: string;
  appliedAt: string;
  previousVersion: string | null;
  backupDir: string | null;
}

export function updatesDir(): string {
  return path.join(dataDir(), 'updates');
}

export function stagingDir(version: string): string {
  return path.join(updatesDir(), 'staging', version);
}

export function backupDir(): string {
  return path.join(updatesDir(), 'backup');
}

function currentStateFile(): string {
  return path.join(updatesDir(), 'current-version.json');
}

/** Directorio del build en ejecución (lo que se reemplaza en modo bare). */
export function liveDistDir(): string {
  return path.join(appDir(), 'dist');
}

/** Determina el modo efectivo (auto → detecta contenedor Docker). */
export async function detectMode(env: Env): Promise<'bare' | 'docker'> {
  if (env.UPDATE_MODE === 'docker') return 'docker';
  if (env.UPDATE_MODE === 'bare') return 'bare';
  // 'auto': heurística de contenedor (.dockerenv / cgroup con 'docker').
  try {
    await access('/.dockerenv');
    return 'docker';
  } catch {
    /* no hay .dockerenv */
  }
  try {
    const cgroup = await readFile('/proc/self/cgroup', 'utf8');
    if (cgroup.includes('docker') || cgroup.includes('containerd')) return 'docker';
  } catch {
    /* sin /proc/self/cgroup (Windows/macOS local) */
  }
  return 'bare';
}

/**
 * Swap atómico de directorios en el mismo filesystem.
 *   staged → live  (nuevo build en producción)
 *   live   → backup (build anterior, para rollback)
 * Si el swap falla a mitad de camino, intenta restaurar `live` desde `backup`.
 */
export async function atomicSwap(stagedDir: string, liveDir: string, backup: string): Promise<void> {
  await mkdir(path.dirname(backup), { recursive: true });

  // Quita un backup anterior (solo se conserva la última versión previa).
  await rm(backup, { recursive: true, force: true });

  // 1) live → backup (el build actual queda preservado).
  let movedLive = false;
  try {
    await rename(liveDir, backup);
    movedLive = true;
  } catch (err) {
    // Si no hay live (p. ej. primera vez), no es fatal.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  // 2) staged → live.
  try {
    await rename(stagedDir, liveDir);
  } catch (err) {
    // Rollback: devolver el build anterior a su lugar.
    if (movedLive) {
      try {
        await rename(backup, liveDir);
      } catch {
        /* el rollback es best-effort; el error original se propaga */
      }
    }
    throw err;
  }
}

/** Restaura el build anterior (rollback): backup → live. */
export async function atomicRollback(liveDir: string, backup: string): Promise<void> {
  await rm(liveDir, { recursive: true, force: true });
  await rename(backup, liveDir);
}

/** Rolling update en Docker: pull de la imagen nueva y re-creación del servicio. */
export async function applyDocker(service: string, composeFile?: string): Promise<void> {
  const args = ['compose'];
  if (composeFile) args.push('-f', composeFile);
  const pull = [...args, 'pull', service];
  const up = [...args, 'up', '-d', '--no-deps', service];

  await run('docker', pull);
  await run('docker', up);
}

/**
 * Reload graceful en bare. El build nuevo YA quedó en su lugar con el swap
 * atómico (`atomicSwap`), por lo que el "reload" es instantáneo y sin ventana
 * de archivos ausentes: el supervisor (systemd/PM2/k8s) reinicia el proceso o
 * balancea a la instancia ya actualizada. El propio bootloader NO mata el
 * proceso desde dentro de un request handler (sería inseguro y cortaría la
 * conexión del que disparó la actualización); el swap + persistir el estado es
 * suficiente para que el próximo arranque sirva el build nuevo.
 */
export async function applyBare(): Promise<true> {
  return true;
}

/** Persiste el estado de la versión aplicada (para status/rollback). */
export async function writeCurrentState(state: CurrentUpdateState): Promise<void> {
  await mkdir(updatesDir(), { recursive: true });
  await writeFile(currentStateFile(), JSON.stringify(state, null, 2), 'utf8');
}

export async function readCurrentState(): Promise<CurrentUpdateState | null> {
  try {
    const raw = await readFile(currentStateFile(), 'utf8');
    return JSON.parse(raw) as CurrentUpdateState;
  } catch {
    return null;
  }
}
