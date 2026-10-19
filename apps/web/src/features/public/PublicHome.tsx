import { Link } from 'react-router-dom';
import { BlockSlot } from '../../blocks/BlockSlot';
import { useAuthStore } from '../../lib/auth-store';

/**
 * Página pública (landing) en la raíz `/`: renderiza los bloques que el
 * administrador coloca en los slots `header`, `content`, `sidebar` y `footer`,
 * con accesos a iniciar sesión y al panel de administración.
 */
export function PublicHome() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="app-shell">
      <header className="topbar" style={{ padding: 'var(--ws-space-3) var(--ws-space-6)' }}>
        <h1 style={{ margin: 0 }}>Webs</h1>
        <div className="row">
          {user ? (
            <Link to="/admin" className="btn">Panel</Link>
          ) : (
            <Link to="/login" className="btn">Iniciar sesión</Link>
          )}
        </div>
      </header>

      <main style={{ padding: 'var(--ws-space-6)', flex: 1 }}>
        <BlockSlot slotId="content" />
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
