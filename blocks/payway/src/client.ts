import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container, config, i18n }) => {
  const color = typeof config.primaryColor === 'string' ? config.primaryColor : '#004b93';
  const el = document.createElement('div');
  el.innerHTML = `<button type="button" style="background:${color};color:#fff;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">${i18n.t('pay')}</button>`;
  el.querySelector('button')?.addEventListener('click', async () => {
    const amount = Number(container.dataset.amount ?? 100);
    const res = await fetch('/api/v1/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'payway', amount, currency: 'ARS' }),
    });
    const data = (await res.json()) as { paymentUrl?: string | null };
    if (data.paymentUrl) window.open(data.paymentUrl, '_blank');
  });
  container.appendChild(el);
  return () => el.remove();
});
