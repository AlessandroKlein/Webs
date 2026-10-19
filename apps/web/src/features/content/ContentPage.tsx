import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RichTextEditor } from '../../components/ui/RichTextEditor';
import type { Page } from '@webs/core';

type ContentStatus = 'draft' | 'published' | 'scheduled';

const STATUSES: ContentStatus[] = ['draft', 'published', 'scheduled'];

interface ContentRow {
  id: string;
  type: string;
  slug: string;
  title: Record<string, string>;
  body: Record<string, string> | null;
  status: ContentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContentInput {
  slug: string;
  title: Record<string, string>;
  body: Record<string, string>;
  status: ContentStatus;
}

/** Extrae el texto visible de un campo localizado (`{ es: "...", en: "..." }`). */
function localizedText(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const es = obj['es'];
    if (typeof es === 'string') return es;
    for (const v of Object.values(obj)) {
      if (typeof v === 'string') return v;
    }
  }
  if (typeof value === 'string') return value;
  return '';
}

const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  scheduled: 'Programado',
};

export function ContentPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filters, setFilters] = useState<{ q?: string; status?: string }>({});

  const { data, isLoading } = useQuery({
    queryKey: ['content', filters],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filters.q) qs.set('q', filters.q);
      if (filters.status) qs.set('status', filters.status);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<Page<ContentRow>>(`/api/v1/content${suffix}`);
    },
  });

  // Estado del formulario de creación/edición.
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<ContentStatus>('draft');
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContentRow | null>(null);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [preview, setPreview] = useState<ContentRow | null>(null);

  const save = useMutation({
    mutationFn: (input: ContentInput) =>
      editing
        ? api.patch<ContentRow>(`/api/v1/content/${editing.id}`, input)
        : api.post<ContentRow>('/api/v1/content', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content'] });
      resetForm();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/content/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['content'] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al eliminar'),
  });

  function resetForm() {
    setEditing(null);
    setSlug('');
    setTitle('');
    setBody('');
    setStatus('draft');
    setError(null);
    setFormKey((k) => k + 1);
  }

  function startEdit(row: ContentRow) {
    setEditing(row);
    setSlug(row.slug);
    setTitle(localizedText(row.title));
    setBody(localizedText(row.body));
    setStatus(row.status);
    setError(null);
    setFormKey((k) => k + 1);
  }

  function applyFilters() {
    setFilters({ q: search.trim() || undefined, status: statusFilter || undefined });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !title.trim()) {
      setError('Slug y título son obligatorios');
      return;
    }
    setError(null);
    save.mutate({
      slug: slug.trim(),
      title: { ...(editing?.title ?? {}), es: title.trim() },
      body: { ...(editing?.body ?? {}), es: body },
      status,
    });
  }

  if (isLoading) return <Spinner />;

  const items = data?.items ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.content')}</h1>
        <button className={`nav-link ${view === 'list' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('list')}>Contenido</button>
        <button className={`nav-link ${view === 'editor' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => { resetForm(); setView('editor'); }}>{editing ? 'Editor' : 'Nuevo contenido'}</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
      {view === 'editor' && (
      <Card>
        <h3>{editing ? 'Editar contenido' : 'Nuevo contenido'}</h3>
        <form className="stack" onSubmit={onSubmit}>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              label="Slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="mi-pagina"
              required
            />
            <TextField
              label="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del contenido"
              required
            />
            <div className="field">
              <label>Estado</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ContentStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="muted" style={{ display: 'block', marginTop: 'var(--ws-space-2)' }}>
            Cuerpo del contenido
          </label>
          <RichTextEditor key={formKey} value={body} onChange={setBody} />

          {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}

          <div className="row">
            <Button type="submit" disabled={save.isPending}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
            <Button variant="ghost" onClick={() => { resetForm(); setView('list'); }}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>
      )}

      {view === 'list' && (
      <Card>
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 'var(--ws-space-2)' }}>
            <TextField
              label="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Por slug…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyFilters();
                }
              }}
            />
            <div className="field">
              <label>Estado</label>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Todos</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" onClick={applyFilters}>
              Filtrar
            </Button>
          </div>
          <Button onClick={() => { resetForm(); setView('editor'); }}>Nuevo</Button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Slug</th>
              <th>Estado</th>
              <th>Actualizado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{localizedText(c.title) || '—'}</td>
                <td>
                  <code>{c.slug}</code>
                </td>
                <td>
                  <span className="badge">{STATUS_LABELS[c.status] ?? c.status}</span>
                </td>
                <td>{new Date(c.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="row">
                    <Button variant="ghost" onClick={() => setPreview(c)}>
                      Ver
                    </Button>
                    <Button variant="secondary" onClick={() => { startEdit(c); setView('editor'); }}>
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(c)}>
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">No hay contenido.</p>}
        {data && data.total > items.length && (
          <p className="muted">
            Mostrando {items.length} de {data.total} resultados.
          </p>
        )}
      </Card>
      )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar contenido"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar el contenido <strong>{confirmDelete ? localizedText(confirmDelete.title) || confirmDelete.slug : ''}</strong>? Esta acción es irreversible.
      </ConfirmDialog>

      {preview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPreview(null)}>
          <div style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 'var(--ws-radius-lg)', padding: 'var(--ws-space-6)', maxWidth: 720, width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{localizedText(preview.title) || preview.slug}</h2>
            <div dangerouslySetInnerHTML={{ __html: localizedText(preview.body) }} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setPreview(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
