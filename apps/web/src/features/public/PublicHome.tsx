import { BlockSlot } from '../../blocks/BlockSlot';

/**
 * Página pública de ejemplo que demuestra el sistema de slots: los bloques que
 * el administrador coloca en los slots `header`, `content` y `footer` se
 * renderizan aquí automáticamente.
 */
export function PublicHome() {
  return (
    <div className="app-shell">
      <header style={{ padding: 'var(--ws-space-6)', borderBottom: '1px solid var(--ws-border)' }}>
        <h1>Webs</h1>
        <BlockSlot slotId="header" />
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
