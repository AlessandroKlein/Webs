import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque Mercado Pago — cliente.
 *
 * Renderiza el botón de pago en el slot `payment` usando la apariencia
 * configurada (color, textos). Al hacer clic crea una preferencia de pago en el
 * servidor. En producción se montaría el SDK de Mercado Pago con la `publicKey`
 * para tokenizar la tarjeta (sin tocar el PAN).
 */
export default defineClientBlock(manifest, ({ container, config, i18n }) => {
  const primaryColor = typeof config.primaryColor === 'string' ? config.primaryColor : '#009ee3';
  const label = i18n.t('pay');

  const el = document.createElement('div');
  el.innerHTML = `<button type="button" style="background:${primaryColor};color:#fff;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600">${label}</button>`;
  const btn = el.querySelector('button');

  btn?.addEventListener('click', async () => {
    const res = await fetch('/api/v1/blocks/mercadopago/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, description: 'Compra de prueba' }),
    });
    const data = (await res.json()) as { initPoint?: string | null };
    if (data.initPoint) window.open(data.initPoint, '_blank');
  });

  container.appendChild(el);
  return () => {
    el.remove();
  };
});
