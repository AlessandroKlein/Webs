import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';

const REGISTER = '/api/v1/blocks/register';
const SOCIAL_LOGIN = '/api/v1/blocks/social-login';

interface RegisterSettings {
  mode: string;
  defaultRole: string;
}

interface InviteResult {
  token?: string;
  invite?: { token?: string };
  [key: string]: unknown;
}

interface SocialProvider {
  id: string;
  name: string;
  enabled: boolean;
}

type View = 'registro' | 'social';

export function AuthConfigPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('registro');

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>{t('admin.auth.title')}</h1>
        <button
          className={`nav-link ${view === 'registro' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('registro')}
        >
          {t('admin.auth.register')}
        </button>
        <button
          className={`nav-link ${view === 'social' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('social')}
        >
          {t('admin.auth.socialLogin')}
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'registro' ? <RegistroView /> : <SocialView />}
      </div>
    </div>
  );
}

function RegistroView() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['register-settings'],
    queryFn: () => api.get<RegisterSettings>(`${REGISTER}/settings`),
  });

  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const requestInvite = useMutation({
    mutationFn: () => api.post<InviteResult>(`${REGISTER}/request-invite`, { email }),
    onSuccess: (res) => {
      setInvite(res);
      setEmail('');
    },
  });

  if (isLoading) return <Spinner />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    requestInvite.mutate();
  };

  const token = invite?.token ?? invite?.invite?.token;

  const copy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inviteLink = token ? `${window.location.origin}/register?invite=${encodeURIComponent(token)}` : null;

  return (
    <div className="stack">
      <h2>{t('admin.auth.register')}</h2>

      <Card>
        <h3>{t('admin.auth.settings')}</h3>
        <div className="row" style={{ gap: 'var(--ws-space-6)', flexWrap: 'wrap' }}>
          <div>
            <strong>{t('admin.auth.mode')}</strong>
            <p className="muted">{settings?.mode ?? '—'}</p>
          </div>
          <div>
            <strong>{t('admin.auth.defaultRole')}</strong>
            <p className="muted">{settings?.defaultRole ?? '—'}</p>
          </div>
        </div>
      </Card>

      <Card>
        <h3>{t('admin.auth.requestInvite')}</h3>
        <form className="stack" onSubmit={onSubmit}>
          <TextField label={t('common.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="row">
            <Button type="submit" disabled={requestInvite.isPending || !email}>
              {t('admin.auth.request')}
            </Button>
          </div>
        </form>
      </Card>

      {requestInvite.isError && (
        <p className="muted" style={{ color: 'var(--ws-danger)' }}>
          {t('admin.auth.requestFailed')}
        </p>
      )}

      {token && (
        <Card style={{ borderColor: 'var(--ws-warning)' }}>
          <h3>{t('admin.auth.inviteCreated')}</h3>
          <div className="row">
            <code
              style={{
                flex: 1,
                wordBreak: 'break-all',
                background: 'var(--ws-surface-2)',
                padding: 'var(--ws-space-2)',
                borderRadius: 'var(--ws-radius-md)',
              }}
            >
              {token}
            </code>
            <Button variant="secondary" onClick={copy}>
              {copied ? t('admin.auth.copied') : t('admin.auth.copy')}
            </Button>
          </div>
          {inviteLink && (
            <p className="muted" style={{ marginTop: 'var(--ws-space-3)' }}>
              {t('admin.auth.link')}: <a href={inviteLink}>{inviteLink}</a>
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function SocialView() {
  const { t } = useTranslation();
  const { data: providers, isLoading } = useQuery({
    queryKey: ['social-login-providers'],
    queryFn: () => api.get<SocialProvider[]>(`${SOCIAL_LOGIN}/providers`),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h2>{t('admin.auth.socialLogin')}</h2>

      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.auth.provider')}</th>
              <th>{t('common.name')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(providers ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  <code>{p.id}</code>
                </td>
                <td>{p.name}</td>
                <td>
                  <span
                    className="badge"
                    style={p.enabled ? undefined : { background: 'var(--ws-surface-2)', color: 'var(--ws-text-muted)' }}
                  >
                    {p.enabled ? t('common.active') : t('common.inactive')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(providers ?? []).length === 0 && <p className="muted">{t('admin.auth.noProviders')}</p>}
      </Card>
    </div>
  );
}
