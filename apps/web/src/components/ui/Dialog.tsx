import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * Modal genérico del design system (primitiva del patrón "crear"/"editar").
 *
 * El patrón de la app: toda acción de "crear" (y editar con varios campos)
 * abre un `Dialog` con TODOS los campos necesarios, en lugar de un formulario
 * inline incompleto. Ver `docs/guides/patron-crear.md`.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidth = 720,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--ws-space-4)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          background: 'var(--ws-surface)',
          border: '1px solid var(--ws-border)',
          borderRadius: 'var(--ws-radius-lg)',
          boxShadow: 'var(--ws-shadow-lg)',
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--ws-space-4) var(--ws-space-6)',
            borderBottom: '1px solid var(--ws-border)',
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <Button variant="ghost" onClick={onClose} aria-label="Cerrar">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--ws-space-6)' }}>{children}</div>
        {footer && (
          <div
            className="row"
            style={{
              justifyContent: 'flex-end',
              gap: 'var(--ws-space-2)',
              padding: 'var(--ws-space-4) var(--ws-space-6)',
              borderTop: '1px solid var(--ws-border)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
