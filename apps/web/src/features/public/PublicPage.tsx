import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiClientError } from '../../lib/api';
import { SiteLayout } from '../../components/SiteLayout';
import { ErrorPage } from '../../pages/ErrorPage';
import { PageLayoutView } from '../pages/PageRenderer';
import type { PageSection } from '../pages/pageTypes';

interface PublicPageData {
  slug: string;
  title: string;
  layout: PageSection[] | null;
  redirectUrl: string | null;
}

/**
 * Página pública genérica por slug (`/:slug`): resuelve `GET /api/v1/public/page/:slug`
 * y renderiza `{title, layout:[{blocks,size}]}` montando plugins con `PluginById`
 * y elementos de contenido (título, texto, imagen, …). Si la página no existe
 * (404) muestra el `ErrorPage`. También cubre `/clases` y cualquier otra ruta
 * pública del menú.
 */
export function PublicPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-page', slug],
    queryFn: () => api.get<PublicPageData>(`/api/v1/public/page/${slug}`),
    retry: 0,
  });

  if (isLoading) {
    return (
      <div className="auth-screen">
        <p className="muted">{t('common.loading')}</p>
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
        <PageLayoutView sections={sections} />
      </div>
    </SiteLayout>
  );
}
