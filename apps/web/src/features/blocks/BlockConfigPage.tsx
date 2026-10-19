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

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.post(`/api/v1/blocks/${blockId}/${enabled ? 'activate' : 'deactivate'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }),
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
  const m = block.manifest;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{m.displayName?.['es'] ?? block.name} <span className="muted">v{block.version}</span></h1>
        <Link to="/admin/blocks" className="btn secondary">← Volver</Link>
      </div>

      <Card>
        <h3>Estado</h3>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="badge">{block.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
          <Button variant="secondary" onClick={() => toggle.mutate(!block.enabled)} disabled={toggle.isPending}>
            {block.enabled ? 'Deshabilitar' : 'Habilitar'}
          </Button>
        </div>
      </Card>

      <Card>
        <h3>Información</h3>
        <dl className="stack" style={{ margin: 0 }}>
          <div><dt className="muted" style={{ display: 'inline' }}>Descripción: </dt><dd style={{ display: 'inline' }}>{m.description?.['es'] ?? m.description?.['en'] ?? '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Autor: </dt><dd style={{ display: 'inline' }}>{m.author ?? '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Licencia: </dt><dd style={{ display: 'inline' }}>{m.license ?? '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>ID: </dt><dd style={{ display: 'inline' }}><code>{block.blockId}</code></dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Slots: </dt><dd style={{ display: 'inline' }}>{(m.slots ?? []).join(', ') || '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Permisos: </dt><dd style={{ display: 'inline' }}>{(m.permissions ?? []).join(', ') || '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Eventos: </dt><dd style={{ display: 'inline' }}>{(m.events ?? []).join(', ') || '—'}</dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Entry (server): </dt><dd style={{ display: 'inline' }}><code>{m.entry ?? '—'}</code></dd></div>
          <div><dt className="muted" style={{ display: 'inline' }}>Entry (client): </dt><dd style={{ display: 'inline' }}><code>{m.clientEntry ?? '—'}</code></dd></div>
        </dl>
      </Card>

      <Card>
        <h3>Configuración</h3>
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
          <p className="muted">Este bloque no expone ajustes configurables.</p>
        )}
      </Card>
    </div>
  );
}
