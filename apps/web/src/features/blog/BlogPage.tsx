import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const BLOG_BASE = '/api/v1/blocks/blog';

interface BlogPost {
  id: string;
  title: string;
  body: string;
  category: string | null;
  tags: string[];
  status: 'draft' | 'published';
  createdAt: string;
}

type View = 'list' | 'new';

const STATUS_LABEL: Record<BlogPost['status'], string> = {
  draft: 'Borrador',
  published: 'Publicado',
};

export function BlogPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('list');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<BlogPost['status']>('draft');

  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts', q, statusFilter],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (q.trim()) qs.set('q', q.trim());
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<BlogPost[]>(`${BLOG_BASE}/posts${suffix}`);
    },
  });

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    setCategory('');
    setTags('');
    setStatus('draft');
  };

  const openCreate = () => {
    resetForm();
    setView('new');
  };

  const openEdit = (p: BlogPost) => {
    setEditing(p);
    setTitle(p.title);
    setBody(p.body);
    setCategory(p.category ?? '');
    setTags((p.tags ?? []).join(', '));
    setStatus(p.status);
    setView('new');
  };

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? api.patch(`${BLOG_BASE}/posts/${editing.id}`, payload) : api.post(`${BLOG_BASE}/posts`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-posts'] });
      setView('list');
      resetForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${BLOG_BASE}/posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog-posts'] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      title: title.trim(),
      body: body.trim(),
      category: category.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      status,
    };
    save.mutate(payload);
  };

  if (isLoading) return <Spinner />;

  const postList = posts ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Blog</h1>
        <button
          className={`nav-link ${view === 'list' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('list')}
        >
          Listado
        </button>
        <button
          className={`nav-link ${view === 'new' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={openCreate}
        >
          Nuevo post
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'list' && (
          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
              <h3 style={{ margin: 0 }}>Posts</h3>
              <div className="row" style={{ gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder="Buscar por título…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Todos los estados</option>
                  <option value="draft">Borrador</option>
                  <option value="published">Publicado</option>
                </select>
                <Button onClick={openCreate}>Nuevo post</Button>
              </div>
            </div>

            <table className="table" style={{ marginTop: 'var(--ws-space-3)' }}>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Estado</th>
                  <th>Categoría</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {postList.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>
                      <span
                        className="badge"
                        style={
                          p.status === 'published'
                            ? { background: 'var(--ws-success)', color: '#fff' }
                            : { background: 'var(--ws-warning)', color: '#111' }
                        }
                      >
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td>{p.category ?? '—'}</td>
                    <td>
                      <div className="row">
                        <Button variant="secondary" onClick={() => openEdit(p)}>Editar</Button>
                        <Button variant="ghost" onClick={() => setConfirmDelete(p)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {postList.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <p className="muted">No hay posts.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {view === 'new' && (
          <Card>
            <h3 style={{ marginTop: 0 }}>{editing ? 'Editar post' : 'Nuevo post'}</h3>
            <form className="stack" onSubmit={onSubmit}>
              <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <div className="field">
                <label>Cuerpo</label>
                <textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} required />
              </div>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                <TextField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Opcional" />
                <TextField label="Etiquetas (separadas por coma)" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Opcional" />
                <div className="field">
                  <label>Estado</label>
                  <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as BlogPost['status'])}>
                    <option value="draft">Borrador</option>
                    <option value="published">Publicado</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <Button type="submit" disabled={save.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
                <Button variant="ghost" onClick={() => setView('list')}>Cancelar</Button>
                {save.isSuccess && <span style={{ color: 'var(--ws-success)' }}>Guardado ✓</span>}
              </div>
              {save.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{save.error.message}</p>}
            </form>
          </Card>
        )}

        <ConfirmDialog
          open={confirmDelete !== null}
          title="Eliminar post"
          confirmLabel="Eliminar"
          danger
          onConfirm={() => {
            if (confirmDelete) remove.mutate(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        >
          ¿Eliminar el post <strong>{confirmDelete?.title}</strong>? Esta acción es irreversible.
        </ConfirmDialog>
      </div>
    </div>
  );
}
