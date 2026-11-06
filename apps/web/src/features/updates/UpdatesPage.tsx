import { AppUpdater } from './AppUpdater';
import { useTranslation } from 'react-i18next';
import { PluginUpdater } from './PluginUpdater';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

/**
 * Pantalla de actualizaciones (app + plugins).
 *
 * Compone el actualizador de la APP (t29) con el actualizador de plugins
 * (t28), reusando el contrato ADR-0010 y los componentes de t24
 * (`UpdateStatus`, `Changelog`). El polling y los botones de acción viven en
 * cada actualizador.
 */
export function UpdatesPage() {
  const { t } = useTranslation();
  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <PageHeader title={t('nav.updates')} />
      <Card>
        <Card.Header>
          <Card.Title>{t('updates.platform')}</Card.Title>
          <Card.Description>{t('updates.platformDescription')}</Card.Description>
        </Card.Header>
        <Card.Content>
          <AppUpdater />
        </Card.Content>
      </Card>
      <PluginUpdater />
    </div>
  );
}
