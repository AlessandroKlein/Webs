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

interface LocalCatalogItem {
  id: string;
  category?: string;
}

export function PluginSettingsPage() {
  const { category } = useParams();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.get<{ installed: InstalledPlugin[] }>('/api/v1/plugins'),
  });
  const { data: catalogData } = useQuery({
    queryKey: ['plugins-catalog'],
    queryFn: () => api.get<{ local: LocalCatalogItem[] }>('/api/v1/plugins/catalog'),
  });

  if (isLoading) return <Spinner />;

  const categoryById = new Map((catalogData?.local ?? []).map((c) => [c.id, c.category]));

  const grouped = new Map<string, InstalledPlugin[]>();
  for (const plugin of data?.installed ?? []) {
    const cat = categoryById.get(plugin.pluginId) || t('plugins.others');
    const list = grouped.get(cat) ?? [];
    list.push(plugin);
    grouped.set(cat, list);
  }

  const categories = [...grouped.keys()]
    .filter((cat) => cat !== 'auth')
    .sort((a, b) => a.localeCompare(b, 'es'));
  const selected = category && categories.includes(category) ? category : (categories[0] ?? null);

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('plugins.settings')}</h1>
        {categories.map((cat) => (
          <Link
            key={cat}
            to={`/admin/plugin-settings/${encodeURIComponent(cat)}`}
            className={`nav-link ${selected === cat ? 'active' : ''}`}
            style={{ textTransform: 'capitalize' }}
          >
            {cat}
          </Link>
        ))}
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {selected ? (
          <>
            <h2 style={{ textTransform: 'capitalize', margin: 0 }}>{selected}</h2>
            {(grouped.get(selected) ?? []).map((plugin) => (
              <PluginSettingsCard key={plugin.pluginId} plugin={plugin} />
            ))}
          </>
        ) : (
          <Card>
            <p className="muted" style={{ margin: 0 }}>{t('plugins.noInstalled')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function PluginSettingsCard({ plugin }: { plugin: InstalledPlugin }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [value, setValue] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.put(`/api/v1/plugins/${plugin.pluginId}/settings`, v),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const m = plugin.manifest;
  const title = m.displayName?.['es'] ?? m.displayName?.['en'] ?? plugin.name;
  const current = value ?? plugin.config ?? {};

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="muted">v{plugin.version}</span>
      </div>
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
        <p className="muted" style={{ margin: 0 }}>{t('plugins.noSettings')}</p>
      )}
    </Card>
  );
}
