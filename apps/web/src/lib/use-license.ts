import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuthStore } from './auth-store';

/**
 * Estado de licencia devuelto por `GET /api/v1/license` (t25).
 * `features` contiene SOLO las features premium activas (la core es implícita).
 */
export interface LicenseState {
  configured: boolean;
  status: 'unconfigured' | 'unlicensed' | 'active' | 'expired' | 'invalid' | 'clock_rollback';
  nodeLocked: boolean;
  productId?: string | null;
  licensee?: string | null;
  features: string[];
  limits?: Record<string, unknown> | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  fingerprint?: string | null;
  activatedAt?: string | null;
  lastVerifiedAt?: string | null;
}

/** Feature no gated: `core` (y los items sin feature) siempre están habilitados. */
export function isCoreFeature(
  feature: string | null | undefined,
): feature is null | undefined | 'core' {
  return !feature || feature === 'core';
}

/**
 * Hook centralizado de feature-gating (ADR-0019 / t98). Comparte el cache de
 * React Query bajo `['license']` con la pantalla de licencia, así que la
 * activación/desactivación en `/admin/license` invalida este hook.
 *
 * `hasFeature(feature)`:
 * - `core` / sin feature → siempre `true`;
 * - feature premium → `true` solo si la licencia está `active` y la incluye.
 *
 * Fail-open: si el usuario no puede leer la licencia (`license.read`), no se
 * oculta nada en la UI — el backend es la frontera autoritativa (403 al
 * instalar/acceder un plugin premium no licenciado).
 */
export function useLicense() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('license.read');

  const { data: license, isLoading } = useQuery({
    queryKey: ['license'],
    queryFn: () => api.get<LicenseState>('/api/v1/license'),
    enabled: canRead,
    staleTime: 60_000,
    retry: 1,
  });

  const active = license?.status === 'active';
  const licensedFeatures = new Set(license?.features ?? []);

  function hasFeature(feature: string | null | undefined): boolean {
    if (isCoreFeature(feature)) return true;
    if (!canRead) return true;
    return active && licensedFeatures.has(feature);
  }

  return { license, active, isLoading, hasFeature };
}
