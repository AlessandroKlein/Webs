import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SignedLicense } from '@licensify/core';
import { dataDir } from './paths';

/**
 * Estado persistido de la licencia (node-locking local, sin servidor externo).
 *
 * Se guarda como JSON en el directorio de datos del host (fuera del repositorio),
 * de modo que la licencia está ligada a la máquina donde se activó.
 */

export type LicenseStatus =
  | 'unconfigured'
  | 'unlicensed'
  | 'active'
  | 'expired'
  | 'invalid'
  | 'clock_rollback';

export interface PersistedLicense {
  /** `true` cuando se activó una licencia (exista o no un estado válido). */
  activated: boolean;
  /** Licencia firmada (payload + firma Ed25519) activada en este host. */
  signedLicense?: SignedLicense;
  /** Fingerprint de hardware al que quedó ligada la licencia. */
  fingerprint?: string;
  activatedAt?: string;
  lastVerifiedAt?: string;
}

export interface LicenseState {
  configured: boolean;
  status: LicenseStatus;
  nodeLocked: boolean;
  productId?: string;
  licensee?: string;
  features: string[];
  limits?: Record<string, number>;
  issuedAt?: string;
  expiresAt?: string;
  fingerprint?: string;
  activatedAt?: string;
  lastVerifiedAt?: string;
}

const STATE_FILE = 'license.json';
const CLOCK_FILE = 'license.clock';

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function licenseStateFile(): string {
  return path.join(dataDir(), STATE_FILE);
}

export function licenseClockFile(): string {
  return path.join(dataDir(), CLOCK_FILE);
}

/** Lee el estado persistido; si no existe, devuelve el estado vacío. */
export function readLicenseState(): PersistedLicense {
  const file = licenseStateFile();
  if (!existsSync(file)) {
    return { activated: false };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PersistedLicense;
    return parsed && typeof parsed === 'object' ? parsed : { activated: false };
  } catch {
    return { activated: false };
  }
}

/** Escribe el estado de forma atómica (rename sobre archivo temporal). */
export function writeLicenseState(state: PersistedLicense): void {
  const file = licenseStateFile();
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, file);
}

/** Elimina el estado persistido (desactivación). */
export function clearLicenseState(): void {
  const file = licenseStateFile();
  if (existsSync(file)) {
    writeLicenseState({ activated: false });
  }
}
