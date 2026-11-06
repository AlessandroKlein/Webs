import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    api
      .post('/api/v1/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="auth-screen">
      <Card style={{ maxWidth: 440, textAlign: 'center' }}>
        {status === 'loading' && <p className="muted">{t('auth.verifyingEmail')}</p>}
        {status === 'ok' && (
          <>
            <h2>{t('auth.emailVerified')}</h2>
            <p>{t('auth.emailVerifiedHint')}</p>
            <Link to="/login" className="btn">
              {t('auth.login')}
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h2>{t('auth.invalidOrExpired')}</h2>
            <p className="muted">{t('auth.requestNewVerification')}</p>
          </>
        )}
      </Card>
    </div>
  );
}
