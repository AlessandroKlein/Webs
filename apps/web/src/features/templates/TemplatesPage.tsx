import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface Template {
  id: string;
  name: string;
  description?: string;
  blocks?: Array<{ id: string; config?: Record<string, unknown> }>;
}

export function TemplatesPage() {
  const qc = useQueryClient();
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="stack">
      <h1>Plantillas</h1>
      <p className="muted">
        Una plantilla monta un sitio completo: instala y activa bloques, aplica ajustes y crea el
        menú. Ideal para arrancar un gimnasio, un mercado, un blog…
      </p>

      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {(data ?? []).map((tpl) => (
          <Card key={tpl.id}>
            <h3>{tpl.name}</h3>
            <p className="muted">{tpl.description}</p>
            <p className="muted">
              Bloques: {(tpl.blocks ?? []).map((b) => b.id).join(', ') || 'ninguno'}
            </p>
            <Button onClick={() => apply.mutate(tpl.id)} disabled={apply.isPending}>
              {applied === tpl.id ? 'Aplicada ✓' : 'Aplicar plantilla'}
            </Button>
          </Card>
        ))}
        {(data ?? []).length === 0 && <p className="muted">No hay plantillas definidas.</p>}
      </div>
    </div>
  );
}
