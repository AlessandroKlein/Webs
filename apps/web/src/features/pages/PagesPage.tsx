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

type Size = 'full' | 'half' | 'third';

export function PagesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<Page[]>('/api/v1/pages'),
  });
  const { data: blocksData } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ installed: Array<{ blockId: string; name: string }> }>('/api/v1/blocks'),
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
  const [sections, setSections] = useState<Array<{ blocks: string[]; size: Size }>>([]);

  const installedBlocks = (blocksData?.installed ?? []).map((b) => b.blockId);

  const addSection = () => setSections((s) => [...s, { blocks: [], size: 'full' }]);
  const removeSection = (i: number) => setSections((s) => s.filter((_, idx) => idx !== i));
  const setSize = (i: number, size: Size) => setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, size } : sec)));
  const addBlock = (i: number, blockId: string) => setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: [...sec.blocks, blockId] } : sec)));
  const removeBlock = (i: number, blockId: string) => setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: sec.blocks.filter((b) => b !== blockId) } : sec)));

  if (isLoading) return <Spinner />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ slug, title, layout: sections, redirectUrl: redirectUrl || null, isHome });
    setSlug('');
    setTitle('');
    setRedirectUrl('');
    setSections([]);
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

        <hr style={{ border: 'none', borderTop: '1px solid var(--ws-border)', margin: 'var(--ws-space-4) 0' }} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Secciones (bloques + tamaño)</h3>
          <Button variant="secondary" onClick={addSection}>+ Agregar sección</Button>
        </div>

        <div className="stack" style={{ marginTop: 'var(--ws-space-3)' }}>
          {sections.map((sec, i) => (
            <div key={i} style={{ border: '1px solid var(--ws-border)', borderRadius: 'var(--ws-radius-md)', padding: 'var(--ws-space-3)' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--ws-space-2)' }}>
                <strong>Sección {i + 1}</strong>
                <Button variant="ghost" onClick={() => removeSection(i)}>✕</Button>
              </div>
              <div className="row" style={{ marginBottom: 'var(--ws-space-2)' }}>
                {(['full', 'half', 'third'] as Size[]).map((size) => (
                  <Button key={size} variant={sec.size === size ? 'secondary' : 'ghost'} onClick={() => setSize(i, size)}>
                    {size === 'full' ? 'Completo' : size === 'half' ? 'Mitad' : 'Tercio'}
                  </Button>
                ))}
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <select
                  className="input"
                  style={{ width: 'auto' }}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addBlock(i, e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">+ Agregar bloque…</option>
                  {installedBlocks.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {sec.blocks.map((b) => (
                  <span key={b} className="badge" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    {b}
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => removeBlock(i, b)}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {sections.length === 0 && <p className="muted">Sin secciones. Agregá una o dejá la redirección para una página externa.</p>}
        </div>
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
          {(data ?? []).length === 0 && <p className="muted">No hay páginas.</p>}
        </div>
      </Card>
    </div>
  );
}
