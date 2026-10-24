/**
 * Tipos y helpers compartidos del sistema de actualización (ADR-0010).
 *
 * Contratos de backend:
 * - App (t29):  POST /api/v1/system/update/check|apply|rollback + GET .../status
 * - Plugins (t28): POST /api/v1/system/plugins/update/check|apply|rollback + GET .../status
 */

export type AppUpdatePhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'staging'
  | 'applying'
  | 'healthcheck'
  | 'done'
  | 'rolled_back'
  | 'failed';

export interface AppUpdateInfo {
  version: string;
  latest: string;
  hasUpdate: boolean;
  changelog: string | null;
  tag: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
}

export interface AppUpdateRecord {
  updateId: string;
  target: 'app';
  fromVersion: string;
  toVersion: string;
  phase: AppUpdatePhase;
  mode?: 'bare' | 'docker';
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export type PluginUpdatePhase =
  | 'checking'
  | 'downloading'
  | 'applying'
  | 'reloading'
  | 'done'
  | 'rolled_back'
  | 'failed';

export interface PluginUpdateInfo {
  pluginId: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  source?: string;
  url?: string;
}

export interface PluginUpdateRecord {
  updateId: string;
  pluginId: string;
  fromVersion: string;
  toVersion: string;
  phase: PluginUpdatePhase;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

/** Fases que representan trabajo en curso (no terminales). */
const APP_BUSY: ReadonlySet<AppUpdatePhase> = new Set([
  'checking',
  'downloading',
  'verifying',
  'staging',
  'applying',
  'healthcheck',
]);

const PLUGIN_BUSY: ReadonlySet<PluginUpdatePhase> = new Set([
  'checking',
  'downloading',
  'applying',
  'reloading',
]);

export function isBusyAppPhase(phase: AppUpdatePhase): boolean {
  return APP_BUSY.has(phase);
}

export function isBusyPluginPhase(phase: PluginUpdatePhase): boolean {
  return PLUGIN_BUSY.has(phase);
}

/** Fases de presentación de {@link UpdateStatus} (componente t24). */
export type UiUpdatePhase =
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'success'
  | 'error'
  | 'rolling-back';

/** Mapea la fase del backend de la app a la fase de presentación. */
export function appPhaseToUi(phase: AppUpdatePhase): UiUpdatePhase {
  switch (phase) {
    case 'checking':
      return 'checking';
    case 'downloading':
      return 'downloading';
    case 'verifying':
    case 'staging':
    case 'applying':
    case 'healthcheck':
      return 'installing';
    case 'done':
    case 'rolled_back':
      return 'success';
    case 'failed':
      return 'error';
  }
}

/** Mapea la fase del backend de plugins a la fase de presentación. */
export function pluginPhaseToUi(phase: PluginUpdatePhase): UiUpdatePhase {
  switch (phase) {
    case 'checking':
      return 'checking';
    case 'downloading':
      return 'downloading';
    case 'applying':
    case 'reloading':
      return 'installing';
    case 'done':
    case 'rolled_back':
      return 'success';
    case 'failed':
      return 'error';
  }
}

// ---------------------------------------------------------------------------
// Vista RAW/Code (ADR-0026). Contrato de GET /api/v1/system/update/raw.
// ---------------------------------------------------------------------------

export interface RawUpdateFile {
  path: string;
  url?: string;
  size?: number;
  sha256?: string;
}

export interface RawUpdateSignature {
  algorithm: 'ed25519';
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

/** Etiqueta legible de una fase de actualización de plugin (para estados inline). */
export function pluginPhaseLabel(phase: PluginUpdatePhase): string {
  switch (phase) {
    case 'checking':
      return 'Comprobando…';
    case 'downloading':
      return 'Descargando…';
    case 'applying':
      return 'Aplicando…';
    case 'reloading':
      return 'Recargando…';
    case 'done':
      return 'Actualizado';
    case 'rolled_back':
      return 'Versión anterior restaurada';
    case 'failed':
      return 'Falló';
  }
}
