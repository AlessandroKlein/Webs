import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth-store';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface Metrics {
  users: number;
  content: number;
  media: number;
  blocks: number;
  activeSessions: number;
  email: { campaigns: number; automations: number; sent: number; opens: number; clicks: number };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--ws-space-3)' }}>
      <div style={{ fontSize: '1.8em', fontWeight: 700 }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<Metrics>('/api/v1/admin/metrics'),
  });

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

      {isLoading ? (
        <Spinner />
      ) : (
        data && (
          <Card>
            <h3>Métricas</h3>
            <div className="grid-3" style={{ gap: 'var(--ws-space-2)' }}>
              <Stat label="Usuarios" value={data.users} />
              <Stat label="Contenido" value={data.content} />
              <Stat label="Medios" value={data.media} />
              <Stat label="Bloques instalados" value={data.blocks} />
              <Stat label="Sesiones activas" value={data.activeSessions} />
              <Stat label="Campañas" value={data.email.campaigns} />
              <Stat label="Correos enviados" value={data.email.sent} />
              <Stat label="Aperturas" value={data.email.opens} />
              <Stat label="Clics" value={data.email.clicks} />
            </div>
          </Card>
        )
      )}
    </div>
  );
}
