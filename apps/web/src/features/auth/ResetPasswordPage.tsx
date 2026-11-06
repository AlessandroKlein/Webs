import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.passwordsMismatch'));
      return;
    }
    try {
      await api.post('/api/v1/auth/reset-password', { token, password });
      setDone(true);
    } catch {
      setError(t('auth.invalidOrExpired'));
    }
  };

  if (done) {
    return (
      <div className="auth-screen">
        <Card style={{ maxWidth: 440, textAlign: 'center' }}>
          <h2>{t('auth.passwordReset')}</h2>
          <p>{t('auth.passwordResetHint')}</p>
          <Link to="/login" className="btn">
            {t('auth.login')}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="card" style={{ width: '100%', maxWidth: 380 }} onSubmit={submit}>
        <h2>{t('auth.resetPassword')}</h2>
        <TextField label={t('auth.newPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <TextField label={t('auth.confirmPassword')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
        <Button type="submit" fullWidth>
          {t('common.save')}
        </Button>
      </form>
    </div>
  );
}
