import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PluginManifest } from '@webs/plugin-sdk';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { SchemaForm } from '../../components/ui/SchemaForm';

interface InstalledPlugin {
  id: string;
  // `pluginId` refleja el modelo Prisma `PluginInstallation.pluginId`.
  pluginId: string;
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
  manifest: PluginManifest;
}

export function PluginConfigPage() {
  const { pluginId } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.get<{ installed: InstalledPlugin[] }>('/api/v1/plugins'),
  });

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.put(`/api/v1/plugins/${pluginId}/settings`, v),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.post(`/api/v1/plugins/${pluginId}/${enabled ? 'activate' : 'deactivate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  });

  if (isLoading) return <Spinner />;

  const plugin = data?.installed.find((b) => b.pluginId === pluginId);
  if (!plugin) {
    return (
      <div className="stack">
        <h1>{t('plugins.notFound')}</h1>
        <Link to="/admin/plugins" className="btn secondary">{t('plugins.backToPlugins')}</Link>
      </div>
    );
  }

  const current = value ?? plugin.config ?? {};
  const m = plugin.manifest;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{m.displayName?.['es'] ?? plugin.name} <span className="muted">v{plugin.version}</span></h1>
        <Link to="/admin/plugins" className="btn secondary">{t('plugins.back')}</Link>
      </div>

      <Card>
        <h3>{t('common.status')}</h3>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="badge">{plugin.enabled ? t('common.enabled') : t('common.disabled')}</span>
          <Button variant="secondary" onClick={() => toggle.mutate(!plugin.enabled)} disabled={toggle.isPending}>
            {plugin.enabled ? t('plugins.disable') : t('plugins.enable')}
          </Button>
        </div>
      </Card>

      <Card>
        <h3>{t('plugins.info')}</h3>
        <dl className="stack" style={{ margin: 0 }}>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.description')} </dt><dd style={{ display: 'inline' }}>{m.description?.['es'] ?? m.description?.['en'] ?? '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.author')} </dt><dd style={{ display: 'inline' }}>{m.author ?? '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.license')} </dt><dd style={{ display: 'inline' }}>{m.license ?? '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.id')} </dt><dd style={{ display: 'inline' }}><code>{plugin.pluginId}</code></dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.slots')} </dt><dd style={{ display: 'inline' }}>{(m.slots ?? []).join(', ') || '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.permissions')} </dt><dd style={{ display: 'inline' }}>{(m.permissions ?? []).join(', ') || '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.events')} </dt><dd style={{ display: 'inline' }}>{(m.events ?? []).join(', ') || '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.entryServer')} </dt><dd style={{ display: 'inline' }}><code>{m.entry ?? '—'}</code></dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>{t('plugins.entryClient')} </dt><dd style={{ display: 'inline' }}><code>{m.clientEntry ?? '—'}</code></dd></div>
        </dl>
      </Card>

      <Card>
        <h3>{t('plugins.config')}</h3>
        {m.settings ? (
          <>
            <SchemaForm schema={m.settings} value={current} onChange={setValue} />
            <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
              {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>{t('plugins.saved')}</span>}
              <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </>
        ) : (
          <p className="muted">{t('plugins.noConfigurableSettings')}</p>
        )}
      </Card>
    </div>
  );
}
