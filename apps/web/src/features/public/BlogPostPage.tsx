import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { SiteLayout } from '../../components/SiteLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { SupportWidget } from '../../components/SupportWidget';
import { useAuthStore } from '../../lib/auth-store';
import { sanitizeHtml } from '../pages/sanitizeHtml';

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
  createdAt: string;
  publishedAt: string | null;
  authorId: string | null;
}

interface BlogComment {
  id: string;
  content: string;
  createdAt: string;
  authorName?: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Detalle público de un post (`/blog/:slug`) con comentarios. */
export function BlogPostPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [content, setContent] = useState('');

  const { data: post, isLoading, isError } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: () => api.get<BlogPost>(`${BLOG_BASE}/posts/${slug}`),
    retry: 0,
  });

  const { data: comments } = useQuery({
    queryKey: ['blog-comments', slug],
    queryFn: () => api.get<BlogComment[]>(`${BLOG_BASE}/posts/${slug}/comments`),
    retry: 0,
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => api.post(`${BLOG_BASE}/posts/${slug}/comments`, { content: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blog-comments', slug] });
      setContent('');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    commentMutation.mutate(content.trim());
  };

  return (
    <SiteLayout>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <Link to="/blog" className="btn ghost">
          <i className="bi bi-arrow-left" /> {t('blog.backToBlog')}
        </Link>

        {isLoading && <Spinner label={t('blog.loading')} />}
        {isError && <Alert variant="danger">{t('blog.notFound')}</Alert>}

        {!isLoading && !isError && post && (
          <article>
            <h1 style={{ margin: 'var(--ws-space-4) 0 var(--ws-space-2)' }}>{post.title}</h1>
            <p className="muted" style={{ margin: 0 }}>
              <i className="bi bi-calendar3" /> {formatDate(post.publishedAt ?? post.createdAt)}
            </p>

            {post.featuredImage && (
              <img
                src={post.featuredImage}
                alt={post.title}
                style={{
                  width: '100%',
                  maxHeight: 420,
                  objectFit: 'cover',
                  borderRadius: 'var(--ws-radius-md)',
                  marginTop: 'var(--ws-space-4)',
                }}
              />
            )}

            {(post.category || (Array.isArray(post.tags) && post.tags.length > 0)) && (
              <div className="row" style={{ gap: 'var(--ws-space-1)', flexWrap: 'wrap', marginTop: 'var(--ws-space-3)' }}>
                {post.category && (
                  <span className="badge" style={{ background: 'var(--ws-primary-soft)', color: 'var(--ws-primary)' }}>
                    {post.category}
                  </span>
                )}
                {Array.isArray(post.tags) &&
                  post.tags.map((tag) => (
                    <span key={tag} className="badge">
                      #{tag}
                    </span>
                  ))}
              </div>
            )}

            <div
              style={{ lineHeight: 1.7, overflowWrap: 'break-word', maxWidth: '100%', marginTop: 'var(--ws-space-4)' }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
            />

            <section style={{ marginTop: 'var(--ws-space-6)' }}>
              <h2>{t('blog.comments')}</h2>
              {user ? (
                <form className="stack" onSubmit={onSubmit} style={{ marginBottom: 'var(--ws-space-4)' }}>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder={t('blog.commentPlaceholder')}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                  <div className="row">
                    <Button type="submit" disabled={commentMutation.isPending || !content.trim()}>
                      {t('blog.commentSubmit')}
                    </Button>
                  </div>
                  {commentMutation.error && (
                    <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{t('blog.commentError')}</p>
                  )}
                </form>
              ) : (
                <p className="muted">
                  <Link to="/login">{t('blog.commentLogin')}</Link>
                </p>
              )}

              {(comments ?? []).length === 0 ? (
                <p className="muted">{t('blog.noComments')}</p>
              ) : (
                <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
                  {(comments ?? []).map((c) => (
                    <Card key={c.id} style={{ padding: 'var(--ws-space-3)' }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{c.authorName ?? '—'}</strong>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                          {formatDate(c.createdAt)}
                        </span>
                      </div>
                      <p style={{ margin: 'var(--ws-space-2) 0 0' }}>{c.content}</p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </article>
        )}
      </div>
      <SupportWidget />
    </SiteLayout>
  );
}
