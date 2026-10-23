import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18next from '../../lib/i18n';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { copyText } from '../../components/ui/clipboard';
import { LicenseKeyFormDialog, type LicenseFeatureOption, type LicenseKeyFormValues } from './LicenseKeyFormDialog';

interface LicenseKey {
  id: string;
  organizationId: string;
  saleId?: string | null;
  productId: string;
  licensee: string;
  features: string[];
  limits?: Record<string, number> | null;
  fingerprint?: string | null;
  activationKey: string;
  status: string;
  issuedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokedReason?: string | null;
}

interface LicenseFeatureApi {
  key: string;
  label: string;
  description?: string;
  area?: string;
  core: boolean;
  enabled: boolean;
}

interface ValidateResult {
  valid: boolean;
  payload?: { id?: string; productId?: string; licensee?: string; features?: string[]; limits?: Record<string, number> };
  fingerprint?: string;
  expiresAt?: string;
  error?: string;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function errorMessage(e: unknown): string {
  return e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : i18next.t('licenseKeys.errorUnexpected');
}

function KeyRevealDialog({
  title,
  activationKey,
  hint,
  open,
  onClose,
}: {
  title: string;
  activationKey: string;
  hint?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  async function onCopy() {
    const ok = await copyText(activationKey);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <Dialog open={open} title={title} onClose={onClose} maxWidth={560}>
      <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
        <div
          className="row"
          style={{
            alignItems: 'stretch',
            gap: 'var(--ws-space-2)',
            border: '1px solid var(--ws-border)',
            borderRadius: 'var(--ws-radius)',
            padding: 'var(--ws-space-3)',
            background: 'var(--ws-surface-2)',
          }}
        >
          <code
            style={{
              flex: 1,
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--ws-font-mono, monospace)',
            }}
          >
            {activationKey}
          </code>
          <Button variant="secondary" onClick={onCopy} aria-label={t('licenseKeys.copyKey')}>
            <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'}`} aria-hidden="true" />
            {copied ? t('licenseKeys.copied') : t('common.copy')}
          </Button>
        </div>
        {hint && <p className="muted" style={{ margin: 0 }}>{hint}</p>}
      </div>
    </Dialog>
  );
}

/**
 * Panel del vendedor: gestión de claves de licencia para la venta (t88).
 *
 * Flujo: generar una clave (comprador + duración + features + fingerprint) →
 * copiar la `activationKey` → activarla en otra instancia local desde
 * Administración → Licencia ("Activar licencia"). Incluye una sección de
 * validación (`POST /license/keys/validate`) para verificar una clave sin
 * activarla.
 */
export function LicenseKeysPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.hasPermission)('license.manage');

  const { data: keys, isLoading } = useQuery({
    queryKey: ['license-keys'],
    queryFn: () => api.get<LicenseKey[]>('/api/v1/license/keys'),
  });

  const { data: featuresData } = useQuery({
    queryKey: ['license-features'],
    queryFn: () => api.get<{ features: LicenseFeatureApi[] }>('/api/v1/license/features'),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [issuedKey, setIssuedKey] = useState<LicenseKey | null>(null);
  const [viewKey, setViewKey] = useState<LicenseKey | null>(null);
  const [revokeKey, setRevokeKey] = useState<LicenseKey | null>(null);

  const [valKey, setValKey] = useState('');
  const [valFp, setValFp] = useState('');
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['license-keys'] });

  const generate = useMutation({
    mutationFn: (values: LicenseKeyFormValues) =>
      api.post<LicenseKey>('/api/v1/license/keys', {
        licensee: values.licensee.trim(),
        productId: values.productId.trim(),
        features: values.features,
        ...(values.fingerprint.trim() ? { fingerprint: values.fingerprint.trim() } : {}),
        ...(values.expiresAt ? { expiresAt: values.expiresAt } : {}),
      }),
    onSuccess: (key) => {
      setFormError(undefined);
      setFormOpen(false);
      setIssuedKey(key);
      invalidate();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post<LicenseKey>(`/api/v1/license/keys/${id}/revoke`, {}),
    onSuccess: () => {
      setRevokeKey(null);
      invalidate();
    },
  });

  const validate = useMutation({
    mutationFn: () =>
      api.post<ValidateResult>('/api/v1/license/keys/validate', {
        activationKey: valKey.trim(),
        fingerprint: valFp.trim(),
      }),
    onSuccess: setValidateResult,
    onError: (e) => setValidateResult({ valid: false, error: errorMessage(e) }),
  });

  const featureOptions: LicenseFeatureOption[] = (featuresData?.features ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
    area: f.area,
    core: f.core,
  }));

  function featureLabels(features: string[]): string[] {
    const byKey = new Map(featureOptions.map((f) => [f.key, f.label]));
    return features.map((k) => byKey.get(k) ?? k);
  }

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{t('nav.licenseKeys')}</h1>
        {canManage && (
          <Button onClick={() => { setFormError(undefined); setFormOpen(true); }}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
            {t('licenseKeys.generate')}
          </Button>
        )}
      </div>

      <Card>
        <Card.Header>
          <Card.Title>{t('licenseKeys.testSaleTitle')}</Card.Title>
          <Card.Description>{t('licenseKeys.testSaleDesc')}</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--ws-space-3)' }}>
            <div className="col" style={{ minWidth: 300 }}>
              <TextField
                label={t('licenseKeys.activationKey')}
                value={valKey}
                onChange={(e) => setValKey(e.target.value)}
                placeholder={t('licenseKeys.activationKeyPlaceholder')}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="col" style={{ minWidth: 240 }}>
              <TextField
                label={t('licenseKeys.fingerprint')}
                value={valFp}
                onChange={(e) => setValFp(e.target.value)}
                placeholder={t('licenseKeys.fingerprintPlaceholder')}
                className="font-mono"
                autoComplete="off"
              />
            </div>
            <Button
              onClick={() => { setValidateResult(null); validate.mutate(); }}
              loading={validate.isPending}
              disabled={!valKey.trim() || !valFp.trim()}
            >
              {t('licenseKeys.validate')}
            </Button>
          </div>

          {validateResult && (
            <div
              role="status"
              aria-live="polite"
              className={
                validateResult.valid
                  ? 'flex flex-col gap-1 rounded-lg px-3 py-2 bg-success-soft text-success'
                  : 'flex flex-col gap-1 rounded-lg px-3 py-2 bg-danger-soft text-danger'
              }
            >
              {validateResult.valid ? (
                <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
                  <span style={{ fontWeight: 600 }}>{t('licenseKeys.validKey')}</span>
                  <span className="muted">
                    {t('licenseKeys.validKeyDetail', { licensee: validateResult.payload?.licensee, productId: validateResult.payload?.productId })}
                    {validateResult.expiresAt ? t('licenseKeys.validKeyExpires', { date: formatDate(validateResult.expiresAt) }) : ''}
                  </span>
                </div>
              ) : (
                <span>{validateResult.error || t('licenseKeys.invalidKey')}</span>
              )}
            </div>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>{t('licenseKeys.issuedKeys')}</Card.Title>
          <Card.Description>{t('licenseKeys.issuedKeysDesc')}</Card.Description>
        </Card.Header>
        <Card.Content>
          {isLoading ? (
            <Spinner />
          ) : !keys || keys.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {t('licenseKeys.noKeys')}
            </p>
          ) : (
            <table className="table table-striped table-hover">
              <thead>
                <tr>
                  <th>{t('licenseKeys.product')}</th>
                  <th>{t('licenseKeys.buyer')}</th>
                  <th>{t('licenseKeys.features')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('licenseKeys.issued')}</th>
                  <th>{t('common.expires')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td><code>{k.productId}</code></td>
                    <td>{k.licensee}</td>
                    <td>
                      {k.features.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                          {featureLabels(k.features).slice(0, 3).map((l, i) => (
                            <Badge key={i} variant="neutral">{l}</Badge>
                          ))}
                          {k.features.length > 3 && (
                            <Badge variant="neutral">+{k.features.length - 3}</Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge variant={k.status === 'active' ? 'success' : 'danger'}>
                        {k.status === 'active' ? t('licenseKeys.active') : t('licenseKeys.revoked')}
                      </Badge>
                    </td>
                    <td>{formatDate(k.issuedAt)}</td>
                    <td>{formatDate(k.expiresAt)}</td>
                    <td>
                      <div className="row">
                        <Button variant="secondary" onClick={() => setViewKey(k)}>
                          {t('licenseKeys.viewKey')}
                        </Button>
                        {k.status === 'active' && canManage && (
                          <Button variant="ghost" onClick={() => setRevokeKey(k)}>
                            {t('licenseKeys.revoke')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card.Content>
      </Card>

      <LicenseKeyFormDialog
        open={formOpen}
        features={featureOptions}
        saving={generate.isPending}
        error={formError}
        onSubmit={(values) => generate.mutate(values)}
        onCancel={() => setFormOpen(false)}
      />

      <KeyRevealDialog
        open={issuedKey !== null}
        title={t('licenseKeys.generatedTitle')}
        activationKey={issuedKey?.activationKey ?? ''}
        hint={t('licenseKeys.generatedHint')}
        onClose={() => setIssuedKey(null)}
      />

      <KeyRevealDialog
        open={viewKey !== null}
        title={t('licenseKeys.keyOf', { name: viewKey?.licensee ?? '' })}
        activationKey={viewKey?.activationKey ?? ''}
        hint={viewKey?.fingerprint ? t('licenseKeys.fingerprintAnchored', { fingerprint: viewKey.fingerprint }) : undefined}
        onClose={() => setViewKey(null)}
      />

      <ConfirmDialog
        open={revokeKey !== null}
        title={t('licenseKeys.revokeTitle')}
        danger
        confirmLabel={t('licenseKeys.revoke')}
        onConfirm={() => { if (revokeKey) revoke.mutate(revokeKey.id); }}
        onCancel={() => setRevokeKey(null)}
      >
        {t('licenseKeys.revokeConfirm', { name: revokeKey?.licensee ?? '' })}
      </ConfirmDialog>
    </div>
  );
}
