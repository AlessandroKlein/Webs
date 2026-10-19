import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockManifest } from '@webs/plugin-sdk';
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

interface LocalCatalogItem {
  id: string;
  category?: string;
}

export function BlockSettingsPage() {
  const { category } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ installed: InstalledBlock[] }>('/api/v1/blocks'),
  });
  const { data: catalogData } = useQuery({
    queryKey: ['blocks-catalog'],
    queryFn: () => api.get<{ local: LocalCatalogItem[] }>('/api/v1/blocks/catalog'),
  });

  if (isLoading) return <Spinner />;

  const categoryById = new Map((catalogData?.local ?? []).map((c) => [c.id, c.category]));

  const grouped = new Map<string, InstalledBlock[]>();
  for (const block of data?.installed ?? []) {
    const cat = categoryById.get(block.blockId) || 'Otros';
    const list = grouped.get(cat) ?? [];
    list.push(block);
    grouped.set(cat, list);
  }

  const categories = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  const selected = category && categories.includes(category) ? category : (categories[0] ?? null);

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Configuración de bloques</h1>
        {categories.map((cat) => (
          <Link
            key={cat}
            to={`/admin/block-settings/${encodeURIComponent(cat)}`}
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
            {(grouped.get(selected) ?? []).map((block) => (
              <BlockSettingsCard key={block.blockId} block={block} />
            ))}
          </>
        ) : (
          <Card>
            <p className="muted" style={{ margin: 0 }}>No hay bloques instalados.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function BlockSettingsCard({ block }: { block: InstalledBlock }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.put(`/api/v1/blocks/${block.blockId}/settings`, v),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });

  const m = block.manifest;
  const title = m.displayName?.['es'] ?? m.displayName?.['en'] ?? block.name;
  const current = value ?? block.config ?? {};

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="muted">v{block.version}</span>
      </div>
      {m.settings ? (
        <>
          <SchemaForm schema={m.settings} value={current} onChange={setValue} />
          <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
            {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>Guardado ✓</span>}
            <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
              Guardar
            </Button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Este bloque no expone ajustes</p>
      )}
    </Card>
  );
}
