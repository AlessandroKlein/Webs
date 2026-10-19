import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Organizaciones</h4>
    <div class="row"><input class="input" id="o-name" placeholder="Nombre" /><input class="input" id="o-plan" placeholder="Plan (free)" /></div>
    <button class="btn" id="o-send">Crear</button><div id="o-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/blocks/organizaciones/organizations');
    const list = (await res.json()) as Array<{ name: string; plan: string; active: boolean }>;
    const target = el.querySelector('#o-list')!;
    target.innerHTML = list.map((o) => `<p><strong>${o.name}</strong> · ${o.plan} · ${o.active ? 'activa' : 'inactiva'}</p>`).join('');
  };

  el.querySelector('#o-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/organizaciones/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: (el.querySelector('#o-name') as HTMLInputElement).value,
        plan: (el.querySelector('#o-plan') as HTMLInputElement).value || 'free',
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
