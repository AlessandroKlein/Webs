import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * Diálogo de confirmación (modal) con estilos del design system, en lugar de
 * `window.confirm` del navegador.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
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
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--ws-surface)',
          border: '1px solid var(--ws-border)',
          borderRadius: 'var(--ws-radius-lg)',
          boxShadow: 'var(--ws-shadow-lg)',
          padding: 'var(--ws-space-6)',
          minWidth: 320,
          maxWidth: 480,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ color: 'var(--ws-text-muted)' }}>{children}</div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-4)' }}>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button style={danger ? { background: 'var(--ws-danger)', color: '#fff' } : undefined} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
