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

export function BlockConfigPage() {
  const { blockId } = useParams();
  const qc = useQueryClient();
  const [value, setValue] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ installed: InstalledBlock[] }>('/api/v1/blocks'),
  });

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => api.put(`/api/v1/blocks/${blockId}/settings`, v),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });

  if (isLoading) return <Spinner />;

  const block = data?.installed.find((b) => b.blockId === blockId);
  if (!block) {
    return (
      <div className="stack">
        <h1>Bloque no encontrado</h1>
        <Link to="/admin/blocks" className="btn secondary">Volver a bloques</Link>
      </div>
    );
  }

  const current = value ?? block.config ?? {};

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{block.name} <span className="muted">v{block.version}</span></h1>
        <Link to="/admin/blocks" className="btn secondary">← Volver</Link>
      </div>

      <Card>
        <h3>Configuración</h3>
        {block.manifest.settings ? (
          <>
            <SchemaForm schema={block.manifest.settings} value={current} onChange={setValue} />
            <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
              {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>Guardado ✓</span>}
              <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
                Guardar
              </Button>
            </div>
          </>
        ) : (
          <p className="muted">Este bloque no expone ajustes configurables.</p>
        )}
      </Card>
    </div>
  );
}
