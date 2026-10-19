import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuthStore, type AuthUser } from '../../lib/auth-store';
import { ApiClientError, api } from '../../lib/api';
import { setSetupToken } from '../../lib/token';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { PromptDialog } from '../../components/ui/PromptDialog';
import { validatePassword } from '../../lib/password';

interface RegisterSettings {
  mode: string;
  defaultRole: string;
}

interface RegisterResult {
  accessToken?: string;
  user?: AuthUser;
  ok?: boolean;
  error?: string;
}

interface SocialProvider {
  id: string;
  name: string;
}

interface SocialVerifyResult {
  ok: boolean;
  linked: boolean;
  userId?: string;
  socialAccountId?: string;
  error?: string;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const finalizeAuth = useAuthStore((s) => s.finalizeAuth);
  const status = useAuthStore((s) => s.status);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [smsRequired, setSmsRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const [showRegister, setShowRegister] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regBirthDate, setRegBirthDate] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  // Login social (simulado): estado del diálogo por pasos providerId → email.
  const [socialProvider, setSocialProvider] = useState<SocialProvider | null>(null);
  const [socialStep, setSocialStep] = useState<'providerId' | 'email' | null>(null);
  const [socialProviderId, setSocialProviderId] = useState('');
  const [socialResult, setSocialResult] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);

  const { data: registerSettings } = useQuery({
    queryKey: ['register-settings'],
    queryFn: () => api.get<RegisterSettings>('/api/v1/blocks/register/settings'),
    retry: 0,
  });
  const canRegister = registerSettings?.mode === 'open' || registerSettings?.mode === 'both';

  // Proveedores de login social habilitados (si el bloque no está instalado, la
  // consulta falla en silencio y no se muestran botones).
  const { data: socialProviders } = useQuery({
    queryKey: ['social-providers'],
    queryFn: () => api.get<SocialProvider[]>('/api/v1/blocks/social-login/providers'),
    retry: 0,
  });

  if (status === 'authenticated') return <Navigate to="/admin" replace />;

  const loginWithPasskey = async () => {
    setPasskeyLoading(true);
    setError(null);
    try {
      const opts = await api.post<{ challengeId: string; options: Parameters<typeof startAuthentication>[0] }>(
        '/api/v1/auth/passkey/login/options',
      );
      const credential = await startAuthentication(opts.options);
      const result = await api.post<{ accessToken: string; user: AuthUser }>(
        '/api/v1/auth/passkey/login/verify',
        { challengeId: opts.challengeId, credential },
      );
      await finalizeAuth(result.accessToken, result.user);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Error al autenticar con passkey');
    } finally {
      setPasskeyLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(identifier, password, totp || undefined, rememberMe, smsCode || undefined);
      navigate('/admin', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'TWO_FACTOR_REQUIRED') {
        setTwoFactorRequired(true);
        setError('Ingresá el código de tu aplicación de autenticación');
      } else if (err instanceof ApiClientError && err.code === 'SMS_REQUIRED') {
        setSmsRequired(true);
        setError('Ingresá el código SMS enviado a tu teléfono');
      } else if (err instanceof ApiClientError && err.code === 'TWO_FACTOR_SETUP_REQUIRED') {
        const token = err.raw?.setupToken;
        if (typeof token === 'string') {
          setSetupToken(token);
          navigate('/setup-2fa', { replace: true });
          return;
        }
        setError('Debés activar 2FA o una passkey para continuar');
      } else {
        setError(err instanceof ApiClientError ? err.message : t('common.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    // Validación client-side ANTES de enviar: fortaleza + repetir contraseña +
    // campos obligatorios. El backend (`/api/v1/auth/register`) exige password
    // de al menos 8 caracteres; acá ya lo exigimos con reglas más estrictas.
    const strength = validatePassword(regPassword);
    const errors: string[] = [];
    if (!regFirstName.trim()) errors.push('El nombre es obligatorio');
    if (!regLastName.trim()) errors.push('El apellido es obligatorio');
    if (!regBirthDate) errors.push('La fecha de nacimiento es obligatoria');
    if (regPassword !== regConfirmPassword) errors.push('Las contraseñas no coinciden');
    errors.push(...strength.errors);
    if (errors.length > 0) {
      setRegError(errors.join(' · '));
      return;
    }

    setRegistering(true);
    try {
      const result = await api.post<RegisterResult>('/api/v1/blocks/register/register', {
        email: regEmail,
        password: regPassword,
        firstName: regFirstName.trim(),
        lastName: regLastName.trim(),
        birthDate: regBirthDate,
        ...(regDisplayName ? { displayName: regDisplayName } : {}),
        ...(regUsername ? { username: regUsername } : {}),
      });
      if (result.accessToken && result.user) {
        await finalizeAuth(result.accessToken, result.user);
        navigate('/admin', { replace: true });
      } else {
        setRegSuccess(t('auth.registerSuccess'));
        setShowRegister(false);
        setRegEmail('');
        setRegPassword('');
        setRegDisplayName('');
        setRegUsername('');
        setRegFirstName('');
        setRegLastName('');
        setRegBirthDate('');
        setRegConfirmPassword('');
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? typeof err.raw?.error === 'string'
            ? err.raw.error
            : err.message
          : t('auth.registerError');
      setRegError(message);
    } finally {
      setRegistering(false);
    }
  };

  const openSocial = (provider: SocialProvider) => {
    setSocialError(null);
    setSocialResult(null);
    setSocialProviderId('');
    setSocialProvider(provider);
    setSocialStep('providerId');
  };

  const verifySocial = async (email: string) => {
    if (!socialProvider) return;
    const provider = socialProvider.id;
    const providerName = socialProvider.name;
    const providerId = socialProviderId.trim();
    if (!providerId) {
      setSocialError('El providerId es obligatorio');
      setSocialStep(null);
      setSocialProvider(null);
      return;
    }
    setSocialLoading(true);
    setSocialError(null);
    setSocialResult(null);
    try {
      // TODO(OAuth real): acá iría el redirect → callback → exchange del
      // proveedor. Por ahora se simula el vínculo con un providerId manual.
      const res = await api.post<SocialVerifyResult>('/api/v1/blocks/social-login/verify', {
        provider,
        providerId,
        ...(email ? { email } : {}),
      });
      if (res.ok) {
        setSocialResult(
          res.linked
            ? `Cuenta de ${providerName} vinculada correctamente.`
            : `Cuenta de ${providerName} registrada (aún sin vínculo de usuario).`,
        );
      } else {
        setSocialError(res.error ?? 'No se pudo verificar la cuenta social');
      }
    } catch (err) {
      setSocialError(err instanceof ApiClientError ? err.message : 'Error al conectar la cuenta social');
    } finally {
      setSocialLoading(false);
      setSocialStep(null);
      setSocialProvider(null);
    }
  };

  return (
    <div className="auth-screen">
      <div className="card" style={{ width: 380 }}>
        {showRegister ? (
          <form className="stack" onSubmit={onRegister}>
            <h2>{t('auth.createAccount')}</h2>
            <p className="muted">{t('auth.signInSubtitle')}</p>

            <TextField
              label={t('auth.email')}
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
            <TextField
              label="Nombre"
              type="text"
              value={regFirstName}
              onChange={(e) => setRegFirstName(e.target.value)}
              autoComplete="given-name"
              required
            />
            <TextField
              label="Apellido"
              type="text"
              value={regLastName}
              onChange={(e) => setRegLastName(e.target.value)}
              autoComplete="family-name"
              required
            />
            <div className="field">
              <label>Fecha de nacimiento</label>
              <input
                className="input"
                type="date"
                value={regBirthDate}
                onChange={(e) => setRegBirthDate(e.target.value)}
                required
              />
            </div>
            <TextField
              label={t('auth.password')}
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <TextField
              label="Repetir contraseña"
              type="password"
              value={regConfirmPassword}
              onChange={(e) => setRegConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p className="muted" style={{ fontSize: 'var(--ws-font-size-sm)', margin: 0 }}>
              Mínimo 8 caracteres, con al menos una letra, un número y un carácter especial.
            </p>
            <TextField
              label={t('auth.displayName')}
              type="text"
              value={regDisplayName}
              onChange={(e) => setRegDisplayName(e.target.value)}
              autoComplete="name"
            />
            <TextField
              label={t('auth.username')}
              type="text"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
              autoComplete="username"
            />

            {regError && <p style={{ color: 'var(--ws-danger)' }}>{regError}</p>}

            <Button type="submit" disabled={registering} style={{ width: '100%' }}>
              {registering ? 'Registrando…' : t('auth.createAccount')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowRegister(false);
                setRegError(null);
              }}
              style={{ width: '100%' }}
            >
              {t('auth.backToLogin')}
            </Button>
          </form>
        ) : (
          <form onSubmit={onSubmit}>
            <h2>{t('auth.welcome')}</h2>
            <p className="muted">{t('auth.signInSubtitle')}</p>

            <TextField
              label={t('auth.identifier')}
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
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

            {smsRequired && (
              <TextField
                label="Código SMS"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            )}

            <label className="row" style={{ gap: 'var(--ws-space-2)', marginBottom: 'var(--ws-space-4)' }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>Recordarme (mantener la sesión abierta)</span>
            </label>

            {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
            {regSuccess && <p style={{ color: 'var(--ws-success, #16a34a)' }}>{regSuccess}</p>}

            <Button type="submit" disabled={loading} style={{ width: '100%' }}>
              {t('auth.login')}
            </Button>

            <Button type="button" variant="secondary" onClick={loginWithPasskey} disabled={passkeyLoading} style={{ width: '100%', marginTop: 'var(--ws-space-2)' }}>
              {passkeyLoading ? 'Verificando…' : 'Iniciar con passkey'}
            </Button>

            {socialError && <p style={{ color: 'var(--ws-danger)', marginTop: 'var(--ws-space-2)' }}>{socialError}</p>}
            {socialResult && <p style={{ color: 'var(--ws-success, #16a34a)', marginTop: 'var(--ws-space-2)' }}>{socialResult}</p>}

            {socialProviders && socialProviders.length > 0 && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--ws-border)', margin: 'var(--ws-space-4) 0' }} />
                <p className="muted" style={{ margin: 0, textAlign: 'center', fontSize: 'var(--ws-font-size-sm)' }}>
                  O iniciá sesión con
                </p>
                <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                  {socialProviders.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="secondary"
                      disabled={socialLoading}
                      onClick={() => openSocial(p)}
                      style={{ width: '100%' }}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {canRegister && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--ws-border)', margin: 'var(--ws-space-4) 0' }} />
                <Button type="button" variant="ghost" onClick={() => setShowRegister(true)} style={{ width: '100%' }}>
                  {t('auth.noAccount')}
                </Button>
              </>
            )}
          </form>
        )}
      </div>

      {/* Diálogos de login social (flujo simulado: providerId → email opcional). */}
      {socialStep === 'providerId' && socialProvider && (
        <PromptDialog
          open
          title={`Conectar con ${socialProvider.name}`}
          label="ID del proveedor (providerId)"
          confirmLabel="Continuar"
          onConfirm={(value) => {
            setSocialProviderId(value.trim());
            setSocialStep('email');
          }}
          onCancel={() => {
            setSocialProvider(null);
            setSocialStep(null);
          }}
        />
      )}
      {socialStep === 'email' && socialProvider && (
        <PromptDialog
          open
          title={`${socialProvider.name} — email`}
          label="Email (opcional)"
          confirmLabel="Verificar"
          onConfirm={(value) => void verifySocial(value.trim())}
          onCancel={() => {
            setSocialProvider(null);
            setSocialStep(null);
          }}
        />
      )}
    </div>
  );
}
