import {
  ClockGuard,
  FileClockStore,
  getFingerprint,
  isLicenseExpired,
  verifyActivationKey,
  verifyLicenseSignature,
  ClockRollbackError,
  InvalidActivationKeyError,
  LicenseExpiredError,
  LicensifyError,
  SignatureVerificationError,
  type ActivationResult,
} from '@licensify/core';
import { BadRequestError, ForbiddenError, InternalError } from '@webs/core';
import {
  clearLicenseState,
  licenseClockFile,
  readLicenseState,
  writeLicenseState,
  type LicenseState,
  type LicenseStatus,
  type PersistedLicense,
} from '../../lib/license-state';
import { isCoreFeature } from './features';

export type { LicenseState, LicenseStatus } from '../../lib/license-state';

/** Cada cuánto se re-verifica la licencia en runtime (anti-reloj / anti-tamper). */
const PERIODIC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Tolerancia al retroceso de reloj antes de suspender la licencia. */
const CLOCK_TOLERANCE_MS = 60_000;

/**
 * Servicio de licencias local (node-locking, offline).
 *
 * La clave pública Ed25519 del vendor se inyecta por entorno (LICENSE_PUBLIC_KEY);
 * nunca se embebe una clave privada. La verificación se hace 100 % en el host
 * (firma + fingerprint + vigencia + anti-reloj). Límite honesto documentado en
 * `docs/architecture/licensing-integration.md`: no es protección absoluta.
 */
export class LicenseService {
  private readonly publicKey?: string;
  private readonly clockGuard: ClockGuard;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(publicKey: string | undefined) {
    this.publicKey = publicKey?.trim() || undefined;
    this.clockGuard = new ClockGuard({
      toleranceMs: CLOCK_TOLERANCE_MS,
      store: new FileClockStore(licenseClockFile()),
    });
  }

  /** `true` cuando LICENSE_PUBLIC_KEY está configurada. */
  get configured(): boolean {
    return Boolean(this.publicKey);
  }

  /** Fingerprint de hardware de este host (hasheado, nunca el dato crudo). */
  fingerprint(): string {
    return getFingerprint();
  }

  /** Estado derivado del estado persistido (lectura barata, sin re-verificar). */
  status(): LicenseState {
    return this.deriveStatus(readLicenseState());
  }

  /**
   * Re-verifica la licencia persistida (anti-reloj + firma + vigencia) y
   * actualiza `lastVerifiedAt`. Devuelve el estado fiel, incluyendo
   * `invalid` y `clock_rollback`.
   */
  verify(): LicenseState {
    const persisted = readLicenseState();
    if (!this.publicKey) {
      return this.deriveStatus(persisted, 'unconfigured');
    }
    if (!persisted.activated || !persisted.signedLicense) {
      return this.deriveStatus(persisted, 'unlicensed');
    }

    try {
      this.clockGuard.check(Date.now());
    } catch (err) {
      if (err instanceof ClockRollbackError) {
        return this.deriveStatus(persisted, 'clock_rollback');
      }
      throw err;
    }

    try {
      verifyLicenseSignature(persisted.signedLicense, this.publicKey);
    } catch {
      return this.deriveStatus(persisted, 'invalid');
    }

    if (isLicenseExpired(persisted.signedLicense.payload, Date.now())) {
      return this.deriveStatus(persisted, 'expired');
    }

    const verified: PersistedLicense = { ...persisted, lastVerifiedAt: new Date().toISOString() };
    writeLicenseState(verified);
    return this.deriveStatus(verified, 'active');
  }

  /**
   * Activa una licencia a partir de la clave de activación offline. La clave
   * queda ligada al fingerprint de este host (node-locking).
   */
  activate(activationKey: string): ActivationResult {
    if (!this.publicKey) {
      throw new BadRequestError('Licencias no configuradas: definí LICENSE_PUBLIC_KEY');
    }
    const fingerprint = this.fingerprint();
    let result: ActivationResult;
    try {
      result = verifyActivationKey(activationKey, { publicKeyPem: this.publicKey, fingerprint });
    } catch (err) {
      throw this.mapActivationError(err);
    }

    // Anti-reloj: rechaza la activación si el reloj del sistema retrocedió.
    try {
      this.clockGuard.check(Date.now());
    } catch (err) {
      if (err instanceof ClockRollbackError) {
        throw new ForbiddenError(
          'Reloj retrocedido: corregí la hora del sistema antes de activar (anti-reloj)',
        );
      }
      throw err;
    }

    const now = new Date().toISOString();
    writeLicenseState({
      activated: true,
      signedLicense: result.signedLicense,
      fingerprint,
      activatedAt: now,
      lastVerifiedAt: now,
    });
    return result;
  }

  /** Desactiva la licencia local (no revoca la licencia firmada). */
  deactivate(): void {
    clearLicenseState();
  }

  /** `true` si el flag está activo (núcleo siempre activo; premium requiere licencia). */
  hasFeature(feature: string): boolean {
    if (isCoreFeature(feature)) return true;
    const state = this.status();
    return state.configured && state.status === 'active' && state.features.includes(feature);
  }

  /** Features activos según la licencia vigente. */
  activeFeatures(): string[] {
    return this.status().features;
  }

  /** Inicia la verificación periódica (anti-reloj / anti-tamper). */
  startPeriodic(log: (message: string) => void): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        const state = this.verify();
        if (state.status !== 'active') {
          log(`[licencia] estado ${state.status}${state.expiresAt ? ` (vence ${state.expiresAt})` : ''}`);
        }
      } catch (err) {
        log(`[licencia] verificación periódica falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, PERIODIC_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private deriveStatus(persisted: PersistedLicense, override?: LicenseStatus): LicenseState {
    const signed = persisted.signedLicense;
    let status: LicenseStatus;
    if (override) {
      status = override;
    } else if (!this.configured) {
      status = 'unconfigured';
    } else if (!persisted.activated || !signed) {
      status = 'unlicensed';
    } else if (isLicenseExpired(signed.payload, Date.now())) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return {
      configured: this.configured,
      status,
      nodeLocked: Boolean(persisted.fingerprint),
      productId: signed?.payload.productId,
      licensee: signed?.payload.licensee,
      features: signed?.payload.features ?? [],
      limits: signed?.payload.limits,
      issuedAt: signed?.payload.issuedAt,
      expiresAt: signed?.payload.expiresAt,
      fingerprint: persisted.fingerprint,
      activatedAt: persisted.activatedAt,
      lastVerifiedAt: persisted.lastVerifiedAt,
    };
  }

  private mapActivationError(err: unknown): Error {
    if (err instanceof InvalidActivationKeyError) {
      if (err.message.includes('not bound to this machine')) {
        return new ForbiddenError(
          'La clave de activación no corresponde a esta máquina (node-lock)',
        );
      }
      return new BadRequestError('Clave de activación inválida o corrupta');
    }
    if (err instanceof SignatureVerificationError) {
      return new ForbiddenError('Firma inválida: la clave fue manipulada o no es del vendedor');
    }
    if (err instanceof LicenseExpiredError) {
      return new BadRequestError(`La licencia expiró (${err.expiresAt})`);
    }
    if (err instanceof LicensifyError) {
      return new BadRequestError(err.message);
    }
    return new InternalError('Error inesperado al activar la licencia', err);
  }
}
