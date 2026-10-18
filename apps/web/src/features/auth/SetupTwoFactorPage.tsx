import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import { ApiClientError, apiWithToken } from '../../lib/api';
import { getSetupToken, setSetupToken } from '../../lib/token';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { QrCode } from '../../components/ui/QrCode';

/**
 * Flujo forzado de activación de 2FA/passkey (cuando la política "requerir 2FA
 * a admins" está activa y el usuario aún no tiene segundo factor).
 */
export function SetupTwoFactorPage() {
  const navigate = useNavigate();
  const token = getSetupToken();
  const [step, setStep] = useState<'idle' | 'confirm' | 'codes'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) return <Navigate to="/login" replace />;
  const client = apiWithToken(token);

  const fail = (e: unknown) => setError(e instanceof ApiClientError ? e.message : 'Error inesperado');

  const setup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await client.post<{ secret: string; otpauthUrl: string }>('/api/v1/auth/2fa/setup');
      setSecret(r.secret);
      setOtpauthUrl(r.otpauthUrl);
      setCode('');
      setStep('confirm');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await client.post<{ backupCodes: string[] }>('/api/v1/auth/2fa/confirm', { code });
      setBackupCodes(r.backupCodes);
      setStep('codes');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const registerPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      const opts = await client.post<{ challengeId: string; options: Parameters<typeof startRegistration>[0] }>(
        '/api/v1/auth/passkey/register/options',
      );
      const credential = await startRegistration(opts.options);
      await client.post('/api/v1/auth/passkey/register/verify', { challengeId: opts.challengeId, credential });
      finish();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    setSetupToken(null);
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ maxWidth: 520, margin: '10vh auto', padding: 'var(--ws-space-4)' }}>
      <Card>
        <h2>Activá un segundo factor</h2>
        <p className="muted">
          Tu cuenta requiere **2FA o una passkey** antes de continuar. Elegí una opción:
        </p>

        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

        {step === 'idle' && (
          <div className="stack">
            <Button onClick={setup} disabled={busy}>
              Activar 2FA (app de autenticación)
            </Button>
            <Button variant="secondary" onClick={registerPasskey} disabled={busy}>
              Registrar una passkey (huella/rostro/llave)
            </Button>
            <Button variant="ghost" onClick={() => { setSetupToken(null); navigate('/login', { replace: true }); }}>
              Cerrar sesión
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="stack">
            <p className="muted">Escaneá este código en tu app o ingresá la clave manualmente:</p>
            <QrCode value={otpauthUrl} />
            <p><strong>Clave secreta:</strong> <code>{secret}</code></p>
            <p className="muted" style={{ wordBreak: 'break-all' }}>{otpauthUrl}</p>
            <TextField label="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
            <div className="row">
              <Button onClick={confirm} disabled={busy || code.length < 6}>Confirmar</Button>
              <Button variant="ghost" onClick={() => setStep('idle')}>Volver</Button>
            </div>
          </div>
        )}

        {step === 'codes' && (
          <div className="stack">
            <h4>✔ 2FA activado</h4>
            <p className="muted">Guardá estos códigos de respaldo (se muestran una sola vez):</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--ws-space-2)' }}>
              {backupCodes.map((c) => (
                <code key={c} style={{ background: 'var(--ws-surface-2)', padding: 'var(--ws-space-1)', borderRadius: 'var(--ws-radius-sm)' }}>{c}</code>
              ))}
            </div>
            <Button onClick={finish}>Continuar al inicio de sesión</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
