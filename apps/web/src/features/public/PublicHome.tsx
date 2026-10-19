import { Link } from 'react-router-dom';
import { BlockSlot, BlockById } from '../../blocks/BlockSlot';
import { useAuthStore } from '../../lib/auth-store';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface HomePage {
  slug: string;
  title: string;
  layout: Array<{ blocks: string[]; size?: 'full' | 'half' | 'third' }>;
  redirectUrl: string | null;
}

const sizeClass = (size?: string) => (size === 'half' ? 'grid-2' : size === 'third' ? 'grid-3' : '');

/**
 * Página pública (landing) en la raíz `/`: renderiza la **página marcada como
 * inicio** (compuesta por bloques con tamaño/ubicación) o, si no hay página,
 * los slots de bloques por defecto. Si la página tiene `redirectUrl`, redirige.
 */
export function PublicHome() {
  const user = useAuthStore((s) => s.user);
  const { data: page } = useQuery({
    queryKey: ['public-home'],
    queryFn: () => api.get<HomePage>('/api/v1/public/page/home'),
    retry: 0,
  });

  if (page?.redirectUrl) {
    window.location.href = page.redirectUrl;
    return null;
  }

  const sections = page?.layout && page.layout.length > 0 ? page.layout : null;

  return (
    <div className="app-shell">
      <header className="topbar" style={{ padding: 'var(--ws-space-3) var(--ws-space-6)' }}>
        <h1 style={{ margin: 0 }}>{page?.title || 'Webs'}</h1>
        <div className="row">
          {user ? (
            <Link to="/admin" className="btn">Panel</Link>
          ) : (
            <Link to="/login" className="btn">Iniciar sesión</Link>
          )}
        </div>
      </header>

      <main style={{ padding: 'var(--ws-space-6)', flex: 1 }}>
        {sections ? (
          sections.map((section, i) => (
            <div key={i} className={sizeClass(section.size)} style={{ marginBottom: 'var(--ws-space-4)' }}>
              {section.blocks.map((blockId) => (
                <BlockById key={blockId} blockId={blockId} />
              ))}
            </div>
          ))
        ) : (
          <BlockSlot slotId="content" />
        )}
      </main>

      <aside style={{ padding: 'var(--ws-space-6)' }}>
        <BlockSlot slotId="sidebar" />
      </aside>

      <footer style={{ padding: 'var(--ws-space-6)', borderTop: '1px solid var(--ws-border)' }}>
        <BlockSlot slotId="footer" />
      </footer>
    </div>
  );
}
