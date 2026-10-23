import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

function applyStyle(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}

/**
 * Plugin de soporte — cliente. Renderiza un botón flotante (esquina inferior
 * derecha) con ícono de auriculares que abre un mini-formulario para crear un
 * ticket público vía `POST /api/v1/plugins/support/tickets`. Sin `alert/prompt`.
 */
export default defineClientPlugin(manifest, ({ config }) => {
  if (config.enabled === false) return;

  const root = document.createElement('div');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.setAttribute('aria-label', 'Abrir soporte');
  button.innerHTML = '<i class="bi bi-headset"></i>';
  applyStyle(button, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '9999',
    width: '56px',
    height: '56px',
    padding: '0',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    boxShadow: 'var(--ws-shadow-lg)',
  });

  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  applyStyle(panel, {
    position: 'fixed',
    bottom: '92px',
    right: '24px',
    zIndex: '9999',
    width: '320px',
    maxWidth: 'calc(100vw - 48px)',
    background: 'var(--ws-surface, #fff)',
    border: '1px solid var(--ws-border, #e5e7eb)',
    borderRadius: 'var(--ws-radius-lg, 12px)',
    boxShadow: 'var(--ws-shadow-lg)',
    padding: 'var(--ws-space-4, 16px)',
    display: 'none',
  });
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <strong><i class="bi bi-headset"></i> Soporte</strong>
      <button type="button" class="btn ghost" data-close aria-label="Cerrar"><i class="bi bi-x-lg"></i></button>
    </div>
    <form data-form class="stack">
      <div class="field">
        <label for="support-subject">Asunto</label>
        <input class="input" id="support-subject" name="subject" required />
      </div>
      <div class="field">
        <label for="support-message">Mensaje</label>
        <textarea class="input" id="support-message" name="message" rows="4" required></textarea>
      </div>
      <button type="submit" class="btn" style="width:100%">Enviar consulta</button>
      <p data-status class="muted" style="margin:8px 0 0;font-size:0.85rem;min-height:1em"></p>
    </form>
  `;

  const subjectInput = panel.querySelector<HTMLInputElement>('[name="subject"]');
  const messageInput = panel.querySelector<HTMLTextAreaElement>('[name="message"]');
  const form = panel.querySelector<HTMLFormElement>('[data-form]');
  const statusEl = panel.querySelector<HTMLElement>('[data-status]');
  const closeBtn = panel.querySelector<HTMLButtonElement>('[data-close]');

  const setOpen = (open: boolean): void => {
    panel.style.display = open ? 'block' : 'none';
    if (open) subjectInput?.focus();
  };

  button.addEventListener('click', () => setOpen(panel.style.display === 'none'));
  closeBtn?.addEventListener('click', () => setOpen(false));

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!subjectInput || !messageInput || !statusEl) return;
    const subject = subjectInput.value.trim();
    const message = messageInput.value.trim();
    if (!subject || !message) {
      statusEl.textContent = 'Completá asunto y mensaje.';
      statusEl.style.color = 'var(--ws-danger, #dc2626)';
      return;
    }
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    statusEl.textContent = 'Enviando…';
    statusEl.style.color = '';
    if (submitBtn) submitBtn.disabled = true;
    void fetch('/api/v1/plugins/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, message }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        statusEl.textContent = '¡Gracias! Recibimos tu consulta.';
        subjectInput.value = '';
        messageInput.value = '';
      })
      .catch(() => {
        statusEl.textContent = 'No se pudo enviar. Intentá de nuevo.';
        statusEl.style.color = 'var(--ws-danger, #dc2626)';
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });

  root.appendChild(button);
  root.appendChild(panel);
  document.body.appendChild(root);

  return () => root.remove();
});
