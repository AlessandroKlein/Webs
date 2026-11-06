import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';

const BLOG_BASE = '/api/v1/blocks/blog';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  featuredImage: string | null;
  category: string | null;
  tags: string[];
  status: 'draft' | 'published';
  createdAt: string;
  publishedAt: string | null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [body, setBody] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<BlogPost['status']>('draft');
  const [publishedAt, setPublishedAt] = useState('');

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
    setSlug('');
    setSlugTouched(false);
    setBody('');
    setExcerpt('');
    setFeaturedImage('');
    setCategory('');
    setTags('');
    setStatus('draft');
    setPublishedAt('');
  };

  const openCreate = () => {
    resetForm();
    setView('new');
  };

  const openEdit = (p: BlogPost) => {
    setEditing(p);
    setTitle(p.title);
    setSlug(p.slug ?? '');
    setSlugTouched(true);
    setBody(p.body);
    setExcerpt(p.excerpt ?? '');
    setFeaturedImage(p.featuredImage ?? '');
    setCategory(p.category ?? '');
    setTags((p.tags ?? []).join(', '));
    setStatus(p.status);
    setPublishedAt(p.publishedAt ? p.publishedAt.slice(0, 10) : '');
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
      slug: slug.trim() || slugify(title.trim()),
      body: body.trim(),
      excerpt: excerpt.trim() || undefined,
      featuredImage: featuredImage.trim() || undefined,
      category: category.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      status,
      publishedAt: publishedAt || undefined,
    };
    save.mutate(payload);
  };

  if (isLoading) return <Spinner />;

  const postList = posts ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <PageHeader title={t('admin.blog.title')} />
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
              <TextField
                label={t('admin.blog.titleCol')}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
                required
              />
              <TextField
                label={t('admin.blog.slug')}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                placeholder={slugify(title)}
              />
              <div className="field">
                <label>{t('admin.blog.body')}</label>
                <textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} required />
              </div>
              <div className="field">
                <label>{t('admin.blog.excerpt')}</label>
                <textarea className="input" rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
              </div>
              <TextField
                label={t('admin.blog.featuredImage')}
                value={featuredImage}
                onChange={(e) => setFeaturedImage(e.target.value)}
                placeholder="https://…"
              />
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                <TextField label={t('admin.blog.category')} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('admin.blog.optional')} />
                <TextField label={t('admin.blog.tags')} value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('admin.blog.optional')} />
                <div className="field">
                  <label>{t('admin.blog.publishedAt')}</label>
                  <input
                    type="date"
                    className="input"
                    style={{ width: 'auto' }}
                    value={publishedAt}
                    onChange={(e) => setPublishedAt(e.target.value)}
                  />
                </div>
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
