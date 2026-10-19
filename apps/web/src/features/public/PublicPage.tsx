import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiClientError } from '../../lib/api';
import { BlockById } from '../../blocks/BlockSlot';
import { SiteLayout } from '../../components/SiteLayout';
import { ErrorPage } from '../../pages/ErrorPage';

interface PublicPageData {
  slug: string;
  title: string;
  layout: Array<{ blocks: string[]; size?: 'full' | 'half' | 'third' }> | null;
  redirectUrl: string | null;
}

const sizeClass = (size?: string) => (size === 'half' ? 'grid-2' : size === 'third' ? 'grid-3' : '');

/**
 * Página pública genérica por slug (`/:slug`): resuelve `GET /api/v1/public/page/:slug`
 * y renderiza `{title, layout:[{blocks,size}]}` montando cada bloque con `BlockById`.
 * Si la página no existe (404) muestra el `ErrorPage`. También cubre `/clases` y
 * cualquier otra ruta pública del menú.
 */
export function PublicPage() {
  const { slug = '' } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-page', slug],
    queryFn: () => api.get<PublicPageData>(`/api/v1/public/page/${slug}`),
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="auth-screen">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  if (error instanceof ApiClientError && error.status === 404) {
    return <ErrorPage />;
  }
  if (!data) return <ErrorPage />;

  if (data.redirectUrl) {
    window.location.href = data.redirectUrl;
    return null;
  }

  const sections = data.layout && data.layout.length > 0 ? data.layout : [];

  return (
    <SiteLayout>
      <div style={{ padding: 'var(--ws-space-6)' }}>
        <h1 style={{ marginTop: 0 }}>{data.title}</h1>
        {sections.map((section, i) => (
          <div key={i} className={sizeClass(section.size)} style={{ marginBottom: 'var(--ws-space-4)' }}>
            {section.blocks.map((blockId) => (
              <BlockById key={blockId} blockId={blockId} />
            ))}
          </div>
        ))}
      </div>
    </SiteLayout>
  );
}
