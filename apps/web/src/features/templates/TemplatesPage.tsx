import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';

interface Template {
  id: string;
  name: string;
  description?: string;
  blocks?: Array<{ id: string; config?: Record<string, unknown> }>;
  settings?: Record<string, Record<string, unknown>>;
  menu?: Array<{ label: string; path: string; order?: number }>;
}

function templateMatches(tpl: Template, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    tpl.name,
    tpl.description ?? '',
    ...(tpl.blocks ?? []).map((b) => b.id),
    ...(tpl.menu ?? []).map((m) => m.label),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function TemplatesPage() {
  const qc = useQueryClient();
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<Template[]>('/api/v1/templates'),
  });

  const apply = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/templates/${id}/apply`),
    onSuccess: (_r, id) => {
      setApplied(id);
      setError(null);
      qc.invalidateQueries({ queryKey: ['blocks'] });
      qc.invalidateQueries({ queryKey: ['blocks-catalog'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  if (isLoading) return <Spinner />;

  const filtered = (data ?? []).filter((tpl) => templateMatches(tpl, query));

  return (
    <div className="stack">
      <h1>Plantillas</h1>
      <p className="muted">
        Una plantilla monta un sitio completo: instala y activa plugins, aplica ajustes y crea el
        menú. Ideal para arrancar un gimnasio, un mercado, un blog…
      </p>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar plantillas…"
        aria-label="Buscar plantillas"
        style={{ maxWidth: 360 }}
      />

      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      <div className="grid-2">
        {filtered.map((tpl) => (
          <Card key={tpl.id} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3>{tpl.name}</h3>
            <p className="muted">{tpl.description}</p>
            <p className="muted">
              Plugins: {(tpl.blocks ?? []).map((b) => b.id).join(', ') || 'ninguno'}
            </p>
            <p className="muted">
              Menú: {(tpl.menu ?? []).map((m) => m.label).join(' · ') || '—'}
            </p>
            {tpl.settings && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                {(tpl.settings.site?.name as string | undefined) && (
                  <span className="badge">🏷 {String(tpl.settings.site?.name)}</span>
                )}
                {(tpl.settings.appearance?.primaryColor as string | undefined) && (
                  <span className="row" style={{ gap: 6 }}>
                    <span
                      style={{ width: 16, height: 16, borderRadius: 4, background: String(tpl.settings.appearance?.primaryColor), border: '1px solid var(--ws-border)' }}
                    />
                    <span className="muted">{String(tpl.settings.appearance?.primaryColor)}</span>
                  </span>
                )}
              </div>
            )}
            <div style={{ marginTop: 'auto', paddingTop: 'var(--ws-space-3)' }}>
              <Button onClick={() => apply.mutate(tpl.id)} disabled={apply.isPending}>
                {applied === tpl.id ? 'Aplicada ✓' : 'Aplicar plantilla'}
              </Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="muted">No se encontraron plantillas.</p>}
      </div>
    </div>
  );
}
