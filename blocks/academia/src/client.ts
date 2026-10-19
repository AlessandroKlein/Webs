import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = '<div class="stack" id="courses"></div><hr/><div id="detail"></div>';
  container.appendChild(el);
  void fetch('/api/v1/blocks/academia/courses').then(async (r) => {
    const data = (await r.json()) as Array<{ id: string; title: string; description: string; level: string; lessons: number }>;
    el.querySelector('#courses')!.innerHTML = data.map((c) => `<div class="card" data-id="${c.id}" style="cursor:pointer"><strong>${c.title}</strong> <span class="badge">${c.level}</span><p class="muted">${c.description}</p><span class="muted">${c.lessons} lecciones</span></div>`).join('');
    el.querySelectorAll('#courses .card').forEach((c) => c.addEventListener('click', async () => {
      const r2 = await fetch(`/api/v1/blocks/academia/courses/${c.getAttribute('data-id')}`);
      const course = (await r2.json()) as { title: string; lessons: Array<{ id: string; title: string; videoUrl?: string; pdfUrl?: string }> };
      el.querySelector('#detail')!.innerHTML = `<h3>${course.title}</h3>${course.lessons.map((l) => `<p>• ${l.title}${l.videoUrl ? ' 🎬' : ''}${l.pdfUrl ? ' 📄' : ''}</p>`).join('')}`;
    }));
  });
  return () => el.remove();
});
