import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface SearchResults {
  results: {
    content: Array<{ id: string; slug: string }>;
    posts: Array<{ id: string; title: string }>;
    products: Array<{ id: string; title: string }>;
  };
}

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<input class="input" placeholder="Buscar…" /><div id="res" class="stack" style="margin-top:4px"></div>`;
  container.appendChild(el);
  const input = el.querySelector('input')!;
  const res = el.querySelector('#res')!;

  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      res.innerHTML = '';
      return;
    }
    try {
      const r = await fetch(`/api/v1/blocks/search/search?q=${encodeURIComponent(q)}`);
      const data = (await r.json()) as SearchResults;
      const { content, posts, products } = data.results;
      const items = [
        ...content.map((c) => `📄 ${c.slug}`),
        ...posts.map((p) => `📝 ${p.title}`),
        ...products.map((p) => `🛒 ${p.title}`),
      ];
      res.innerHTML = items.length
        ? items.map((x) => `<span class="badge">${x}</span>`).join(' ')
        : '<span class="muted">Sin resultados</span>';
    } catch {
      res.innerHTML = '<span class="muted">Error de búsqueda</span>';
    }
  });

  return () => el.remove();
});
