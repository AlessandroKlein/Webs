import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextField } from '../../components/ui/TextField';

export interface LicenseFeatureOption {
  key: string;
  label: string;
  description?: string;
  area?: string;
  core: boolean;
}

export interface LicenseKeyFormValues {
  licensee: string;
  productId: string;
  fingerprint: string;
  expiresAt: string;
  features: string[];
}

/**
 * Formulario de emisión de claves de licencia (patrón "crear", modal con todos
 * los campos). Genera contra `POST /api/v1/license/keys` (t88): con
 * `fingerprint` + `LICENSE_PRIVATE_KEY` emite una clave node-locked firmada;
 * sin fingerprint registra una clave ya emitida (vía `activationKey`, que acá
 * se omite porque el flujo principal es emitir en el panel del vendedor).
 */
export function LicenseKeyFormDialog({
  open,
  features,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  features: LicenseFeatureOption[];
  saving?: boolean;
  error?: string;
  onSubmit: (values: LicenseKeyFormValues) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [licensee, setLicensee] = useState('');
  const [productId, setProductId] = useState('webs');
  const [fingerprint, setFingerprint] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const grouped = useMemo(() => {
    const map = new Map<string, LicenseFeatureOption[]>();
    for (const f of features) {
      if (f.core) continue; // 'core' siempre está disponible, no se elige.
      const area = f.area || 'extensions';
      const list = map.get(area) ?? [];
      list.push(f);
      map.set(area, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [features]);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const toggleArea = (keys: string[]) =>
    setSelected((prev) => {
      const all = keys.every((k) => prev.includes(k));
      return all ? prev.filter((k) => !keys.includes(k)) : Array.from(new Set([...prev, ...keys]));
    });

  function submit() {
    onSubmit({ licensee, productId, fingerprint, expiresAt, features: selected });
  }

  return (
    <Dialog
      open={open}
      title={t('licenseKeys.generateTitle')}
      onClose={onCancel}
      maxWidth={640}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button loading={saving} disabled={!licensee.trim() || !productId.trim()} onClick={submit}>
            {t('licenseKeys.generate')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="col" style={{ minWidth: 220 }}>
            <TextField
              label={t('licenseKeys.licensee')}
              value={licensee}
              onChange={(e) => setLicensee(e.target.value)}
              placeholder={t('licenseKeys.licenseePlaceholder')}
              required
            />
          </div>
          <div className="col" style={{ minWidth: 180 }}>
            <TextField
              label={t('licenseKeys.productLabel')}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="webs"
            />
          </div>
        </div>

        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="col" style={{ minWidth: 220 }}>
            <TextField
              label={t('licenseKeys.fingerprintLabel')}
              value={fingerprint}
              onChange={(e) => setFingerprint(e.target.value)}
              placeholder={t('licenseKeys.fingerprintPlaceholder')}
              hint={t('licenseKeys.fingerprintHint')}
            />
          </div>
          <div className="col" style={{ minWidth: 180 }}>
            <TextField
              label={t('licenseKeys.expiryLabel')}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>

        <div>
          <span className="form-label">{t('licenseKeys.featuresLabel')}</span>
          {grouped.length === 0 ? (
            <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>
              {t('licenseKeys.noPremiumFeatures')}
            </p>
          ) : (
            <div className="stack" style={{ gap: 'var(--ws-space-3)', marginTop: 'var(--ws-space-2)' }}>
              {grouped.map(([area, list]) => (
                <div key={area} className="stack" style={{ gap: 'var(--ws-space-1)' }}>
                  <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={`feature-area-${area}`}
                      checked={list.every((f) => selected.includes(f.key))}
                      onChange={() => toggleArea(list.map((f) => f.key))}
                    />
                    <label
                      htmlFor={`feature-area-${area}`}
                      className="form-check-label"
                      style={{ fontWeight: 600, textTransform: 'capitalize' }}
                    >
                      {area}
                    </label>
                    <span className="muted" style={{ fontSize: 'var(--ws-font-size-xs, 11px)' }}>
                      {list.filter((f) => selected.includes(f.key)).length}/{list.length}
                    </span>
                  </div>
                  <div className="stack" style={{ gap: 'var(--ws-space-1)', paddingLeft: 'var(--ws-space-4)' }}>
                    {list.map((f) => (
                      <div key={f.key} className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`feature-${f.key}`}
                          checked={selected.includes(f.key)}
                          onChange={() => toggle(f.key)}
                        />
                        <label htmlFor={`feature-${f.key}`} className="form-check-label">
                          {f.label}{' '}
                          <span className="muted" style={{ fontWeight: 400 }}>
                            · {f.key}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
