import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { PageHeader } from '../../components/ui/PageHeader';

const SOCIAL_BASE = '/api/v1/blocks/social';

interface FollowCounts {
  followers: number;
  following: number;
}

/**
 * Configuración de la red social (`/admin/social`). El feed y la publicación
 * viven en la página pública `/social`; aquí solo se explica eso y se muestran
 * los contadores de seguidores/seguidos del usuario actual.
 */
export function SocialPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? null;

  const { data: counts, isLoading } = useQuery({
    queryKey: ['social-follow-counts', myId],
    queryFn: () => api.get<FollowCounts>(`${SOCIAL_BASE}/follow/counts?userId=${encodeURIComponent(myId ?? '')}`),
    enabled: !!myId,
  });

  const followers = counts?.followers ?? 0;
  const following = counts?.following ?? 0;

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-5)', maxWidth: 620 }}>
      <PageHeader title={t('nav.social')} />

      <Card>
        <h2 style={{ marginTop: 0 }}>{t('social.settingsTitle')}</h2>
        <p style={{ color: 'var(--ws-text-muted)', margin: '0 0 var(--ws-space-3)' }}>
          {t('social.settingsBefore')} <Link to="/social">/social</Link>{t('social.settingsAfter')}
        </p>
        <Link to="/social" className="btn">
          <i className="bi bi-box-arrow-up-right" /> {t('social.goToPublic')}
        </Link>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>{t('social.yourStats')}</h2>
        {isLoading ? (
          <Spinner label={t('social.loading')} />
        ) : (
          <div className="row" style={{ gap: 'var(--ws-space-5)', flexWrap: 'wrap' }}>
            <div className="stack" style={{ alignItems: 'center', gap: 'var(--ws-space-1)', minWidth: 120 }}>
              <strong style={{ fontSize: '2rem', lineHeight: 1 }}>{followers}</strong>
              <span className="muted">{t('social.followers')}</span>
            </div>
            <div className="stack" style={{ alignItems: 'center', gap: 'var(--ws-space-1)', minWidth: 120 }}>
              <strong style={{ fontSize: '2rem', lineHeight: 1 }}>{following}</strong>
              <span className="muted">{t('social.following')}</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
