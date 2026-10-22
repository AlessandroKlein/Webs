import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/**
 * Plugin Mercado Pago — cliente.
 *
 * Renderiza el botón de pago en el slot `payment`. Al hacer clic llama al
 * checkout genérico del núcleo de pagos. En producción se montaría el SDK de
 * Mercado Pago con la `publicKey` para tokenizar la tarjeta (sin tocar el PAN).
 */
export default defineClientPlugin(manifest, ({ container, config, i18n }) => {
  const primaryColor = typeof config.primaryColor === 'string' ? config.primaryColor : '#009ee3';
  const label = i18n.t('pay');
  const amount = Number(container.dataset.amount ?? 100);
  const description = container.dataset.description ?? 'Compra de prueba';

  const el = document.createElement('div');
  el.innerHTML = `<button type="button" style="background:${primaryColor};color:#fff;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">${label}</button>`;
  const btn = el.querySelector('button');

  btn?.addEventListener('click', async () => {
    const res = await fetch('/api/v1/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'mercadopago', amount, description, currency: 'ARS' }),
    });
    const data = (await res.json()) as { paymentUrl?: string | null; qr?: string | null };
    if (data.paymentUrl) window.open(data.paymentUrl, '_blank');
  });

  container.appendChild(el);
  return () => {
    el.remove();
  };
});
