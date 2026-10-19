import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth-store';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';

interface Metrics {
  users?: number;
  content?: number;
  media?: number;
  blocks?: number;
  activeSessions?: number;
  payments?: number;
  roles?: number;
  pages?: number;
  email?: { campaigns?: number; automations?: number; sent?: number; opens?: number; clicks?: number };
}

function formatValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '—';
}

export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<Metrics>('/api/v1/admin/metrics'),
  });

  const metrics = [
    { key: 'users', label: t('nav.users'), icon: 'bi-people' },
    { key: 'content', label: t('nav.content'), icon: 'bi-file-earmark-text' },
    { key: 'blocks', label: t('nav.installedBlocks'), icon: 'bi-grid-3x3-gap' },
    { key: 'payments', label: t('nav.payments'), icon: 'bi-credit-card' },
  ] as const;

  const quickLinks = [
    { to: '/admin/content', label: t('nav.content'), icon: 'bi-file-earmark-richtext' },
    { to: '/admin/pages', label: t('nav.pages'), icon: 'bi-layout-text-window-reverse' },
    { to: '/admin/users', label: t('nav.users'), icon: 'bi-people' },
    { to: '/admin/roles', label: t('nav.roles'), icon: 'bi-shield-lock' },
    { to: '/admin/settings', label: t('nav.settings'), icon: 'bi-gear' },
    { to: '/admin/translations', label: t('nav.translations'), icon: 'bi-translate' },
  ];

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
          <h1>{t('nav.dashboard')}</h1>
          <p className="muted" style={{ margin: 0 }}>{user?.email}</p>
        </div>
      </div>

      <div className="grid-2">
        {metrics.map((m) => (
          <Card key={m.key}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
                <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{m.label}</span>
                <span style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                  {isLoading ? '…' : formatValue(data?.[m.key])}
                </span>
              </div>
              <i className={`bi ${m.icon}`} style={{ fontSize: '1.5rem', color: 'var(--ws-primary)' }} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <h3>{t('dashboard.quickAccess')}</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          {quickLinks.map((l) => (
            <Link key={l.to} to={l.to} className="btn secondary">
              <i className={`bi ${l.icon}`} />
              {l.label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
