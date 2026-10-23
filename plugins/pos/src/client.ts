import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container, config, i18n }) => {
  const color = typeof config.primaryColor === 'string' ? config.primaryColor : '#16a34a';
  const mode = typeof config.mode === 'string' ? config.mode : 'cash';
  const label = mode === 'cash' ? i18n.t('pay') : i18n.t('terminal');

  const el = document.createElement('div');
  el.innerHTML = `<button type="button" style="background:${color};color:#fff;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">${label}</button><p data-role="status" style="margin:8px 0 0;font-size:13px;color:var(--ws-text-muted,#6b7280)"></p>`;

  const status = el.querySelector<HTMLElement>('[data-role="status"]');
  el.querySelector('button')?.addEventListener('click', async () => {
    const amount = Number(container.dataset.amount ?? 100);
    if (status) status.textContent = 'Procesando…';
    try {
      const res = await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'pos', amount, currency: 'ARS' }),
      });
      const data = (await res.json()) as { transactionId?: string };
      if (status) {
        status.textContent = mode === 'cash'
          ? `Pago contra entrega registrado: ${data.transactionId ?? ''}`
          : `Cobro enviado al lector: ${data.transactionId ?? ''}`;
      }
    } catch {
      if (status) status.textContent = 'No se pudo registrar el pago.';
    }
  });
  container.appendChild(el);
  return () => el.remove();
});
