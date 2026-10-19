import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useLocaleStore } from '../../lib/locale-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { QrCode } from '../../components/ui/QrCode';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PromptDialog } from '../../components/ui/PromptDialog';

interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    locale: string;
    active: boolean;
  } | null;
  permissions: string[];
  twoFactorEnabled: boolean;
}

type Tab = 'profile' | 'security' | 'password' | 'danger';

export function AccountPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const catalog = useLocaleStore((s) => s.catalog);
  const enabledLocales = useLocaleStore((s) => s.enabled);
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/v1/auth/me'),
  });
  const { data: blocksData } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ installed: Array<{ blockId: string; enabled: boolean }> }>('/api/v1/blocks'),
  });

  const updateProfile = useMutation({
    mutationFn: (body: {
      displayName?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
      locale?: string;
    }) => api.patch('/api/v1/auth/me', body),
    onSuccess: () => {
      setProfileSaved(true);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/api/v1/auth/me'),
    onSuccess: async () => {
      await logout();
      window.location.href = '/';
    },
  });

  const twilioInstalled = blocksData?.installed?.some((b) => b.blockId === 'twilio' && b.enabled);

  const [tab, setTab] = useState<Tab>('profile');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  if (isLoading) return <Spinner />;

  const onProfile = (e: FormEvent) => {
    e.preventDefault();
    setProfileSaved(false);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const displayName = (fd.get('displayName') as string) || null;
    const username = (fd.get('username') as string) || null;
    const avatarUrl = (fd.get('avatarUrl') as string) || null;
    const locale = (fd.get('locale') as string) || 'es';
    updateProfile.mutate({ displayName, username, avatarUrl, locale });
  };

  const tabLabel = (tab: Tab): string =>
    tab === 'profile'
      ? t('admin.account.profile')
      : tab === 'security'
        ? t('admin.account.security')
        : tab === 'password'
          ? t('admin.account.changePassword')
          : t('admin.account.dangerZone');

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.account')}</h1>
        {(['profile', 'security', 'password', 'danger'] as const).map((t) => (
          <button
            key={t}
            className={`nav-link ${tab === t ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setTab(t)}
          >
            {tabLabel(t)}
          </button>
        ))}
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {tab === 'profile' && (
          <>
            <Card>
              <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-4)' }}>
                {data?.user?.avatarUrl ? (
                  <img
                    src={data.user.avatarUrl}
                    alt={t('admin.account.avatar')}
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--ws-border)' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'var(--ws-primary)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.6rem',
                      fontWeight: 700,
                    }}
                  >
                    {(data?.user?.displayName ?? data?.user?.email ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="stack" style={{ gap: 2 }}>
                  <h2 style={{ margin: 0 }}>{data?.user?.displayName ?? data?.user?.email}</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    <i className="bi bi-envelope" /> {data?.user?.email}
                    {data?.user?.username ? <span> · @{data.user.username}</span> : ''}
                  </p>
                  <span
                    className="badge"
                    style={{ alignSelf: 'flex-start', background: data?.user?.active ? 'var(--ws-success, #16a34a)' : 'var(--ws-danger)', color: '#fff' }}
                  >
                    {data?.user?.active ? t('admin.account.active') : t('admin.account.inactive')}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <h3>{t('admin.account.profileData')}</h3>
              <form className="stack" onSubmit={onProfile}>
                <div className="grid-2" style={{ gap: 'var(--ws-space-3)' }}>
                  <TextField label={t('admin.account.name')} name="displayName" defaultValue={data?.user?.displayName ?? ''} placeholder={t('admin.account.namePlaceholder')} />
                  <TextField label={t('admin.account.username')} name="username" defaultValue={data?.user?.username ?? ''} placeholder={t('admin.account.usernamePlaceholder')} />
                  <TextField label={t('admin.account.avatarUrl')} name="avatarUrl" defaultValue={data?.user?.avatarUrl ?? ''} placeholder="https://…" />
                  <div className="field">
                    <label>{t('lang.label')}</label>
                    <select className="input" name="locale" defaultValue={data?.user?.locale ?? 'es'}>
                      {catalog
                        .filter((l) => enabledLocales.includes(l.code))
                        .map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.nativeLabel}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                {profileSaved && (
                  <p className="muted" style={{ color: 'var(--ws-success, #16a34a)', margin: 0 }}>
                    <i className="bi bi-check-circle" /> {t('admin.account.profileSaved')}
                  </p>
                )}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? t('admin.account.saving') : t('admin.account.saveProfile')}
                  </Button>
                </div>
              </form>
            </Card>
          </>
        )}

        {tab === 'security' && (
          <>
            <TwoFactorCard enabled={data?.twoFactorEnabled ?? false} onChanged={() => qc.invalidateQueries({ queryKey: ['me'] })} />
            {twilioInstalled && <SmsTwoFactorCard />}
            <PasskeysCard />
          </>
        )}

        {tab === 'password' && <ChangePasswordCard />}

        {tab === 'danger' && (
          <Card>
            <h3>{t('admin.account.dangerZone')}</h3>
            <p className="muted">{t('admin.account.deleteIrreversible')}</p>
            <Button
              variant="ghost"
              style={{ color: 'var(--ws-danger)' }}
              disabled={deleteAccount.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              {t('admin.account.deleteAccount')}
            </Button>
            <ConfirmDialog
              open={confirmDelete}
              title={t('admin.account.deleteAccount')}
              confirmLabel={t('common.confirmDelete')}
              danger
              onConfirm={() => { setConfirmDelete(false); deleteAccount.mutate(); }}
              onCancel={() => setConfirmDelete(false)}
            >
              {t('admin.account.deleteConfirm')}
            </ConfirmDialog>
          </Card>
        )}
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.post('/api/v1/auth/change-password', { currentPassword, password }),
    onSuccess: () => {
      setMsg(t('admin.account.passwordUpdated'));
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('admin.account.passwordChangeError')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (password !== confirm) {
      setError(t('admin.account.passwordsDontMatch'));
      return;
    }
    change.mutate();
  };

  return (
    <Card>
      <h3>{t('admin.account.changePassword')}</h3>
      <form className="stack" onSubmit={submit}>
        <TextField label={t('admin.account.currentPassword')} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <TextField label={t('admin.account.newPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <TextField label={t('admin.account.confirmNewPassword')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
        {msg && <p style={{ color: 'var(--ws-success, #16a34a)' }}>{msg}</p>}
        <div className="row">
          <Button type="submit" disabled={change.isPending}>{t('admin.account.savePassword')}</Button>
        </div>
      </form>
    </Card>
  );
}

function TwoFactorCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'idle' | 'confirm' | 'codes'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setup = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUrl: string }>('/api/v1/auth/2fa/setup'),
    onSuccess: (r) => {
      setSecret(r.secret);
      setOtpauthUrl(r.otpauthUrl);
      setCode('');
      setStep('confirm');
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const confirm = useMutation({
    mutationFn: () => api.post<{ backupCodes: string[] }>('/api/v1/auth/2fa/confirm', { code }),
    onSuccess: (r) => {
      setBackupCodes(r.backupCodes);
      setStep('codes');
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const disable = useMutation({
    mutationFn: () => api.post('/api/v1/auth/2fa/disable', { code }),
    onSuccess: () => {
      setCode('');
      setStep('idle');
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  return (
    <Card>
      <h3>{t('admin.account.twoFactor')}</h3>
      <p className="muted">
        {enabled
          ? t('admin.account.twoFactorEnabled')
          : t('admin.account.twoFactorDisabled')}
      </p>

      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      {!enabled && step === 'idle' && (
        <Button onClick={() => setup.mutate()} disabled={setup.isPending}>
          {t('admin.account.enable2fa')}
        </Button>
      )}

      {step === 'confirm' && (
        <div className="stack">
          <p className="muted">{t('admin.account.scanCode')}</p>
          <QrCode value={otpauthUrl} />
          <p>
            <strong>{t('admin.account.secretKey')}</strong> <code>{secret}</code>
          </p>
          <p className="muted" style={{ wordBreak: 'break-all' }}>{otpauthUrl}</p>
          <TextField label={t('admin.account.code6')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <div className="row">
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending || code.length < 6}>
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {step === 'codes' && (
        <div className="stack">
          <h4>{t('admin.account.twoFactorActivated')}</h4>
          <p className="muted">{t('admin.account.backupCodes')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--ws-space-2)' }}>
            {backupCodes.map((c) => (
              <code key={c} style={{ background: 'var(--ws-surface-2)', padding: 'var(--ws-space-1)', borderRadius: 'var(--ws-radius-sm)' }}>
                {c}
              </code>
            ))}
          </div>
          <Button onClick={() => setStep('idle')}>{t('admin.account.done')}</Button>
        </div>
      )}

      {enabled && step === 'idle' && (
        <div className="stack">
          <TextField label={t('admin.account.currentCodeToDisable')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <Button variant="ghost" onClick={() => disable.mutate()} disabled={disable.isPending || code.length < 6}>
            {t('admin.account.disable2fa')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function SmsTwoFactorCard() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const setup = async () => {
    setError(null);
    setMsg(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/setup', { phone });
      setStep('code');
      setMsg(t('admin.account.smsCodeSent'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };
  const verify = async () => {
    setError(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/verify', { phone, code });
      setStep('idle');
      setPhone('');
      setCode('');
      setMsg(t('admin.account.sms2faActivated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };
  const disable = async () => {
    setError(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/disable');
      setMsg(t('admin.account.sms2faDeactivated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <Card>
      <h3>{t('admin.account.sms2fa')}</h3>
      <p className="muted">{t('admin.account.sms2faDesc')}</p>
      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      {step === 'idle' && (
        <div className="stack">
          <TextField label={t('admin.account.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="row">
            <Button onClick={setup} disabled={!phone}>
              {t('admin.account.sendCode')}
            </Button>
            <Button variant="ghost" onClick={disable}>
              {t('admin.account.disable')}
            </Button>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div className="stack">
          <TextField label={t('admin.account.smsCode')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <Button onClick={verify} disabled={code.length < 6}>
            {t('admin.account.activate')}
          </Button>
        </div>
      )}
    </Card>
  );
}

interface PasskeyRow {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}
function PasskeysCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api.get<PasskeyRow[]>('/api/v1/auth/passkeys'),
  });
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [renaming, setRenaming] = useState<PasskeyRow | null>(null);

  const register = async () => {
    setRegistering(true);
    setError(null);
    try {
      const opts = await api.post<{ challengeId: string; options: Parameters<typeof startRegistration>[0] }>(
        '/api/v1/auth/passkey/register/options',
      );
      const credential = await startRegistration(opts.options);
      await api.post('/api/v1/auth/passkey/register/verify', { challengeId: opts.challengeId, credential });
      qc.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.account.passkeyRegisterError'));
    } finally {
      setRegistering(false);
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/auth/passkeys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  });
  const rename = useMutation({
    mutationFn: ({ id, deviceName }: { id: string; deviceName: string }) => api.patch(`/api/v1/auth/passkeys/${id}`, { deviceName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  });

  return (
    <Card>
      <h3>{t('admin.account.passkeys')}</h3>
      <p className="muted">{t('admin.account.passkeysDesc')}</p>
      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      <div className="stack">
        {(data ?? []).map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
            <span>
              {p.deviceName ?? t('admin.account.passkey')} <span className="muted">· {t('admin.account.created')} {new Date(p.createdAt).toLocaleDateString()}</span>
            </span>
            <div className="row">
              <Button
                variant="ghost"
                onClick={() => setRenaming(p)}
              >
                {t('common.rename')}
              </Button>
              <Button variant="ghost" onClick={() => remove.mutate(p.id)}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="muted">{t('admin.account.noPasskeys')}</p>}
      </div>

      <Button onClick={register} disabled={registering} style={{ marginTop: 'var(--ws-space-3)' }}>
        {registering ? t('admin.account.registering') : t('admin.account.registerPasskey')}
      </Button>

      <PromptDialog
        open={renaming !== null}
        title={t('admin.account.renamePasskey')}
        label={t('admin.account.deviceName')}
        defaultValue={renaming?.deviceName ?? ''}
        confirmLabel={t('common.save')}
        onConfirm={(name) => {
          if (renaming && name.trim()) rename.mutate({ id: renaming.id, deviceName: name.trim() });
          setRenaming(null);
        }}
        onCancel={() => setRenaming(null)}
      />
    </Card>
  );
}
