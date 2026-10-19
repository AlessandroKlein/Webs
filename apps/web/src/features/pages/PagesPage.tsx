import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';

interface Page {
  id: string;
  slug: string;
  title: string;
  layout: Array<{ blocks: string[]; size?: string }>;
  redirectUrl: string | null;
  isHome: boolean;
}

export function PagesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<Page[]>('/api/v1/pages'),
  });

  const create = useMutation({
    mutationFn: (body: { slug: string; title: string; layout?: unknown; redirectUrl?: string | null; isHome?: boolean }) =>
      api.post('/api/v1/pages', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/pages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
  });

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [isHome, setIsHome] = useState(false);
  const [layout, setLayout] = useState('[]');

  if (isLoading) return <Spinner />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(layout || '[]');
    } catch {
      window.alert('El layout debe ser JSON válido');
      return;
    }
    create.mutate({ slug, title, layout: parsed, redirectUrl: redirectUrl || null, isHome });
    setSlug('');
    setTitle('');
    setRedirectUrl('');
    setLayout('[]');
    setIsHome(false);
  };

  return (
    <div className="stack">
      <h1>Páginas</h1>

      <Card>
        <h3>Nueva página</h3>
        <form className="row" onSubmit={onSubmit} style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="contacto" required />
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField label="Redirección (URL externa)" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://…" />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={isHome} onChange={(e) => setIsHome(e.target.checked)} /> Es la página de inicio
          </label>
          <Button type="submit" disabled={create.isPending}>Crear</Button>
        </form>
        <TextField label="Layout (JSON: secciones con bloques y tamaño)" value={layout} onChange={(e) => setLayout(e.target.value)} />
        <p className="muted">
          Ejemplo de layout (JSON): una sección "full" con blog y una "half" con ecommerce y social.
        </p>
      </Card>

      <Card>
        <h3>Páginas existentes</h3>
        <div className="stack">
          {(data ?? []).map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>{p.title}</strong> <span className="muted">/{p.slug}</span>
                {p.isHome && <span className="badge" style={{ marginLeft: 6 }}>inicio</span>}
                {p.redirectUrl && <span className="badge" style={{ marginLeft: 6 }}>redirige</span>}
              </span>
              <Button variant="ghost" onClick={() => remove.mutate(p.id)}>Eliminar</Button>
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="muted">No hay páginas. Creá la primera (marcala como inicio).</p>}
        </div>
      </Card>
    </div>
  );
}
