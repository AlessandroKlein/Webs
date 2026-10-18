import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockManifest } from '@webs/plugin-sdk';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { SchemaForm } from '../../components/ui/SchemaForm';

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
  source: 'local' | 'git' | 'npm';
  installed: boolean;
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
    mutationFn: (id: string) => api.post('/api/v1/blocks/install', { id }),
    onSuccess: invalidate,
  });
  const uninstall = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/blocks/${id}`),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/api/v1/blocks/${id}/${enabled ? 'activate' : 'deactivate'}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  const catalog = [
    ...(catalogData?.local ?? []),
    ...(catalogData?.remote ?? []),
  ].filter((b) => !b.installed);

  return (
    <div className="stack">
      <h1>{t('nav.blocks')}</h1>

      <Card>
        <h3>Instalados</h3>
        {(data?.installed ?? []).length === 0 && <p className="muted">No hay bloques instalados.</p>}
        <div className="stack">
          {(data?.installed ?? []).map((b) => (
            <InstalledBlockRow key={b.id} block={b} onToggle={toggle.mutate} onUninstall={uninstall.mutate} />
          ))}
        </div>
      </Card>

      <Card>
        <h3>Catálogo</h3>
        {catalog.length === 0 && <p className="muted">No hay bloques disponibles para instalar.</p>}
        <div className="stack">
          {catalog.map((b) => (
            <div key={b.id} className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{catName(b)}</strong>
                <span className="muted"> v{b.version}</span>
                {b.author && <span className="muted"> · {b.author}</span>}
                <span className="badge" style={{ marginLeft: 8 }}>{b.source}</span>
                <p className="muted" style={{ margin: 0 }}>
                  {b.description?.['es'] ?? b.description?.['en']}
                </p>
              </div>
              <Button onClick={() => install.mutate(b.id)} disabled={install.isPending}>
                {t('common.create')}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function InstalledBlockRow({
  block,
  onToggle,
  onUninstall,
}: {
  block: InstalledBlock;
  onToggle: (arg: { id: string; enabled: boolean }) => void;
  onUninstall: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<Record<string, unknown>>(block.config);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.put(`/api/v1/blocks/${block.blockId}/settings`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }),
  });

  return (
    <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{block.name}</strong>
          <span className="muted"> v{block.version}</span>
          <span className="badge" style={{ marginLeft: 8 }}>
            {block.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
        </div>
        <div className="row">
          {block.manifest.settings && (
            <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
              {t('common.edit')}
            </Button>
          )}
          <Button variant="secondary" onClick={() => onToggle({ id: block.blockId, enabled: !block.enabled })}>
            {block.enabled ? t('common.disabled') : t('common.enabled')}
          </Button>
          <Button variant="ghost" onClick={() => onUninstall(block.blockId)}>
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {open && block.manifest.settings && (
        <div style={{ marginTop: 'var(--ws-space-4)' }}>
          <SchemaForm schema={block.manifest.settings} value={value} onChange={setValue} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => save.mutate(value)} disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
