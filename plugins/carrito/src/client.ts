import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface Product { id: string; title: string; price: number; stock: number }

export default defineClientPlugin(manifest, ({ container, config, i18n }) => {
  const catalog = (Array.isArray(config.catalog) ? config.catalog : []) as Product[];
  const title = String(config.title ?? i18n.t('cart'));

  const el = document.createElement('div');
  el.style.padding = 'var(--ws-space-4)';
  el.style.border = '1px solid var(--ws-border)';
  el.style.borderRadius = 'var(--ws-radius-md)';

  let cart: Product[] = [];
  const render = () => {
    const total = cart.reduce((s, p) => s + p.price, 0);
    el.innerHTML = `<strong>${title}</strong>`;
    for (const p of catalog) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.justifyContent = 'space-between';
      row.innerHTML = `<span>${p.title} <span class="muted">· $${p.price.toFixed(2)} · stock ${p.stock}</span></span>`;
      const btn = document.createElement('button');
      btn.className = 'btn secondary';
      btn.textContent = i18n.t('add');
      btn.onclick = () => { cart = [...cart, p]; render(); };
      row.appendChild(btn);
      el.appendChild(row);
    }
    const foot = document.createElement('div');
    foot.className = 'row';
    foot.style.justifyContent = 'space-between';
    foot.style.marginTop = 'var(--ws-space-3)';
    foot.innerHTML = `<strong>${i18n.t('total')}: $${total.toFixed(2)}</strong>`;
    const pay = document.createElement('button');
    pay.className = 'btn';
    pay.textContent = i18n.t('checkout');
    pay.onclick = async () => {
      await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'mercadopago', amount: Math.round(total * 100), currency: 'ARS', description: title }),
      });
    };
    foot.appendChild(pay);
    el.appendChild(foot);
  };

  render();
  container.appendChild(el);
  return () => el.remove();
});
