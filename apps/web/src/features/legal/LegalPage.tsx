import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { renderMarkdown } from '../../lib/markdown';

export type LegalSlug = 'terms' | 'privacy' | 'cookies' | 'disclaimer';

interface LegalDocument {
  slug: string;
  title: string;
  content: string;
}

/**
 * Página legal pública (`/legal/:slug`). El contenido se lee de la sección de
 * ajustes `legal` vía `GET /api/v1/public/legal/:slug` (Markdown) y se renderiza
 * a HTML de forma segura con `renderMarkdown`. Se usa junto a `<SiteLayout>` en
 * `App.tsx`, por lo que comparte header/footer con el resto del sitio público.
 */
export function LegalPage({ slug }: { slug: LegalSlug }) {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-legal', slug],
    queryFn: () => api.get<LegalDocument>(`/api/v1/public/legal/${slug}`),
    retry: 0,
  });

  const fallbackTitle = t(`legal.${slug}`);
  const title = data?.title || fallbackTitle;

  if (isLoading) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  const content = data?.content ?? '';

  if (isError || !data || !content.trim()) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        <p className="muted">
          {isError ? 'No se pudo cargar este documento legal.' : 'Este documento aún no tiene contenido.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
      <article className="legal-document" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
    </div>
  );
}
