import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { SiteLayout } from '../../components/SiteLayout';
import { Card } from '../../components/ui/Card';

interface BlogPost {
  id: string;
  title: string;
  body: string;
  category: string | null;
  tags: string[];
  status: string;
  createdAt: string;
}

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
function excerptFrom(body: string, max = 300): string {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  const text = looksHtml ? stripHtml(body) : body.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Blog público (`/blog`): lista los posts publicados, uno por tarjeta, con
 * título, extracto del cuerpo, fecha y categoría.
 */
export function BlogListPage() {
  const { data: posts, isLoading, isError } = useQuery({
    queryKey: ['public-blog-posts'],
    queryFn: () => api.get<BlogPost[]>('/api/v1/blocks/blog/posts?status=published'),
    retry: 0,
  });

  return (
    <SiteLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginBottom: 'var(--ws-space-4)' }}
        >
          <h1 style={{ margin: 0 }}>Blog</h1>
          <Link to="/" className="btn ghost">
            <i className="bi bi-arrow-left" /> Volver al inicio
          </Link>
        </div>

        {isLoading && <p className="muted">Cargando…</p>}
        {isError && <p className="muted">No se pudieron cargar las publicaciones.</p>}
        {!isLoading && !isError && (posts ?? []).length === 0 && (
          <p className="muted">Todavía no hay publicaciones.</p>
        )}

        <div className="stack">
          {(posts ?? []).map((p) => (
            <Card key={p.id}>
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}
              >
                <h2 style={{ margin: 0, fontSize: 'var(--ws-font-size-lg)' }}>{p.title}</h2>
                <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                  {new Date(p.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>

              {p.category && (
                <span className="badge" style={{ marginTop: 'var(--ws-space-2)' }}>
                  {p.category}
                </span>
              )}

              <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>
                {excerptFrom(p.body)}
              </p>

              {Array.isArray(p.tags) && p.tags.length > 0 && (
                <div className="row" style={{ gap: 'var(--ws-space-1)', flexWrap: 'wrap', marginTop: 'var(--ws-space-2)' }}>
                  {p.tags.map((tag) => (
                    <span key={tag} className="badge">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </SiteLayout>
  );
}
