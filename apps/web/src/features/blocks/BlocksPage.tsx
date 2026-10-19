import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockManifest } from '@webs/plugin-sdk';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface InstalledBlock {
  id: string;
  blockId: string;
  name: string;
  version: string;
  enabled: boolean;
  config: Record<string, unknown>;
  manifest: BlockManifest;
}

interface BlocksResponse {
  installed: InstalledBlock[];
  catalog: (BlockManifest & { installed: boolean })[];
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
}

interface CatalogResponse {
  local: CatalogItem[];
  remote: CatalogItem[];
}

function catName(item: CatalogItem): string {
  return item.displayName?.['es'] ?? item.displayName?.['en'] ?? item.name;
}

export function BlocksPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<BlocksResponse>('/api/v1/blocks'),
  });
  const { data: catalogData } = useQuery({
    queryKey: ['blocks-catalog'],
    queryFn: () => api.get<CatalogResponse>('/api/v1/blocks/catalog'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['blocks'] });
    qc.invalidateQueries({ queryKey: ['blocks-catalog'] });
  };

  const install = useMutation({
    mutationFn: (vars: { id: string; url?: string; source?: 'git' | 'npm'; providers?: Record<string, string[]> }) =>
      api.post<{ needsProviderSelection?: boolean; missingProviders?: Array<{ group: string; choices: Array<{ id: string; name: string }> }> }>('/api/v1/blocks/install', vars),
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

  const importJson = () => {
    try {
      const list = JSON.parse(jsonInput) as Array<{ id: string; url?: string; source?: 'git' | 'npm' }>;
      list.forEach((b) => install.mutate({ id: b.id, url: b.url, source: b.source }));
    } catch {
      window.alert('JSON inválido. Esperado: [{ "id": "...", "url": "...", "source": "git" }]');
    }
  };
  const uninstall = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/blocks/${id}`),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/api/v1/blocks/${id}/${enabled ? 'activate' : 'deactivate'}`),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/blocks/${id}/update`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  const allCatalog = [...(catalogData?.local ?? []), ...(catalogData?.remote ?? [])];
  const updateMap = new Map(allCatalog.filter((b) => b.hasUpdate).map((b) => [b.id, b.version]));
  const catalog = allCatalog.filter((b) => !b.installed);
  const groupedCatalog = catalog.reduce<Record<string, CatalogItem[]>>((acc, b) => {
    const cat = b.category ?? 'otros';
    (acc[cat] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="stack">
      <h1>{t('nav.blocks')}</h1>

      <div className="row" style={{ gap: 4, borderBottom: '1px solid var(--ws-border)', paddingBottom: 'var(--ws-space-2)' }}>
        {(['installed', 'catalog', 'import'] as const).map((t) => (
          <Button key={t} variant={tab === t ? 'secondary' : 'ghost'} onClick={() => setTab(t)}>
            {t === 'installed' ? 'Instalados' : t === 'catalog' ? 'Catálogo' : 'Importar JSON'}
          </Button>
        ))}
      </div>

      {tab === 'installed' && (
      <Card>
        <h3>Instalados</h3>
        {(data?.installed ?? []).length === 0 && <p className="muted">No hay bloques instalados.</p>}
        <div className="stack">
          {(data?.installed ?? []).map((b) => (
            <InstalledBlockRow
              key={b.id}
              block={b}
              latestVersion={updateMap.get(b.blockId)}
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
        <h3>Catálogo</h3>
        {catalog.length === 0 && <p className="muted">No hay bloques disponibles para instalar.</p>}
        <div className="stack">
          {Object.entries(groupedCatalog).map(([category, items]) => (
            <div key={category}>
              <h4 style={{ textTransform: 'capitalize', margin: 'var(--ws-space-3) 0 var(--ws-space-2)' }}>{category}</h4>
              <div className="stack">
              {items.map((b) => (
                <div key={b.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>{catName(b)}</strong>
                    <span className="muted"> v{b.version}</span>
                    {b.author && <span className="muted"> · {b.author}</span>}
                    <span className="badge" style={{ marginLeft: 8 }}>{b.source}</span>
                    {b.verified && (
                      <span className="badge" style={{ marginLeft: 4, background: 'var(--ws-success)', color: '#fff' }}>✔ verificado</span>
                    )}
                    {b.icon && (
                      <img src={b.icon} alt="" style={{ width: 28, height: 28, borderRadius: 6, marginLeft: 8, verticalAlign: 'middle' }} />
                    )}
                    <p className="muted" style={{ margin: 0 }}>
                      {b.description?.['es'] ?? b.description?.['en']}
                    </p>
                  </div>
                  <Button onClick={() => install.mutate({ id: b.id })} disabled={install.isPending}>
                    {t('common.create')}
                  </Button>
                </div>
              ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      )}

      {tab === 'import' && (
      <Card>
        <h3>Importar bloques desde JSON</h3>
        <p className="muted">Pegá una lista de bloques para instalar (formato JSON):</p>
        <textarea className="input" rows={3} value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} placeholder={'[{"id":"mi-bloque","url":"https://github.com/usuario/repo.git","source":"git"}]'} />
        <Button variant="secondary" onClick={importJson}>Importar</Button>
      </Card>
      )}

      {pending && (
        <Card>
          <h3>Seleccioná proveedores para {pending.id}</h3>
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
            <Button onClick={() => install.mutate({ id: pending.id, providers: chosen })}>Confirmar</Button>
            <Button variant="ghost" onClick={() => { setPending(null); setChosen({}); }}>Cancelar</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function InstalledBlockRow({
  block,
  latestVersion,
  onToggle,
  onUninstall,
  onUpdate,
}: {
  block: InstalledBlock;
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
          <strong>{block.name}</strong>
          <span className="muted"> v{block.version}</span>
          {latestVersion && (
            <span className="badge" style={{ marginLeft: 8, background: 'var(--ws-warning)', color: '#111' }}>
              ▲ actualización v{latestVersion}
            </span>
          )}
          <span className="badge" style={{ marginLeft: 8 }}>
            {block.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
        </div>
        <div className="row">
          {block.manifest.settings && (
            <Link to={`/admin/blocks/${block.blockId}`} className="btn secondary">
              Configurar
            </Link>
          )}
          {latestVersion && (
            <Button variant="secondary" onClick={() => onUpdate(block.blockId)}>
              Actualizar
            </Button>
          )}
          <Button variant="secondary" onClick={() => onToggle({ id: block.blockId, enabled: !block.enabled })}>
            {block.enabled ? 'Desactivar' : 'Activar'}
          </Button>
          <Button variant="ghost" onClick={() => onUninstall(block.blockId)}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </div>
  );
}
