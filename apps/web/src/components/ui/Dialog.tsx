import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal genérico del design system (primitiva del patrón "crear"/"editar").
 *
 * El patrón de la app: toda acción de "crear" (y editar con varios campos)
 * abre un `Dialog` con TODOS los campos necesarios, en lugar de un formulario
 * inline incompleto. Ver `docs/guides/patron-crear.md`.
 *
 * Accesibilidad: `aria-labelledby` apunta al título, cierra con `Escape`,
 * atrapa el foco (Tab/Shift+Tab ciclan dentro) y autofocus al primer elemento
 * enfocable. Al cerrar restaura el foco al elemento previo.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidth = 720,
  closeLabel = 'Cerrar',
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  closeLabel?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Ref "latest" para que el listener de teclado no se re-registre en cada render
  // (onClose suele ser un arrow inline inestable en el padre).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
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
          <h3 id={titleId} style={{ margin: 0 }}>{title}</h3>
          <Button variant="ghost" onClick={onClose} aria-label={closeLabel}>
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
