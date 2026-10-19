import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Post {
  id: string;
  author: string;
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  likes: number;
}

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<div class="stack"><input class="input" id="author" placeholder="Tu nombre" /><textarea class="input" id="text" placeholder="¿Qué estás pensando?"></textarea><input class="input" id="media" placeholder="URL de imagen/video (opcional)" /><button class="btn" id="post">Publicar</button></div><div id="feed" class="stack" style="margin-top:12px"></div>`;
  container.appendChild(el);

  const feed = el.querySelector('#feed') as HTMLElement;

  const refresh = async () => {
    const r = await fetch('/api/v1/blocks/social/posts');
    const data = (await r.json()) as Post[];
    feed.innerHTML =
      data
        .map(
          (p) => `<div class="card">
      <div class="row" style="justify-content:space-between"><strong>${p.author}</strong><button data-id="${p.id}" class="btn">♥ ${p.likes}</button></div>
      <p>${p.text}</p>${p.mediaUrl ? (p.mediaType === 'video' ? `<video src="${p.mediaUrl}" controls style="max-width:100%"></video>` : `<img src="${p.mediaUrl}" style="max-width:100%;border-radius:var(--ws-radius-md)" />`) : ''}</div>`,
        )
        .join('') || '<p class="muted">Sin publicaciones</p>';
    el.querySelectorAll('#feed .card button').forEach((b) => {
      b.addEventListener('click', async () => {
        await fetch(`/api/v1/blocks/social/posts/${b.getAttribute('data-id')}/like`, { method: 'PATCH' });
        refresh();
      });
    });
  };

  (el.querySelector('#post') as HTMLElement).onclick = async () => {
    const mediaUrl = (el.querySelector('#media') as HTMLInputElement).value;
    const mediaType = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl) ? 'video' : mediaUrl ? 'image' : null;
    await fetch('/api/v1/blocks/social/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: (el.querySelector('#author') as HTMLInputElement).value || 'anon',
        text: (el.querySelector('#text') as HTMLTextAreaElement).value,
        mediaUrl: mediaUrl || null,
        mediaType,
      }),
    });
    refresh();
  };

  void refresh();
  return () => el.remove();
});
