import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container, config, i18n }) => {
  const color = typeof config.primaryColor === 'string' ? config.primaryColor : '#635bff';
  const el = document.createElement('div');
  el.innerHTML = `<button type="button" style="background:${color};color:#fff;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">${i18n.t('pay')}</button>`;
  el.querySelector('button')?.addEventListener('click', async () => {
    const amount = Number(container.dataset.amount ?? 100);
    const res = await fetch('/api/v1/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'stripe', amount, currency: 'ARS' }),
    });
    const data = (await res.json()) as { transactionId?: string };
    // (Producción) montar Stripe Elements con el client_secret y confirmar el pago.
    alert(`PaymentIntent creado: ${data.transactionId}`);
  });
  container.appendChild(el);
  return () => el.remove();
});
