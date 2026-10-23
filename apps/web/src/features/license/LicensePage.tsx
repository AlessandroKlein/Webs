import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { LicenseStatus, type LicenseState as UiLicenseState } from '../../components/ui/LicenseStatus';
import { FeatureList, type FeatureListItem } from '../../components/ui/FeatureList';
import { FingerprintNotice } from '../../components/ui/FingerprintNotice';
import { ActivationKeyField } from '../../components/ui/ActivationKeyField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

type ApiLicenseStatus = 'unconfigured' | 'unlicensed' | 'active' | 'expired' | 'invalid' | 'clock_rollback';

interface LicenseState {
  configured: boolean;
  status: ApiLicenseStatus;
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

interface LicenseFeature {
  key: string;
  label: string;
  description?: string;
  area?: string;
  core: boolean;
  enabled: boolean;
}

/** Mapea el estado de la API (t25) al estado presentacional de LicenseStatus (t24). */
function toUiState(status: ApiLicenseStatus): UiLicenseState {
  switch (status) {
    case 'active':
      return 'licensed';
    case 'expired':
      return 'expired';
    default:
      // unconfigured | unlicensed | invalid | clock_rollback → sin licencia (con detalle).
      return 'unlicensed';
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function detailFor(ls: LicenseState): string | undefined {
  switch (ls.status) {
    case 'active': {
      const parts = [
        ls.productId ? `Producto ${ls.productId}` : null,
        ls.licensee ? ls.licensee : null,
        ls.expiresAt ? `vence ${formatDate(ls.expiresAt)}` : null,
      ].filter(Boolean) as string[];
      return parts.length > 0 ? parts.join(' · ') : undefined;
    }
    case 'expired':
      return `Vencida el ${formatDate(ls.expiresAt)}.`;
    case 'invalid':
      return 'La licencia no es válida para esta instalación.';
    case 'clock_rollback':
      return 'Se detectó un retroceso del reloj del sistema; la licencia quedó bloqueada.';
    case 'unconfigured':
      return 'Sin licencia configurada. Activá una clave para habilitar features.';
    default:
      return undefined;
  }
}

function toFeatureItems(features: LicenseFeature[]): FeatureListItem[] {
  return [...features]
    .sort((a, b) => Number(b.core) - Number(a.core) || a.key.localeCompare(b.key))
    .map((f) => ({ id: f.key, label: f.label, description: f.description, enabled: f.enabled }));
}

/**
 * Pantalla de licencia (t25). Muestra el estado de la licencia, los features
 * habilitados (comparando el catálogo con la licencia activa), el fingerprint
 * del nodo y las acciones de activación/desactivación.
 */
export function LicensePage() {
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission)('license.manage');

  const { data: license, isLoading: loadingLicense, isError: licenseError } = useQuery({
    queryKey: ['license'],
    queryFn: () => api.get<LicenseState>('/api/v1/license'),
  });

  const { data: featuresData } = useQuery({
    queryKey: ['license-features'],
    queryFn: () => api.get<{ features: LicenseFeature[] }>('/api/v1/license/features'),
  });

  const { data: fpData } = useQuery({
    queryKey: ['license-fingerprint'],
    queryFn: () => api.get<{ fingerprint: string }>('/api/v1/license/fingerprint'),
  });

  const [activationKey, setActivationKey] = useState('');
  const [activateError, setActivateError] = useState<string | undefined>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activate = useMutation({
    mutationFn: () => api.post<{ ok: boolean; status: LicenseState }>('/api/v1/license/activate', { activationKey }),
    onSuccess: () => {
      setActivateError(undefined);
      setActivationKey('');
      void qc.invalidateQueries({ queryKey: ['license'] });
      void qc.invalidateQueries({ queryKey: ['license-features'] });
    },
    onError: (e) => setActivateError(errorMessage(e)),
  });

  const deactivate = useMutation({
    mutationFn: () => api.post<{ ok: boolean; status: LicenseState }>('/api/v1/license/deactivate'),
    onSuccess: () => {
      setConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ['license'] });
      void qc.invalidateQueries({ queryKey: ['license-features'] });
    },
  });

  const features = featuresData?.features ?? [];
  const licensed = license?.status === 'active';

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <h1 style={{ margin: 0 }}>Licencia</h1>

      <Card>
        <Card.Header>
          <Card.Title>Estado de la licencia</Card.Title>
          <Card.Description>Activación local y features habilitados para esta instalación.</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          {loadingLicense ? (
            <Spinner />
          ) : licenseError || !license ? (
            <p className="muted" style={{ margin: 0 }}>
              No se pudo consultar el estado de la licencia.
            </p>
          ) : (
            <>
              <LicenseStatus state={toUiState(license.status)} detail={detailFor(license)} />
              {license.nodeLocked && (
                <p className="text-sm text-muted" style={{ margin: 0 }}>
                  <i className="bi bi-lock" aria-hidden="true" /> Licencia anclada a este nodo.
                </p>
              )}
            </>
          )}

          {!licensed && canManage && !loadingLicense && !licenseError && (
            <div className="flex flex-col gap-2" style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-4)' }}>
              <span className="text-sm font-medium text-text">Activar licencia</span>
              <ActivationKeyField
                value={activationKey}
                onChange={setActivationKey}
                onSubmit={() => activate.mutate()}
                loading={activate.isPending}
                disabled={!canManage}
                error={activateError}
                hint="Pegá la clave de activación provista. La licencia quedará vinculada a este nodo."
              />
            </div>
          )}

          {licensed && canManage && (
            <div className="flex flex-wrap gap-2" style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-4)' }}>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                Desactivar licencia
              </Button>
            </div>
          )}
        </Card.Content>
      </Card>

      {features.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title>Funcionalidades</Card.Title>
            <Card.Description>Qué está habilitado según tu licencia.</Card.Description>
          </Card.Header>
          <Card.Content>
            <FeatureList features={toFeatureItems(features)} />
          </Card.Content>
        </Card>
      )}

      {fpData?.fingerprint && (
        <FingerprintNotice fingerprint={fpData.fingerprint} />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Desactivar licencia"
        danger
        confirmLabel="Desactivar"
        onConfirm={() => deactivate.mutate()}
        onCancel={() => setConfirmOpen(false)}
      >
        Se desactivará la licencia y se perderán los features premium. ¿Continuar?
      </ConfirmDialog>
    </div>
  );
}

function errorMessage(e: unknown): string {
  return e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : 'Error inesperado';
}
