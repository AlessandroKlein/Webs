import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth-store';
import { useLicense } from '../../lib/use-license';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { PageHeader } from '../../components/ui/PageHeader';

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
  const { hasFeature } = useLicense();
  const { data, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.get<Metrics>('/api/v1/admin/metrics'),
  });

  const metrics = [
    { key: 'users', label: t('nav.users'), icon: 'bi-people', feature: 'core' },
    { key: 'content', label: t('nav.content'), icon: 'bi-file-earmark-text', feature: 'core' },
    { key: 'blocks', label: t('nav.installedPlugins'), icon: 'bi-grid-3x3-gap', feature: 'core' },
    { key: 'payments', label: t('nav.payments'), icon: 'bi-credit-card', feature: 'payments' },
  ] as const;

  // Oculta las métricas de features premium no licenciadas (ADR-0019).
  const visibleMetrics = metrics.filter((m) => hasFeature(m.feature));

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
      <PageHeader title={t('nav.dashboard')} description={user?.email} />

      <div className="grid-2">
        {visibleMetrics.map((m) => (
          <StatCard
            key={m.key}
            label={m.label}
            value={isLoading ? '…' : formatValue(data?.[m.key])}
            icon={<i className={`bi ${m.icon}`} />}
          />
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
