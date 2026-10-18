import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function ResetPasswordPage() {
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
      setError('Las contraseñas no coinciden');
      return;
    }
    try {
      await api.post('/api/v1/auth/reset-password', { token, password });
      setDone(true);
    } catch {
      setError('Enlace inválido o expirado');
    }
  };

  if (done) {
    return (
      <div className="auth-screen">
        <Card style={{ maxWidth: 440, textAlign: 'center' }}>
          <h2>✔ Contraseña restablecida</h2>
          <p>Ya podés iniciar sesión con tu nueva contraseña.</p>
          <Link to="/login" className="btn">
            Iniciar sesión
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <form className="card" style={{ width: 380 }} onSubmit={submit}>
        <h2>Restablecer contraseña</h2>
        <TextField label="Nueva contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <TextField label="Confirmar contraseña" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
        <Button type="submit" style={{ width: '100%' }}>
          Guardar
        </Button>
      </form>
    </div>
  );
}
