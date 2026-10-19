import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
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

  const tabLabel = (t: Tab): string =>
    t === 'profile' ? 'Perfil' : t === 'security' ? 'Seguridad' : t === 'password' ? 'Cambiar contraseña' : 'Zona de peligro';

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Mi cuenta</h1>
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
                    alt="Avatar"
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
                    {data?.user?.active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <h3>Datos del perfil</h3>
              <form className="stack" onSubmit={onProfile}>
                <div className="grid-2" style={{ gap: 'var(--ws-space-3)' }}>
                  <TextField label="Nombre" name="displayName" defaultValue={data?.user?.displayName ?? ''} placeholder="Tu nombre" />
                  <TextField label="Nombre de usuario" name="username" defaultValue={data?.user?.username ?? ''} placeholder="usuario" />
                  <TextField label="Avatar URL" name="avatarUrl" defaultValue={data?.user?.avatarUrl ?? ''} placeholder="https://…" />
                  <div className="field">
                    <label>Idioma</label>
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
                    <i className="bi bi-check-circle" /> Perfil guardado
                  </p>
                )}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? 'Guardando…' : 'Guardar perfil'}
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
            <h3>Zona de peligro</h3>
            <p className="muted">Eliminar tu cuenta es irreversible.</p>
            <Button
              variant="ghost"
              style={{ color: 'var(--ws-danger)' }}
              disabled={deleteAccount.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              Eliminar cuenta
            </Button>
            <ConfirmDialog
              open={confirmDelete}
              title="Eliminar cuenta"
              confirmLabel="Eliminar definitivamente"
              danger
              onConfirm={() => { setConfirmDelete(false); deleteAccount.mutate(); }}
              onCancel={() => setConfirmDelete(false)}
            >
              ¿Seguro que querés eliminar tu cuenta? Esta acción es irreversible y no se puede deshacer.
            </ConfirmDialog>
          </Card>
        )}
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.post('/api/v1/auth/change-password', { currentPassword, password }),
    onSuccess: () => {
      setMsg('Contraseña actualizada ✓');
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al cambiar la contraseña'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    change.mutate();
  };

  return (
    <Card>
      <h3>Cambiar contraseña</h3>
      <form className="stack" onSubmit={submit}>
        <TextField label="Contraseña actual" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <TextField label="Nueva contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <TextField label="Confirmar nueva contraseña" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
        {msg && <p style={{ color: 'var(--ws-success, #16a34a)' }}>{msg}</p>}
        <div className="row">
          <Button type="submit" disabled={change.isPending}>Guardar contraseña</Button>
        </div>
      </form>
    </Card>
  );
}

function TwoFactorCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
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
      <h3>Autenticación de dos factores (2FA)</h3>
      <p className="muted">
        {enabled
          ? '2FA está activo. Al iniciar sesión se pedirá un código de tu app de autenticación (o un código de respaldo).'
          : 'Protegé tu cuenta con un segundo factor (Google Authenticator, Authy, etc.).'}
      </p>

      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      {!enabled && step === 'idle' && (
        <Button onClick={() => setup.mutate()} disabled={setup.isPending}>
          Activar 2FA
        </Button>
      )}

      {step === 'confirm' && (
        <div className="stack">
          <p className="muted">Escaneá el código en tu app o ingresá la clave manualmente:</p>
          <QrCode value={otpauthUrl} />
          <p>
            <strong>Clave secreta:</strong> <code>{secret}</code>
          </p>
          <p className="muted" style={{ wordBreak: 'break-all' }}>{otpauthUrl}</p>
          <TextField label="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <div className="row">
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending || code.length < 6}>
              Confirmar
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {step === 'codes' && (
        <div className="stack">
          <h4>✔ 2FA activado</h4>
          <p className="muted">Guardá estos códigos de respaldo (se muestran una sola vez):</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--ws-space-2)' }}>
            {backupCodes.map((c) => (
              <code key={c} style={{ background: 'var(--ws-surface-2)', padding: 'var(--ws-space-1)', borderRadius: 'var(--ws-radius-sm)' }}>
                {c}
              </code>
            ))}
          </div>
          <Button onClick={() => setStep('idle')}>Listo</Button>
        </div>
      )}

      {enabled && step === 'idle' && (
        <div className="stack">
          <TextField label="Código actual para desactivar" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <Button variant="ghost" onClick={() => disable.mutate()} disabled={disable.isPending || code.length < 6}>
            Desactivar 2FA
          </Button>
        </div>
      )}
    </Card>
  );
}

function SmsTwoFactorCard() {
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
      setMsg('Código enviado por SMS');
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
      setMsg('2FA por SMS activado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };
  const disable = async () => {
    setError(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/disable');
      setMsg('2FA por SMS desactivado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <Card>
      <h3>2FA por SMS</h3>
      <p className="muted">Recibí un código por SMS (requiere el bloque Twilio configurado).</p>
      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      {step === 'idle' && (
        <div className="stack">
          <TextField label="Teléfono (ej. +549…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="row">
            <Button onClick={setup} disabled={!phone}>
              Enviar código
            </Button>
            <Button variant="ghost" onClick={disable}>
              Desactivar
            </Button>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div className="stack">
          <TextField label="Código SMS" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <Button onClick={verify} disabled={code.length < 6}>
            Activar
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
      setError(err instanceof Error ? err.message : 'Error al registrar passkey');
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
      <h3>Passkeys (FIDO2)</h3>
      <p className="muted">Iniciá sesión sin contraseña con tu huella, rostro o llave de seguridad.</p>
      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      <div className="stack">
        {(data ?? []).map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
            <span>
              {p.deviceName ?? 'Passkey'} <span className="muted">· creada {new Date(p.createdAt).toLocaleDateString()}</span>
            </span>
            <div className="row">
              <Button
                variant="ghost"
                onClick={() => setRenaming(p)}
              >
                Renombrar
              </Button>
              <Button variant="ghost" onClick={() => remove.mutate(p.id)}>
                Eliminar
              </Button>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="muted">No hay passkeys registradas.</p>}
      </div>

      <Button onClick={register} disabled={registering} style={{ marginTop: 'var(--ws-space-3)' }}>
        {registering ? 'Registrando…' : 'Registrar passkey'}
      </Button>

      <PromptDialog
        open={renaming !== null}
        title="Renombrar passkey"
        label="Nombre del dispositivo"
        defaultValue={renaming?.deviceName ?? ''}
        confirmLabel="Guardar"
        onConfirm={(name) => {
          if (renaming && name.trim()) rename.mutate({ id: renaming.id, deviceName: name.trim() });
          setRenaming(null);
        }}
        onCancel={() => setRenaming(null)}
      />
    </Card>
  );
}
