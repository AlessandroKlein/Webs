import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ErrorCopy {
  title: string;
  message: string;
}

const COPY: Record<number, ErrorCopy> = {
  400: { title: 'error.badRequest', message: 'error.badRequestMsg' },
  404: { title: 'error.notFound', message: 'error.notFoundMsg' },
  500: { title: 'error.serverError', message: 'error.serverErrorMsg' },
};

/**
 * Página de error con el diseño del sistema: código grande + mensaje + acción.
 * Usada como página 404 (ruta comodín) y disponible para 400/500 si se necesita.
 */
export function ErrorPage({ code = 404, message }: { code?: number; message?: string }) {
  const { t } = useTranslation();
  const keys = COPY[code] ?? { title: 'error.unexpected', message: 'error.unexpectedMsg' };
  const title = t(keys.title);
  const msg = t(keys.message);

  return (
    <div className="auth-screen">
      <div className="card" style={{ textAlign: 'center', maxWidth: 480, width: '100%' }}>
        <p
          style={{
            fontSize: '4rem',
            fontWeight: 700,
            margin: 0,
            color: 'var(--ws-primary)',
            lineHeight: 1,
          }}
        >
          {code}
        </p>
        <h2 style={{ marginTop: 'var(--ws-space-3)' }}>{message ?? title}</h2>
        <p className="muted">{msg}</p>
        <Link to="/" className="btn" style={{ marginTop: 'var(--ws-space-4)' }}>
          {t('error.backHome')}
        </Link>
      </div>
    </div>
  );
}
