import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Post { id: string; title: string; body: string; category: string; tags: string[] }

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = '<div class="stack" id="list"></div><hr/><article id="article"></article>';
  container.appendChild(el);
  void fetch('/api/v1/blocks/blog/posts').then(async (r) => {
    const data = (await r.json()) as Post[];
    el.querySelector('#list')!.innerHTML = data.map((p) => `<div class="card" data-id="${p.id}" style="cursor:pointer"><strong>${p.title}</strong><p class="muted">${p.category}</p></div>`).join('');
    el.querySelectorAll('#list .card').forEach((c) => c.addEventListener('click', () => {
      const post = data.find((p) => p.id === c.getAttribute('data-id'));
      if (post) el.querySelector('#article')!.innerHTML = `<h2>${post.title}</h2>${post.body}`;
    }));
  });
  return () => el.remove();
});
