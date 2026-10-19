import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BlockSlot, BlockById } from '../../blocks/BlockSlot';
import { useAuthStore } from '../../lib/auth-store';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { SiteFooter } from '../../components/SiteFooter';
import { SiteHeader } from '../../components/SiteHeader';

interface HomePage {
  slug: string;
  title: string;
  layout: Array<{ blocks: string[]; size?: 'full' | 'half' | 'third' }>;
  redirectUrl: string | null;
}

interface SiteData {
  name: string;
  tagline: string;
}

const sizeClass = (size?: string) => (size === 'half' ? 'grid-2' : size === 'third' ? 'grid-3' : '');

/**
 * Página pública (landing) en la raíz `/`: encabezado del sitio (logo + menú +
 * usuario), la **página marcada como inicio** (compuesta por bloques) o, si no
 * hay página configurada, un hero por defecto; y el pie con footer/bloques.
 */
export function PublicHome() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data: page } = useQuery({
    queryKey: ['public-home'],
    queryFn: () => api.get<HomePage>('/api/v1/public/page/home'),
    retry: 0,
  });
  const { data: site } = useQuery({
    queryKey: ['public-site'],
    queryFn: () => api.get<SiteData>('/api/v1/public/site'),
    retry: 0,
  });

  if (page?.redirectUrl) {
    window.location.href = page.redirectUrl;
    return null;
  }

  const sections = page?.layout && page.layout.length > 0 ? page.layout : null;
  const siteName = site?.name ?? 'Webs';
  const tagline = site?.tagline ?? '';

  return (
    <div className="app-shell">
      <SiteHeader />

      <main style={{ flex: 1 }}>
        {sections ? (
          <div style={{ padding: 'var(--ws-space-6)' }}>
            <h1 style={{ marginTop: 0 }}>{page?.title}</h1>
            {sections.map((section, i) => (
              <div key={i} className={sizeClass(section.size)} style={{ marginBottom: 'var(--ws-space-4)' }}>
                {section.blocks.map((blockId) => (
                  <BlockById key={blockId} blockId={blockId} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <section className="hero" style={{ padding: 'var(--ws-space-9) var(--ws-space-6)', textAlign: 'center' }}>
            <span className="site-logo-mark hero-mark"><i className="bi bi-grid-1x2" /></span>
            <h1 style={{ fontSize: '2.5rem', margin: 'var(--ws-space-4) 0 var(--ws-space-2)' }}>{siteName}</h1>
            {tagline && <p className="muted" style={{ fontSize: '1.15rem', maxWidth: 560, margin: '0 auto var(--ws-space-5)' }}>{tagline}</p>}
            <div className="row" style={{ justifyContent: 'center', gap: 'var(--ws-space-3)', flexWrap: 'wrap' }}>
              {user ? (
                <Link to="/admin" className="btn" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>{t('site.hero.goToPanel')}</Link>
              ) : (
                <>
                  <Link to="/login" className="btn" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>{t('site.hero.login')}</Link>
                  <Link to="/store" className="btn ghost" style={{ padding: 'var(--ws-space-3) var(--ws-space-5)' }}>{t('site.hero.viewStore')}</Link>
                </>
              )}
            </div>
          </section>
        )}

        <aside style={{ padding: 'var(--ws-space-6)' }}>
          <BlockSlot slotId="sidebar" />
        </aside>
      </main>

      <footer style={{ borderTop: '1px solid var(--ws-border)' }}>
        <BlockSlot slotId="footer" />
        <SiteFooter />
      </footer>
    </div>
  );
}
