import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface Lesson { id?: string; title?: string; videoUrl?: string; pdfUrl?: string }
interface Course { id: string; title: string; description: string | null; level: string | null; lessons: Lesson[] }

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = '<div class="stack" id="courses"></div>';
  container.appendChild(el);

  void fetch('/api/v1/plugins/academia/courses')
    .then(async (r) => {
      const data = (await r.json()) as Course[];
      el.querySelector('#courses')!.innerHTML =
        data
          .map(
            (c) => `<div class="card"><strong>${c.title}</strong>${c.level ? ` <span class="badge">${c.level}</span>` : ''}<p class="muted">${c.description ?? ''}</p><ul>${(Array.isArray(c.lessons) ? c.lessons : [])
              .map((l) => `<li>${l.title ?? ''}${l.videoUrl ? ' 🎬' : ''}${l.pdfUrl ? ' 📄' : ''}</li>`)
              .join('')}</ul></div>`,
          )
          .join('') || '<p class="muted">Sin cursos</p>';
    })
    .catch(() => {
      el.querySelector('#courses')!.innerHTML = '<p class="muted">No se pudieron cargar los cursos.</p>';
    });

  return () => el.remove();
});
