import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

export function BlogPage() {
  const { t } = useTranslation();
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
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('admin.blog.title')}</h1>
        <button
          className={`nav-link ${view === 'list' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('list')}
        >
          {t('admin.blog.list')}
        </button>
        <button
          className={`nav-link ${view === 'new' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={openCreate}
        >
          {t('admin.blog.newPost')}
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'list' && (
          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
              <h3 style={{ margin: 0 }}>{t('admin.blog.posts')}</h3>
              <div className="row" style={{ gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <input
                  className="input"
                  placeholder={t('admin.blog.searchPlaceholder')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select className="input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">{t('admin.blog.allStatuses')}</option>
                  <option value="draft">{t('admin.blog.draft')}</option>
                  <option value="published">{t('admin.blog.published')}</option>
                </select>
                <Button onClick={openCreate}>{t('admin.blog.newPost')}</Button>
              </div>
            </div>

            <table className="table" style={{ marginTop: 'var(--ws-space-3)' }}>
              <thead>
                <tr>
                  <th>{t('admin.blog.titleCol')}</th>
                  <th>{t('admin.blog.status')}</th>
                  <th>{t('admin.blog.category')}</th>
                  <th>{t('common.actions')}</th>
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
                        {p.status === 'published' ? t('admin.blog.published') : t('admin.blog.draft')}
                      </span>
                    </td>
                    <td>{p.category ?? '—'}</td>
                    <td>
                      <div className="row">
                        <Button variant="secondary" onClick={() => openEdit(p)}>{t('common.edit')}</Button>
                        <Button variant="ghost" onClick={() => setConfirmDelete(p)}>{t('common.delete')}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {postList.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <p className="muted">{t('admin.blog.noPosts')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        {view === 'new' && (
          <Card>
            <h3 style={{ marginTop: 0 }}>{editing ? t('admin.blog.editPost') : t('admin.blog.newPost')}</h3>
            <form className="stack" onSubmit={onSubmit}>
              <TextField label={t('admin.blog.titleCol')} value={title} onChange={(e) => setTitle(e.target.value)} required />
              <div className="field">
                <label>{t('admin.blog.body')}</label>
                <textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} required />
              </div>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                <TextField label={t('admin.blog.category')} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('admin.blog.optional')} />
                <TextField label={t('admin.blog.tags')} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('admin.blog.optional')} />
                <div className="field">
                  <label>{t('admin.blog.status')}</label>
                  <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as BlogPost['status'])}>
                    <option value="draft">{t('admin.blog.draft')}</option>
                    <option value="published">{t('admin.blog.published')}</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <Button type="submit" disabled={save.isPending}>{editing ? t('common.save') : t('common.create')}</Button>
                <Button variant="ghost" onClick={() => setView('list')}>{t('common.cancel')}</Button>
                {save.isSuccess && <span style={{ color: 'var(--ws-success)' }}>{t('admin.blog.saved')}</span>}
              </div>
              {save.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{save.error.message}</p>}
            </form>
          </Card>
        )}

        <ConfirmDialog
          open={confirmDelete !== null}
          title={t('admin.blog.deletePost')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmDelete) remove.mutate(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        >
          {t('admin.blog.deleteConfirm', { title: confirmDelete?.title })}
        </ConfirmDialog>
      </div>
    </div>
  );
}
