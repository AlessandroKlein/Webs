import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { type Page, type PageSection } from '../pages/pageTypes';
import { PageLayoutView } from '../pages/PageRenderer';
import { GrapesEditor, type GrapesEditorHandle, type GrapesPluginBlock } from './GrapesEditor';

interface CatalogBlock {
  id: string;
  name: string;
  displayName?: Record<string, string>;
}

/**
 * Builder visual (GrapesJS, MIT) de páginas. El lienzo edita la *estructura*
 * (secciones + bloques, con drag & drop) y se serializa al `layout` JSON que
 * `Page.layout` conserva como fuente de verdad. La persistencia usa el upsert
 * `POST /api/v1/pages/save` (ADR-0011) para páginas nuevas y `PATCH /pages/:id`
 * para páginas existentes (para permitir renombrar el slug sin duplicar).
 */
export function EditorPage() {
  const qc = useQueryClient();
  const editorRef = useRef<GrapesEditorHandle>(null);

  const { data: pages, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<Page[]>('/api/v1/pages'),
  });
  const { data: pluginsData } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.get<{ installed: unknown[]; catalog: CatalogBlock[] }>('/api/v1/plugins'),
  });

  const plugins = useMemo<GrapesPluginBlock[]>(
    () => (pluginsData?.catalog ?? []).map((b) => ({ id: b.id, name: b.displayName?.es ?? b.name })),
    [pluginsData],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [preview, setPreview] = useState<PageSection[]>([]);
  const [saved, setSaved] = useState(false);

  const selectedPage = pages?.find((p) => p.id === selectedId) ?? null;
  const homePage = pages?.find((p) => p.isHome) ?? null;

  // Auto-selecciona la primera página al cargar el listado.
  useEffect(() => {
    if (!selectedId && pages && pages.length > 0) {
      const first = pages[0];
      if (first) setSelectedId(first.id);
    }
  }, [pages, selectedId]);

  // Carga la página seleccionada en el formulario y el lienzo.
  useEffect(() => {
    if (!selectedPage) return;
    setTitle(selectedPage.title);
    setSlug(selectedPage.slug);
    setPreview(selectedPage.layout ?? []);
    editorRef.current?.load(selectedPage.layout ?? []);
  }, [selectedPage?.id]);

  const save = useMutation({
    mutationFn: (vars: { slug: string; title: string; layout: PageSection[]; isHome: boolean }) => {
      if (selectedId) return api.patch(`/api/v1/pages/${selectedId}`, vars);
      return api.post('/api/v1/pages/save', vars);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pages'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const setHome = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/pages/${id}`, { isHome: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
  });

  function handleSelect(id: string) {
    if (!id) {
      // Nueva página.
      setSelectedId(null);
      setTitle('');
      setSlug('');
      setPreview([]);
      editorRef.current?.load([]);
      return;
    }
    setSelectedId(id);
  }

  function handleSave() {
    const layout = editorRef.current?.serialize() ?? preview;
    const isHome = homePage?.id === selectedId;
    save.mutate({ slug: slug.trim(), title: title.trim(), layout, isHome });
  }

  function handleSetHome(id: string) {
    if (!id) return;
    setHome.mutate(id);
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <Card>
        <Card.Header>
          <Card.Title>Builder visual de páginas</Card.Title>
          <Card.Description>
            Editor drag &amp; drop (GrapesJS, MIT). El contenido se guarda como layout estructurado y
            se renderiza con el mismo motor que el sitio público.
          </Card.Description>
        </Card.Header>
        <Card.Content className="stack" style={{ gap: 'var(--ws-space-3)' }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-3)', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label htmlFor="editor-page-select">Página</label>
              <select
                id="editor-page-select"
                className="input"
                value={selectedId ?? ''}
                onChange={(e) => handleSelect(e.target.value)}
              >
                <option value="">＋ Nueva página</option>
                {(pages ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.slug}){p.isHome ? ' · inicio' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ minWidth: 220 }}>
              <label htmlFor="editor-home-select">Página de inicio (landing)</label>
              <select
                id="editor-home-select"
                className="input"
                value={homePage?.id ?? ''}
                onChange={(e) => handleSetHome(e.target.value)}
              >
                <option value="">Ninguna</option>
                {(pages ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.slug})
                  </option>
                ))}
              </select>
            </div>

            <TextField
              label="Slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="mi-pagina"
              hint={selectedId ? 'Identidad de la URL (cambiar crea una redirección vía guardado por slug)' : 'Identificador único en la URL'}
            />
            <TextField
              label="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título de la página"
            />

            <Button onClick={handleSave} loading={save.isPending} disabled={!slug.trim() || !title.trim()}>
              <i className="bi bi-save" aria-hidden="true" /> Guardar
            </Button>
            {saved && <Badge variant="success">Guardado</Badge>}
            {selectedPage?.isHome && <Badge variant="primary">Página de inicio</Badge>}
          </div>
        </Card.Content>
      </Card>

      <div className="row" style={{ alignItems: 'stretch', gap: 'var(--ws-space-4)' }}>
        <div style={{ flex: 1, minWidth: 0, height: 680 }}>
          <GrapesEditor ref={editorRef} plugins={plugins} onChange={setPreview} />
        </div>
        <Card style={{ width: 360, flexShrink: 0, alignSelf: 'flex-start' }}>
          <Card.Header>
            <Card.Title>Vista en vivo</Card.Title>
            <Card.Description>Así se ve en el sitio público (sin estilos del editor).</Card.Description>
          </Card.Header>
          <Card.Content>
            <PageLayoutView sections={preview} />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
