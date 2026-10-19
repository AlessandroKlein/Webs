import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('webs_access_token') ?? ''}` });

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Formularios</h4>
    <div class="row"><input class="input" id="f-title" placeholder="Título" /></div>
    <button class="btn" id="f-send">Crear</button><div id="f-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/blocks/formularios/forms');
    const list = (await res.json()) as Array<{ id: string; title: string; fields: unknown }>;
    const target = el.querySelector('#f-list')!;
    target.innerHTML = list.map((f) => `<p><strong>${f.title}</strong></p>`).join('');
  };

  el.querySelector('#f-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/formularios/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        title: (el.querySelector('#f-title') as HTMLInputElement).value,
        fields: [{ id: crypto.randomUUID(), label: 'Nombre', type: 'text' }],
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
