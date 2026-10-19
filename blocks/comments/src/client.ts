import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Valoración</h4>
    <div class="row"><input class="input" id="c-author" placeholder="Tu nombre" /><input class="input" id="c-rating" type="number" min="1" max="5" value="5" style="width:80px" /></div>
    <textarea class="input" id="c-body" placeholder="Tu reseña"></textarea>
    <button class="btn" id="c-send">Enviar</button><div id="c-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/blocks/comments/comments');
    const list = (await res.json()) as Array<{ author: string; body: string; rating: number }>;
    const target = el.querySelector('#c-list')!;
    target.innerHTML = list.map((c) => `<p><strong>${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)} ${c.author}</strong><br/>${c.body}</p>`).join('');
  };

  el.querySelector('#c-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/blocks/comments/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: (el.querySelector('#c-author') as HTMLInputElement).value,
        body: (el.querySelector('#c-body') as HTMLTextAreaElement).value,
        rating: Number((el.querySelector('#c-rating') as HTMLInputElement).value),
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
