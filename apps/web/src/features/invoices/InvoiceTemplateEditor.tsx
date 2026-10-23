import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import {
  DEFAULT_TEMPLATE_CONFIG,
  renderTemplateHtml,
  sampleInvoice,
  type InvoiceTemplateConfig,
} from './invoiceTemplate';

interface PluginSettingsResponse {
  pluginId: string;
  schema: unknown;
  value: Record<string, unknown>;
}

function readConfig(value: Record<string, unknown> | undefined): InvoiceTemplateConfig {
  const raw = (value?.invoiceTemplateConfig ?? {}) as Partial<InvoiceTemplateConfig>;
  return {
    logo: String(raw.logo ?? DEFAULT_TEMPLATE_CONFIG.logo),
    primaryColor: String(raw.primaryColor ?? DEFAULT_TEMPLATE_CONFIG.primaryColor),
    heading: String(raw.heading ?? DEFAULT_TEMPLATE_CONFIG.heading),
    footer: String(raw.footer ?? DEFAULT_TEMPLATE_CONFIG.footer),
    showCae: raw.showCae !== false,
    showCustomer: raw.showCustomer !== false,
  };
}

export function InvoiceTemplateEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['invoice-template-settings'],
    queryFn: () => api.get<PluginSettingsResponse>('/api/v1/plugins/facturacion/settings'),
  });

  const [cfg, setCfg] = useState<InvoiceTemplateConfig>(DEFAULT_TEMPLATE_CONFIG);

  // Sincroniza el formulario cuando cargan los ajustes (solo en la primera carga).
  useEffect(() => {
    if (settings) setCfg(readConfig(settings.value));
  }, [settings?.pluginId]);

  const previewHtml = useMemo(() => renderTemplateHtml(cfg, sampleInvoice()), [cfg]);

  const save = useMutation({
    mutationFn: (next: InvoiceTemplateConfig) =>
      api.put<PluginSettingsResponse>('/api/v1/plugins/facturacion/settings', {
        ...(settings?.value ?? {}),
        invoiceTemplateConfig: next,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-template-settings'] });
    },
  });

  const patch = (p: Partial<InvoiceTemplateConfig>) => setCfg((prev) => ({ ...prev, ...p }));

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('admin.invoices.templateTitle')}</h1>
      <p className="muted">{t('admin.invoices.templateSubtitle')}</p>

      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)', flexWrap: 'wrap' }}>
        <Card style={{ flex: 1, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('admin.invoices.customizeTemplate')}</h3>
          <div className="stack">
            <TextField
              label={t('admin.invoices.logo')}
              value={cfg.logo}
              onChange={(e) => patch({ logo: e.target.value })}
              placeholder="https://…/logo.png"
              hint={t('admin.invoices.logoHint')}
            />
            <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                {t('admin.invoices.primaryColor')}
              </span>
              <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                <input
                  type="color"
                  value={cfg.primaryColor}
                  onChange={(e) => patch({ primaryColor: e.target.value })}
                  aria-label={t('admin.invoices.primaryColor')}
                  style={{ width: 44, height: 32, padding: 0, border: '1px solid var(--ws-border)', borderRadius: 'var(--ws-radius-md)', background: 'none' }}
                />
                <code>{cfg.primaryColor}</code>
              </div>
            </div>
            <TextField label={t('admin.invoices.heading')} value={cfg.heading} onChange={(e) => patch({ heading: e.target.value })} />
            <TextField label={t('admin.invoices.footer')} value={cfg.footer} onChange={(e) => patch({ footer: e.target.value })} />
            <label className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.showCae} onChange={(e) => patch({ showCae: e.target.checked })} />
              {t('admin.invoices.showCae')}
            </label>
            <label className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.showCustomer} onChange={(e) => patch({ showCustomer: e.target.checked })} />
              {t('admin.invoices.showCustomer')}
            </label>
            <div className="row">
              <Button onClick={() => save.mutate(cfg)} disabled={save.isPending}>
                {save.isPending ? t('admin.account.saving') : t('admin.invoices.saveTemplate')}
              </Button>
              {save.isSuccess && <span style={{ color: 'var(--ws-success)' }}>{t('admin.invoices.templateSaved')}</span>}
              {save.error && <span style={{ color: 'var(--ws-danger)' }}>{save.error.message}</span>}
            </div>
          </div>
        </Card>

        <Card style={{ flex: 1, minWidth: 320 }}>
          <h3 style={{ marginTop: 0 }}>{t('admin.invoices.preview')}</h3>
          <iframe
            title={t('admin.invoices.preview')}
            sandbox=""
            srcDoc={previewHtml}
            style={{ width: '100%', height: 560, border: '1px solid var(--ws-border)', borderRadius: 'var(--ws-radius-md)', background: '#f6f7f9' }}
          />
        </Card>
      </div>
    </div>
  );
}
