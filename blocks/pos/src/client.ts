import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container, config, i18n }) => {
  const color = typeof config.primaryColor === 'string' ? config.primaryColor : '#16a34a';
  const mode = typeof config.mode === 'string' ? config.mode : 'cash';
  const label = mode === 'cash' ? i18n.t('pay') : i18n.t('terminal');

  const el = document.createElement('div');
  el.innerHTML = `<button type="button" style="background:${color};color:#fff;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">${label}</button>`;
  el.querySelector('button')?.addEventListener('click', async () => {
    const amount = Number(container.dataset.amount ?? 100);
    const res = await fetch('/api/v1/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'pos', amount, currency: 'ARS' }),
    });
    const data = (await res.json()) as { transactionId?: string };
    if (mode === 'cash') alert(`Pago contra entrega registrado: ${data.transactionId}`);
    else alert(`Cobro enviado al lector: ${data.transactionId}`);
  });
  container.appendChild(el);
  return () => el.remove();
});
