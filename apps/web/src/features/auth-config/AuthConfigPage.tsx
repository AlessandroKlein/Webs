import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';

const REGISTER = '/api/v1/blocks/register';
const SOCIAL_LOGIN = '/api/v1/plugins/social-login';

interface RegisterSettings {
  mode: 'open' | 'invite' | 'both' | string;
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
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

interface SocialLoginSettings {
  blockId: string;
  schema: unknown;
  value: {
    providers?: SocialProvider[];
    autoLinkByEmail?: boolean;
  };
}

/** Proveedores por defecto según `blocks/social-login/block.json`. */
const DEFAULT_PROVIDERS: SocialProvider[] = [
  { id: 'google', name: 'Google', enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
  { id: 'facebook', name: 'Facebook', enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
  { id: 'apple', name: 'Apple', enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
  { id: 'github', name: 'GitHub', enabled: false, clientId: '', clientSecret: '', redirectUri: '' },
];

function mergeProviders(apiProviders?: SocialProvider[]): SocialProvider[] {
  const list = Array.isArray(apiProviders) && apiProviders.length ? apiProviders : [];
  const merged = DEFAULT_PROVIDERS.map((def) => {
    const api = list.find((p) => p.id === def.id);
    if (!api) return { ...def };
    return {
      id: def.id,
      name: api.name || def.name,
      enabled: Boolean(api.enabled),
      clientId: api.clientId ?? '',
      clientSecret: api.clientSecret ?? '',
      redirectUri: api.redirectUri ?? '',
    };
  });
  // Preserva proveedores adicionales no listados por defecto.
  for (const api of list) {
    if (!merged.some((m) => m.id === api.id)) {
      merged.push({
        id: api.id,
        name: api.name || api.id,
        enabled: Boolean(api.enabled),
        clientId: api.clientId ?? '',
        clientSecret: api.clientSecret ?? '',
        redirectUri: api.redirectUri ?? '',
      });
    }
  }
  return merged;
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
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['register-settings'],
    queryFn: () => api.get<RegisterSettings>(`${REGISTER}/settings`),
  });

  const [mode, setMode] = useState<string>('open');
  const [defaultRole, setDefaultRole] = useState<string>('user');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setMode(settings.mode ?? 'open');
    setDefaultRole(settings.defaultRole ?? 'user');
  }, [settings]);

  const save = useMutation({
    mutationFn: () => api.put(`${REGISTER}/settings`, { mode, defaultRole }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['register-settings'] });
    },
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

  const modeOptions = [
    { value: 'open', label: t('admin.auth.modeOpen') },
    { value: 'invite', label: t('admin.auth.modeInvite') },
    { value: 'both', label: t('admin.auth.modeBoth') },
  ];
  const roleOptions = [
    { value: 'user', label: t('admin.auth.roleUser') },
    { value: 'editor', label: t('admin.auth.roleEditor') },
  ];

  return (
    <div className="stack">
      <h2>{t('admin.auth.register')}</h2>

      <Card>
        <h3>{t('admin.auth.settings')}</h3>
        <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
          <div className="row" style={{ gap: 'var(--ws-space-6)', flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 200 }}>
              <label>{t('admin.auth.mode')}</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label>{t('admin.auth.defaultRole')}</label>
              <select className="input" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}>
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
            {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>{t('admin.auth.saved')}</span>}
            {save.isError && (
              <span className="muted" style={{ color: 'var(--ws-danger)' }}>
                {t('admin.auth.saveFailed')}
              </span>
            )}
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {t('common.save')}
            </Button>
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
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-login-settings'],
    queryFn: () => api.get<SocialLoginSettings>(`${SOCIAL_LOGIN}/settings`),
  });

  const [providers, setProviders] = useState<SocialProvider[]>(DEFAULT_PROVIDERS);
  const [autoLinkByEmail, setAutoLinkByEmail] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data?.value) return;
    setProviders(mergeProviders(data.value.providers));
    if (typeof data.value.autoLinkByEmail === 'boolean') {
      setAutoLinkByEmail(data.value.autoLinkByEmail);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put(`${SOCIAL_LOGIN}/settings`, { providers, autoLinkByEmail }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['social-login-settings'] });
    },
  });

  if (isLoading) return <Spinner />;

  const updateProvider = (id: string, patch: Partial<SocialProvider>) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  return (
    <div className="stack">
      <h2>{t('admin.auth.socialLogin')}</h2>

      <Card>
        <h3>{t('admin.auth.settings')}</h3>
        <div className="stack" style={{ gap: 'var(--ws-space-5)' }}>
          {providers.map((p) => (
            <fieldset
              key={p.id}
              className="stack"
              style={{
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
                padding: 'var(--ws-space-4)',
                margin: 0,
              }}
            >
              <legend className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center', fontWeight: 600, paddingInline: 'var(--ws-space-2)' }}>
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })}
                />
                <span>{p.name}</span>
                <code className="muted" style={{ fontWeight: 400 }}>{p.id}</code>
              </legend>
              <div className="row" style={{ gap: 'var(--ws-space-4)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <TextField
                    label={t('admin.auth.clientId')}
                    value={p.clientId}
                    onChange={(e) => updateProvider(p.id, { clientId: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <TextField
                    label={t('admin.auth.clientSecret')}
                    type="password"
                    value={p.clientSecret}
                    onChange={(e) => updateProvider(p.id, { clientSecret: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>
          ))}

          <label className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={autoLinkByEmail}
              onChange={(e) => setAutoLinkByEmail(e.target.checked)}
            />
            <span>{t('admin.auth.autoLinkByEmail')}</span>
          </label>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
            {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>{t('admin.auth.saved')}</span>}
            {save.isError && (
              <span className="muted" style={{ color: 'var(--ws-danger)' }}>
                {t('admin.auth.saveFailed')}
              </span>
            )}
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
