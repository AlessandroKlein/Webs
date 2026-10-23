import { AppUpdater } from './AppUpdater';
import { PluginUpdater } from './PluginUpdater';
import { Card } from '../../components/ui/Card';

/**
 * Pantalla de actualizaciones (app + plugins).
 *
 * Compone el actualizador de la APP (t29) con el actualizador de plugins
 * (t28), reusando el contrato ADR-0010 y los componentes de t24
 * (`UpdateStatus`, `Changelog`). El polling y los botones de acción viven en
 * cada actualizador.
 */
export function UpdatesPage() {
  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <h1 style={{ margin: 0 }}>Actualizaciones</h1>
      <Card>
        <Card.Header>
          <Card.Title>Plataforma</Card.Title>
          <Card.Description>Versión instalada y última disponible de la app.</Card.Description>
        </Card.Header>
        <Card.Content>
          <AppUpdater />
        </Card.Content>
      </Card>
      <PluginUpdater />
    </div>
  );
}
