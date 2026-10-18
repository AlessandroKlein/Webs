import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';

interface MeResponse {
  user: { id: string; email: string; displayName: string | null } | null;
  permissions: string[];
  twoFactorEnabled: boolean;
}

export function AccountPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/v1/auth/me'),
  });

  if (isLoading) return <Spinner />;
  return (
    <div className="stack">
      <h1>Mi cuenta</h1>
      <Card>
        <p>
          <strong>{data?.user?.email}</strong>
          {data?.user?.displayName ? ` — ${data.user.displayName}` : ''}
        </p>
      </Card>
      <TwoFactorCard enabled={data?.twoFactorEnabled ?? false} onChanged={() => qc.invalidateQueries({ queryKey: ['me'] })} />
      <PasskeysCard />
    </div>
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
            <Button variant="ghost" onClick={() => remove.mutate(p.id)}>
              Eliminar
            </Button>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="muted">No hay passkeys registradas.</p>}
      </div>

      <Button onClick={register} disabled={registering} style={{ marginTop: 'var(--ws-space-3)' }}>
        {registering ? 'Registrando…' : 'Registrar passkey'}
      </Button>
    </Card>
  );
}
