import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    api
      .post('/api/v1/auth/verify-email', { token })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="auth-screen">
      <Card style={{ maxWidth: 440, textAlign: 'center' }}>
        {status === 'loading' && <p className="muted">Verificando tu correo…</p>}
        {status === 'ok' && (
          <>
            <h2>✔ Correo verificado</h2>
            <p>Tu cuenta ya está activa.</p>
            <Link to="/login" className="btn">
              Iniciar sesión
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h2>Enlace inválido o expirado</h2>
            <p className="muted">Solicitá un nuevo enlace de verificación.</p>
          </>
        )}
      </Card>
    </div>
  );
}
