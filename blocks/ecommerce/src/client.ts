import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Product { id: string; title: string; price: number; stock: number; category?: string }

export default defineClientBlock(manifest, ({ container, config }) => {
  const products = (Array.isArray(config.products) ? config.products : []) as Product[];
  const el = document.createElement('div');
  el.innerHTML = '<div class="stack" id="list"></div><hr/><p id="total"></p>';
  container.appendChild(el);
  let cart: Array<{ id: string; qty: number }> = [];
  const render = () => {
    const list = el.querySelector('#list')!;
    list.innerHTML = products.map((p) => `<div class="row" style="justify-content:space-between"><span>${p.title} <span class="muted">· $${p.price.toFixed(2)} · ${p.stock}</span></span><button data-id="${p.id}" class="btn secondary">+</button></div>`).join('');
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const id = b.getAttribute('data-id')!;
      cart = [...cart, { id, qty: 1 }];
      el.querySelector('#total')!.textContent = `Ítems: ${cart.length}`;
    }));
  };
  el.insertAdjacentHTML('afterbegin', '<button id="buy" class="btn">Comprar</button>');
  el.querySelector('#buy')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/ecommerce/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart }) });
    cart = [];
    el.querySelector('#total')!.textContent = 'Pedido creado ✓';
  });
  render();
  return () => el.remove();
});
