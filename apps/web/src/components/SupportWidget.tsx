import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

const SUPPORT = '/api/v1/blocks/support';

/**
 * Widget flotante de soporte: botón fijo (esquina inferior derecha) con ícono
 * de auriculares que abre un mini-formulario (asunto + mensaje) y crea un
 * ticket público vía `POST /api/v1/blocks/support/tickets`. Sin `window.alert`.
 */
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post(`${SUPPORT}/tickets`, { subject, message }),
    onSuccess: () => {
      setSubject('');
      setMessage('');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    submit.mutate();
  };

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !submit.isPending;

  return (
    <>
      <button
        type="button"
        className="btn"
        aria-label="Abrir soporte"
        title="Soporte"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 56,
          height: 56,
          padding: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          boxShadow: 'var(--ws-shadow-lg)',
        }}
      >
        <i className="bi bi-headset" />
      </button>

      {open && (
        <form
          onSubmit={onSubmit}
          style={{
            position: 'fixed',
            bottom: 92,
            right: 24,
            zIndex: 9999,
            width: 320,
            maxWidth: 'calc(100vw - 48px)',
            background: 'var(--ws-surface)',
            border: '1px solid var(--ws-border)',
            borderRadius: 'var(--ws-radius-lg)',
            boxShadow: 'var(--ws-shadow-lg)',
            padding: 'var(--ws-space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--ws-space-3)',
          }}
        >
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>
              <i className="bi bi-headset" /> Soporte
            </strong>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} aria-label="Cerrar">
              <i className="bi bi-x-lg" />
            </button>
          </div>

          <div className="field">
            <label htmlFor="support-widget-subject">Asunto</label>
            <input
              id="support-widget-subject"
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="support-widget-message">Mensaje</label>
            <textarea
              id="support-widget-message"
              className="input"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn" disabled={!canSubmit}>
            {submit.isPending ? 'Enviando…' : 'Enviar consulta'}
          </button>

          {submit.isError && (
            <p className="muted" style={{ margin: 0, color: 'var(--ws-danger)' }}>
              No se pudo enviar. Intentá de nuevo.
            </p>
          )}
          {submit.isSuccess && !submit.isPending && (
            <p className="muted" style={{ margin: 0, color: 'var(--ws-success, #16a34a)' }}>
              ¡Gracias! Recibimos tu consulta.
            </p>
          )}
        </form>
      )}
    </>
  );
}
