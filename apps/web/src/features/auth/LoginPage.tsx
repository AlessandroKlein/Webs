import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth-store';
import { ApiClientError } from '../../lib/api';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password, totp || undefined);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'TWO_FACTOR_REQUIRED') {
        setTwoFactorRequired(true);
        setError('Ingresá el código de tu aplicación de autenticación');
      } else {
        setError(err instanceof ApiClientError ? err.message : t('common.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="card" style={{ width: 380 }} onSubmit={onSubmit}>
        <h2>{t('auth.welcome')}</h2>
        <p className="muted">{t('auth.signInSubtitle')}</p>

        <TextField
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          autoFocus
        />
        <TextField
          label={t('auth.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {twoFactorRequired && (
          <TextField
            label="Código de verificación (2FA)"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            autoComplete="one-time-code"
            inputMode="numeric"
            required
          />
        )}

        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

        <Button type="submit" disabled={loading} style={{ width: '100%' }}>
          {t('auth.login')}
        </Button>
      </form>
    </div>
  );
}
