import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { PluginSlot } from '../plugins/PluginSlot';

/**
 * Envoltura del sitio público: encabezado + contenido + pie (footer/plugins).
 * Reutiliza la estructura de la página de inicio `/` para que `/account`,
 * `/store` y cualquier página pública compartan el mismo header/footer.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <SiteHeader />

      <main style={{ flex: 1 }}>{children}</main>

      <footer style={{ borderTop: '1px solid var(--ws-border)' }}>
        <PluginSlot slotId="footer" />
        <SiteFooter />
      </footer>
    </div>
  );
}
