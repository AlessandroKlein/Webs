/**
 * Scope multi-tenant del frontend (sin dependencias, importable desde `api.ts`).
 *
 * Guarda en memoria la organización/sucursal sobre la que está operando el
 * usuario (casa matriz consolidada vs una sucursal concreta) y traduce ese
 * scope a las cabeceras `X-Org-Id` / `X-Chain-Id` que consume el middleware
 * `resolveTenant` del backend (t22).
 *
 * Se mantiene como módulo plano (no Zustand) para que `api.ts` pueda leerlo
 * sin crear ciclos de dependencias; el estado reactivo vive en `tenant-store`.
 */

export type TenantScopeMode = 'all' | 'consolidated' | 'branch';

export interface TenantScope {
  mode: TenantScopeMode;
  /** Id de la organización/sucursal seleccionada (solo con `mode === 'branch'`). */
  organizationId: string | null;
  /** Id de la casa matriz (cadena) para la vista consolidada. */
  chainId: string | null;
}

let current: TenantScope = { mode: 'all', organizationId: null, chainId: null };

export function getTenantScope(): TenantScope {
  return current;
}

export function setTenantScope(next: TenantScope): void {
  current = next;
}

/**
 * Cabeceras que cada petición debe adjuntar para operar sobre el scope actual.
 *
 * - `branch`        → `X-Org-Id` (una sucursal concreta).
 * - `consolidated`  → `X-Chain-Id` (la casa matriz; el backend agrega todas las
 *                     sub-orgs vía `chainOrgIds`).
 * - `all`           → sin cabeceras (el backend resuelve por usuario/JWT).
 */
export function getScopeHeaders(): Record<string, string> {
  if (current.mode === 'branch' && current.organizationId) {
    return { 'X-Org-Id': current.organizationId };
  }
  if (current.mode === 'consolidated' && current.chainId) {
    return { 'X-Chain-Id': current.chainId };
  }
  return {};
}
