import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Inventario</h4>
    <div class="row">
      <input class="input" id="i-sku" placeholder="SKU" />
      <input class="input" id="i-name" placeholder="Nombre" />
      <input class="input" id="i-qty" type="number" placeholder="Cantidad" />
    </div>
    <button class="btn" id="i-send">Agregar</button>
    <div id="i-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/blocks/inventario/inventory', { headers: { Authorization: `Bearer ${localStorage.getItem('webs_access_token') ?? ''}` } });
    const list = (await res.json()) as Array<{ id: string; sku: string; name: string; quantity: number }>;
    const target = el.querySelector('#i-list')!;
    target.innerHTML = list
      .map((i) => `<p><strong>${i.name}</strong> · SKU ${i.sku} · <em>${i.quantity} uds</em></p>`)
      .join('');
  };

  el.querySelector('#i-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/inventario/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('webs_access_token') ?? ''}` },
      body: JSON.stringify({
        sku: (el.querySelector('#i-sku') as HTMLInputElement).value,
        name: (el.querySelector('#i-name') as HTMLInputElement).value,
        quantity: Number((el.querySelector('#i-qty') as HTMLInputElement).value || 0),
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
