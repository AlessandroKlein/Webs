import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { SiteLayout } from '../../components/SiteLayout';
import { Card } from '../../components/ui/Card';
import { SupportWidget } from '../../components/SupportWidget';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  featuredImage: string | null;
  category: string | null;
  tags: string[];
  status: string;
  createdAt: string;
  publishedAt: string | null;
  authorId: string | null;
}

interface BlogPostsResponse {
  items: BlogPost[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 10;

/** Formatea una fecha ISO a un formato legible en español (Argentina). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Blog público (`/blog`): lista los posts publicados con paginación
 * server-side (límite/offset). Cada tarjeta enlaza al detalle `/blog/:slug`.
 */
export function BlogListPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-blog-posts', page],
    queryFn: () =>
      api.get<BlogPostsResponse>(
        `/api/v1/blocks/blog/posts?status=published&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      ),
    retry: 0,
  });

  const posts = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  const goTo = (p: number) => {
    setPage(Math.max(0, Math.min(p, totalPages - 1)));
  };

  return (
    <SiteLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-4)' }}
        >
          <div>
            <h1 style={{ margin: 0 }}>{t('blog.title')}</h1>
            {!isLoading && !isError && (
              <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
                {t('blog.postsTotal', { count: total })}
              </p>
            )}
          </div>
          <Link to="/" className="btn ghost">
            <i className="bi bi-arrow-left" /> {t('blog.backHome')}
          </Link>
        </div>

        {isLoading && <p className="muted">{t('blog.loading')}</p>}
        {isError && <p className="muted">{t('blog.loadError')}</p>}
        {!isLoading && !isError && posts.length === 0 && (
          <p className="muted">{t('blog.empty')}</p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 'var(--ws-space-4)',
          }}
        >
          {posts.map((p) => {
            const image = p.featuredImage;
            const excerpt = p.excerpt;
            return (
              <Card
                key={p.id}
                style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              >
                {/* Imagen primero (o placeholder) */}
                <div style={{ aspectRatio: '16 / 9', background: 'var(--ws-surface-2)', overflow: 'hidden', flex: '0 0 auto' }}>
                  {image ? (
                    <img
                      src={image}
                      alt={p.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ws-text-muted)',
                      }}
                    >
                      <i className="bi bi-image" style={{ fontSize: '3rem' }} />
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: 'var(--ws-space-5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--ws-space-3)',
                    flex: 1,
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 'var(--ws-font-size-lg)' }}>
                    <Link to={`/blog/${p.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {p.title}
                    </Link>
                  </h2>

                  <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                    <i className="bi bi-calendar3" /> {formatDate(p.publishedAt ?? p.createdAt)}
                  </span>

                  {(p.category || (Array.isArray(p.tags) && p.tags.length > 0)) && (
                    <div className="row" style={{ gap: 'var(--ws-space-1)', flexWrap: 'wrap' }}>
                      {p.category && (
                        <span className="badge" style={{ background: 'var(--ws-primary-soft)', color: 'var(--ws-primary)' }}>
                          {p.category}
                        </span>
                      )}
                      {Array.isArray(p.tags) &&
                        p.tags.map((tag) => (
                          <span key={tag} className="badge">
                            #{tag}
                          </span>
                        ))}
                    </div>
                  )}

                  {excerpt && <p className="muted" style={{ margin: 0 }}>{excerpt}</p>}

                  <div style={{ marginTop: 'auto', paddingTop: 'var(--ws-space-2)' }}>
                    <Link to={`/blog/${p.slug}`} className="btn ghost">
                      <i className="bi bi-arrow-right" /> {t('blog.readMore')}
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {!isLoading && !isError && total > PAGE_SIZE && (
          <div
            className="row"
            style={{ justifyContent: 'center', gap: 'var(--ws-space-3)', marginTop: 'var(--ws-space-5)', flexWrap: 'wrap' }}
          >
            <button className="btn ghost" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 0}>
              <i className="bi bi-chevron-left" /> {t('blog.previous')}
            </button>
            <span className="muted">
              {t('blog.pageOf', { current: currentPage + 1, total: totalPages })}
            </span>
            <button className="btn ghost" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages - 1}>
              {t('blog.next')} <i className="bi bi-chevron-right" />
            </button>
          </div>
        )}
      </div>
      <SupportWidget />
    </SiteLayout>
  );
}
