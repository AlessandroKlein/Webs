import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PluginManifest } from '@webs/plugin-sdk';
import { useTranslation } from 'react-i18next';
import i18next from '../../lib/i18n';
import { api } from '../../lib/api';
import { useLicense } from '../../lib/use-license';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';

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

interface PluginsResponse {
  installed: InstalledPlugin[];
  catalog: (PluginManifest & { installed: boolean })[];
}

interface CatalogItem {
  id: string;
  name: string;
  version: string;
  displayName: { es?: string; en?: string };
  description: { es?: string; en?: string };
  author?: string;
  license?: string;
  homepage?: string;
  icon?: string;
  downloadUrl?: string;
  source: 'local' | 'git' | 'npm';
  installed: boolean;
  verified?: boolean;
  category?: string;
  installedVersion?: string | null;
  hasUpdate?: boolean;
  /** Feature premium que habilita el plugin (t97). `core`/ausente = sin gate. */
  feature?: string;
  /** `false` cuando el plugin premium no está cubierto por la licencia activa. */
  licensed?: boolean;
}

interface CatalogResponse {
  local: CatalogItem[];
  remote: CatalogItem[];
}

function catName(item: CatalogItem): string {
  const lang = i18next.language.split('-')[0];
  const localized = lang === 'es' ? item.displayName?.es : lang === 'en' ? item.displayName?.en : undefined;
  return localized ?? item.displayName?.es ?? item.displayName?.en ?? item.name;
}

function catDescription(item: CatalogItem): string {
  const lang = i18next.language.split('-')[0];
  const localized = lang === 'es' ? item.description?.es : lang === 'en' ? item.description?.en : undefined;
  return localized ?? item.description?.es ?? item.description?.en ?? '';
}

/** Plugins legacy/demo que no deben ofrecerse en el catálogo público. */
const LEGACY_PLUGIN_IDS = new Set(['example']);

function catalogMatches(item: CatalogItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    catName(item),
    catDescription(item),
    item.author ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/** Insignia de origen del plugin en el catálogo (local vs remoto Git/npm). */
function SourceBadge({ source }: { source: 'local' | 'git' | 'npm' }) {
  const { t } = useTranslation();
  if (source === 'git') {
    return (
      <span
        className="badge"
        style={{ marginLeft: 8, background: 'rgba(37,99,235,0.15)', color: '#2563eb' }}
        title={t('plugins.sourceGit')}
      >
        <i className="bi bi-github" aria-hidden="true" /> {t('plugins.sourceGit')}
      </span>
    );
  }
  if (source === 'npm') {
    return (
      <span
        className="badge"
        style={{ marginLeft: 8, background: 'rgba(203,61,53,0.15)', color: '#cb3d35' }}
        title={t('plugins.sourceNpm')}
      >
        <i className="bi bi-box-seam" aria-hidden="true" /> {t('plugins.sourceNpm')}
      </span>
    );
  }
  return (
    <span className="badge" style={{ marginLeft: 8 }} title={t('plugins.sourceLocal')}>
      <i className="bi bi-hdd" aria-hidden="true" /> {t('plugins.sourceLocal')}
    </span>
  );
}

export function PluginsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hasFeature } = useLicense();

  const { data, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.get<PluginsResponse>('/api/v1/plugins'),
  });
  const { data: catalogData } = useQuery({
    queryKey: ['plugins-catalog'],
    queryFn: () => api.get<CatalogResponse>('/api/v1/plugins/catalog'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plugins'] });
    qc.invalidateQueries({ queryKey: ['plugins-catalog'] });
  };

  const install = useMutation({
    mutationFn: (vars: { id: string; url?: string; source?: 'git' | 'npm'; providers?: Record<string, string[]> }) =>
      api.post<{ needsProviderSelection?: boolean; missingProviders?: Array<{ group: string; choices: Array<{ id: string; name: string }> }> }>('/api/v1/plugins/install', vars),
    onSuccess: (result, vars) => {
      if (result?.needsProviderSelection) {
        setPending({ id: vars.id, missingProviders: result.missingProviders ?? [] });
      } else {
        setPending(null);
        invalidate();
      }
    },
  });
  const [pending, setPending] = useState<null | { id: string; missingProviders: Array<{ group: string; choices: Array<{ id: string; name: string }> }> }>(null);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [jsonInput, setJsonInput] = useState('');
  const [tab, setTab] = useState<'installed' | 'catalog' | 'import'>('installed');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const importJson = () => {
    try {
      const list = JSON.parse(jsonInput) as Array<{ id: string; url?: string; source?: 'git' | 'npm' }>;
      if (!Array.isArray(list)) throw new Error('array');
      setImportError(null);
      list.forEach((b) => install.mutate({ id: b.id, url: b.url, source: b.source }));
    } catch {
      setImportError(t('plugins.importJsonError'));
    }
  };
  const uninstall = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/plugins/${id}`),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/api/v1/plugins/${id}/${enabled ? 'activate' : 'deactivate'}`),
    onSuccess: invalidate,
  });
  // Actualización por plugin vía el sistema de update de t28 (con backup y
  // rollback disponibles en /admin/updates). Reemplaza al viejo endpoint
  // POST /plugins/:id/update.
  const update = useMutation({
    mutationFn: (id: string) =>
      api.post<{ updateId: string }>('/api/v1/system/plugins/update/apply', { pluginId: id }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['plugin-updates-status'] });
      qc.invalidateQueries({ queryKey: ['plugin-updates-check'] });
    },
  });

  if (isLoading) return <Spinner />;

  const allCatalog = [...(catalogData?.local ?? []), ...(catalogData?.remote ?? [])];
  const updateMap = new Map(allCatalog.filter((b) => b.hasUpdate).map((b) => [b.id, b.version]));
  const catalog = allCatalog.filter(
    (b) => !b.installed && !LEGACY_PLUGIN_IDS.has(b.id) && catalogMatches(b, catalogQuery),
  );
  const groupedCatalog = catalog.reduce<Record<string, CatalogItem[]>>((acc, b) => {
    const cat = b.category ?? 'otros';
    (acc[cat] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.plugins')}</h1>
        <button className={`nav-link ${tab === 'installed' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setTab('installed')}>{t('plugins.installed')}</button>
        <button className={`nav-link ${tab === 'catalog' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setTab('catalog')}>{t('plugins.catalog')}</button>
        {tab === 'catalog' && Object.keys(groupedCatalog).map((cat) => (
          <button
            key={cat}
            className={`nav-link ${activeCategory === cat ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', paddingLeft: 'var(--ws-space-6)', textTransform: 'capitalize' }}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
        <button className={`nav-link ${tab === 'import' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setTab('import')}>{t('plugins.importJson')}</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
      {tab === 'installed' && (
      <Card>
        <h3>{t('plugins.installed')}</h3>
        {(data?.installed ?? []).length === 0 && <p className="muted">{t('plugins.noInstalled')}</p>}
        <div className="stack">
          {(data?.installed ?? []).map((b) => (
            <InstalledPluginRow
              key={b.id}
              plugin={b}
              latestVersion={updateMap.get(b.pluginId)}
              onToggle={toggle.mutate}
              onUninstall={uninstall.mutate}
              onUpdate={update.mutate}
            />
          ))}
        </div>
      </Card>
      )}

      {tab === 'catalog' && (
      <Card>
        <h3>{t('plugins.catalog')}{activeCategory ? ` — ${activeCategory}` : ''}</h3>
        <Input
          value={catalogQuery}
          onChange={(e) => setCatalogQuery(e.target.value)}
          placeholder={t('plugins.searchCatalogPlaceholder')}
          aria-label={t('plugins.searchCatalogAria')}
        />
        {catalog.length === 0 && <p className="muted">{t('plugins.noPluginsAvailable')}</p>}
        <div className="stack">
          {Object.entries(groupedCatalog)
            .filter(([cat]) => !activeCategory || cat === activeCategory)
            .map(([category, items]) => (
              <div key={category}>
                <h4 style={{ textTransform: 'capitalize', margin: 'var(--ws-space-3) 0 var(--ws-space-2)' }}>{category}</h4>
                <div className="stack">
                  {items.map((b) => {
                    const gated = !hasFeature(b.feature);
                    return (
                      <div key={b.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <strong>{catName(b)}</strong>
                          <span className="muted"> v{b.version}</span>
                          {b.author && <span className="muted"> · {b.author}</span>}
                          <SourceBadge source={b.source} />
                          {gated && (
                            <span className="badge" style={{ marginLeft: 8, background: 'var(--ws-warning)', color: '#111' }}>
                              <i className="bi bi-gem" aria-hidden="true" /> {t('plugins.premium')}
                            </span>
                          )}
                          {b.verified && (
                            <span className="badge" style={{ marginLeft: 4, background: 'var(--ws-success)', color: '#fff' }}>✔ {t('plugins.verified')}</span>
                          )}
                          {b.icon && (
                            <img src={b.icon} alt="" style={{ width: 28, height: 28, borderRadius: 6, marginLeft: 8, verticalAlign: 'middle' }} />
                          )}
                          <p className="muted" style={{ margin: 0 }}>
                            {catDescription(b)}
                          </p>
                        </div>
                        {gated ? (
                          <Button disabled title={t('plugins.upsellTitle')}>
                            <i className="bi bi-gem" aria-hidden="true" /> {t('plugins.premium')}
                          </Button>
                        ) : (
                          <Button onClick={() => install.mutate({ id: b.id })} disabled={install.isPending}>
                            {t('common.install')}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </Card>
      )}

      {tab === 'import' && (
      <Card>
        <h3>{t('plugins.importJsonTitle')}</h3>
        <p className="muted">{t('plugins.importJsonHint')}</p>
        <textarea className="input" rows={3} value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} placeholder={'[{"id":"mi-plugin","url":"https://github.com/usuario/repo.git","source":"git"}]'} />
        <Button variant="secondary" onClick={importJson}>{t('plugins.importAction')}</Button>
        {importError && <p style={{ color: 'var(--ws-danger)' }}>{importError}</p>}
      </Card>
      )}

      {pending && (
        <Card>
          <h3>{t('plugins.selectProviders', { id: pending.id })}</h3>
          {pending.missingProviders.map((g) => (
            <div key={g.group} style={{ marginBottom: 8 }}>
              <strong>{g.group}</strong>
              {g.choices.map((c) => (
                <label key={c.id} className="row" style={{ gap: 8, margin: '4px 0' }}>
                  <input
                    type="checkbox"
                    checked={(chosen[g.group] ?? []).includes(c.id)}
                    onChange={(e) => {
                      const cur = new Set(chosen[g.group] ?? []);
                      if (e.target.checked) cur.add(c.id);
                      else cur.delete(c.id);
                      setChosen({ ...chosen, [g.group]: [...cur] });
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          ))}
          <div className="row">
            <Button onClick={() => install.mutate({ id: pending.id, providers: chosen })}>{t('common.confirm')}</Button>
            <Button variant="ghost" onClick={() => { setPending(null); setChosen({}); }}>{t('common.cancel')}</Button>
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}

function InstalledPluginRow({
  plugin,
  latestVersion,
  onToggle,
  onUninstall,
  onUpdate,
}: {
  plugin: InstalledPlugin;
  latestVersion?: string;
  onToggle: (arg: { id: string; enabled: boolean }) => void;
  onUninstall: (id: string) => void;
  onUpdate: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{plugin.name}</strong>
          <span className="muted"> v{plugin.version}</span>
          {latestVersion && (
            <span className="badge" style={{ marginLeft: 8, background: 'var(--ws-warning)', color: '#111' }}>
              ▲ {t('plugins.updateAvailable', { version: latestVersion })}
            </span>
          )}
          <span className="badge" style={{ marginLeft: 8 }}>
            {plugin.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
        </div>
        <div className="row">
          {plugin.manifest.settings && (
            <Link to={`/admin/plugins/${plugin.pluginId}`} className="btn secondary">
              {t('plugins.configure')}
            </Link>
          )}
          {latestVersion && (
            <Button variant="secondary" onClick={() => onUpdate(plugin.pluginId)}>
              {t('plugins.update')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => onToggle({ id: plugin.pluginId, enabled: !plugin.enabled })}>
            {plugin.enabled ? t('plugins.deactivate') : t('plugins.activate')}
          </Button>
          <Button variant="ghost" onClick={() => onUninstall(plugin.pluginId)}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
