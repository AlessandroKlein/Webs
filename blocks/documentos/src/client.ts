import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Documentos</h4>
    <div class="row"><input class="input" id="d-name" placeholder="Nombre" /><input class="input" id="d-content" placeholder="Contenido" /></div>
    <button class="btn" id="d-send">Crear</button><div id="d-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/blocks/documentos/documents');
    const list = (await res.json()) as Array<{ id: string; name: string; signed: boolean }>;
    const target = el.querySelector('#d-list')!;
    target.innerHTML = list
      .map((d) => `<p><strong>${d.name}</strong> · ${d.signed ? 'firmado' : 'pendiente'} <button class="btn" data-sign="${d.id}">Firmar</button></p>`)
      .join('');
    target.querySelectorAll<HTMLButtonElement>('[data-sign]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/v1/blocks/documentos/documents/${btn.dataset.sign}/sign`, { method: 'POST' });
        refresh();
      });
    });
  };

  el.querySelector('#d-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/documentos/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: (el.querySelector('#d-name') as HTMLInputElement).value,
        content: (el.querySelector('#d-content') as HTMLInputElement).value,
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
