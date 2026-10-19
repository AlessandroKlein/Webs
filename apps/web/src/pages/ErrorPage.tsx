import { Link } from 'react-router-dom';

interface ErrorCopy {
  title: string;
  message: string;
}

const COPY: Record<number, ErrorCopy> = {
  400: {
    title: 'Solicitud incorrecta',
    message: 'La petición no es válida o está mal formada.',
  },
  404: {
    title: 'Página no encontrada',
    message: 'La página que buscás no existe o fue movida.',
  },
  500: {
    title: 'Error del servidor',
    message: 'Ocurrió un error interno. Intentá de nuevo más tarde.',
  },
};

/**
 * Página de error con el diseño del sistema: código grande + mensaje + acción.
 * Usada como página 404 (ruta comodín) y disponible para 400/500 si se necesita.
 */
export function ErrorPage({ code = 404, message }: { code?: number; message?: string }) {
  const info = COPY[code] ?? { title: 'Error inesperado', message: 'Ocurrió un error inesperado.' };

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
        <h2 style={{ marginTop: 'var(--ws-space-3)' }}>{message ?? info.title}</h2>
        <p className="muted">{info.message}</p>
        <Link to="/" className="btn" style={{ marginTop: 'var(--ws-space-4)' }}>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
