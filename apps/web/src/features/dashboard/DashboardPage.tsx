import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth-store';
import { Card } from '../../components/ui/Card';

export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="stack">
      <h1>{t('nav.dashboard')}</h1>
      <Card>
        <p className="muted">
          {t('common.welcome', { defaultValue: 'Bienvenido' })} {user?.email}
        </p>
        <p>
          Esta es la base de la plataforma <strong>Webs</strong>. Configurá el sitio, gestioná bloques,
          contenido, usuarios y apariencia desde las secciones del menú.
        </p>
        <div className="row" style={{ marginTop: 'var(--ws-space-4)' }}>
          <Link to="/settings" className="btn secondary">
            {t('nav.settings')}
          </Link>
          <Link to="/blocks" className="btn secondary">
            {t('nav.blocks')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
