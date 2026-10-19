import { useState } from 'react';
import { Button } from './Button';

/**
 * Diálogo de entrada de texto (modal) con estilos del design system, en lugar
 * de `window.prompt` del navegador.
 */
export function PromptDialog({
  open,
  title,
  label,
  defaultValue = '',
  confirmLabel = 'Aceptar',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
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
        {label && <label className="muted">{label}</label>}
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(value); }}
        />
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-4)' }}>
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onConfirm(value)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
