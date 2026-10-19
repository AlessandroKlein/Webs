import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<input class="input" placeholder="Buscar…" /><div id="res" class="stack" style="margin-top:4px"></div>`;
  container.appendChild(el);
  const input = el.querySelector('input')!;
  const res = el.querySelector('#res')!;

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (q.length < 2) { res.innerHTML = ''; return; }
    const r = await fetch(`/api/v1/blocks/search/search?q=${encodeURIComponent(q)}`);
    const data = (await r.json()) as { results: string[] };
    res.innerHTML = data.results.map((x) => `<span class="badge">${x}</span>`).join(' ');
  });
  return () => el.remove();
});
