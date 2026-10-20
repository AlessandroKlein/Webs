import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { SiteLayout } from '../../components/SiteLayout';
import { Card } from '../../components/ui/Card';
import { SupportWidget } from '../../components/SupportWidget';

interface BlogPost {
  id: string;
  title: string;
  body: string;
  category: string | null;
  tags: string[];
  status: string;
  createdAt: string;
}

const PAGE_SIZE = 10;

/** Convierte un fragmento HTML en texto plano (decodificando entidades). */
function stripHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/** Extrae un resumen de hasta `max` caracteres (texto plano) del cuerpo del post. */
function excerptFrom(body: string, max = 200): string {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  const text = looksHtml ? stripHtml(body) : body.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** Devuelve la URL de la primera imagen del HTML del cuerpo, o `null`. */
function extractImage(html: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const src = doc.querySelector('img')?.getAttribute('src');
    if (src && src.trim()) return src.trim();
  } catch {
    /* fallback por regex */
  }
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  const fallback = m?.[1]?.trim();
  return fallback || null;
}

/** Formatea una fecha ISO a un formato legible en español (Argentina). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Blog público (`/blog`): lista los posts publicados, ordenados por fecha
 * descendente, con paginación (máx. 10 por página). Cada tarjeta muestra la
 * imagen (si el cuerpo referencia una, o un placeholder), título, fecha,
 * categoría/tags, un resumen y un botón "Leer más" que expande el cuerpo
 * completo (HTML) en la propia tarjeta.
 */
export function BlogListPage() {
  const { data: posts, isLoading, isError } = useQuery({
    queryKey: ['public-blog-posts'],
    queryFn: () => api.get<BlogPost[]>('/api/v1/blocks/blog/posts?status=published'),
    retry: 0,
  });

  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const list = [...(posts ?? [])];
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }, [posts]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const goTo = (p: number) => {
    setPage(Math.max(0, Math.min(p, totalPages - 1)));
    setExpandedId(null);
  };

  return (
    <SiteLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-4)' }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Blog</h1>
            {!isLoading && !isError && (
              <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
                {sorted.length} {sorted.length === 1 ? 'publicación' : 'publicaciones'}
              </p>
            )}
          </div>
          <Link to="/" className="btn ghost">
            <i className="bi bi-arrow-left" /> Volver al inicio
          </Link>
        </div>

        {isLoading && <p className="muted">Cargando publicaciones…</p>}
        {isError && <p className="muted">No se pudieron cargar las publicaciones.</p>}
        {!isLoading && !isError && sorted.length === 0 && (
          <p className="muted">Todavía no hay publicaciones.</p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 'var(--ws-space-4)',
          }}
        >
          {pageItems.map((p) => {
            const image = extractImage(p.body);
            const excerpt = excerptFrom(p.body);
            const expanded = expandedId === p.id;
            return (
              <Card
                key={p.id}
                style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              >
                {/* Imagen primero (o placeholder) */}
                <div style={{ height: 200, background: 'var(--ws-surface-2)', overflow: 'hidden', flex: '0 0 auto' }}>
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
                  <h2 style={{ margin: 0, fontSize: 'var(--ws-font-size-lg)' }}>{p.title}</h2>

                  <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                    <i className="bi bi-calendar3" /> {formatDate(p.createdAt)}
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
                    <button className="btn ghost" onClick={() => setExpandedId(expanded ? null : p.id)}>
                      <i className={`bi bi-${expanded ? 'chevron-up' : 'chevron-down'}`} />{' '}
                      {expanded ? 'Leer menos' : 'Leer más'}
                    </button>
                  </div>

                  {expanded && (
                    <div
                      style={{ lineHeight: 1.65, overflowWrap: 'break-word', maxWidth: '100%' }}
                      dangerouslySetInnerHTML={{ __html: p.body }}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {!isLoading && !isError && sorted.length > PAGE_SIZE && (
          <div
            className="row"
            style={{ justifyContent: 'center', gap: 'var(--ws-space-3)', marginTop: 'var(--ws-space-5)', flexWrap: 'wrap' }}
          >
            <button className="btn ghost" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 0}>
              <i className="bi bi-chevron-left" /> Anterior
            </button>
            <span className="muted">
              Página {currentPage + 1} de {totalPages}
            </span>
            <button className="btn ghost" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages - 1}>
              Siguiente <i className="bi bi-chevron-right" />
            </button>
          </div>
        )}
      </div>
      <SupportWidget />
    </SiteLayout>
  );
}
