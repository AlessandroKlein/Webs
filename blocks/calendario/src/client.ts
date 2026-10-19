import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Event { id: string; title: string; start: string; type?: string | null }

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<div class="row"><input class="input" id="title" placeholder="Actividad" /><input class="input" id="start" type="datetime-local" /><button class="btn" id="add">Agregar</button></div><div id="list" class="stack" style="margin-top:8px"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const r = await fetch('/api/v1/blocks/calendario/events');
    const data = (await r.json()) as Event[];
    (el.querySelector('#list') as HTMLElement).innerHTML = data.map((e) => `<div class="row" style="justify-content:space-between"><span>${e.title} <span class="muted">· ${new Date(e.start).toLocaleString()}</span></span><button data-id="${e.id}" class="btn ghost">✕</button></div>`).join('') || '<p class="muted">Sin actividades</p>';
    el.querySelectorAll('#list button').forEach((b) => b.addEventListener('click', async () => {
      await fetch(`/api/v1/blocks/calendario/events/${b.getAttribute('data-id')}`, { method: 'DELETE' });
      refresh();
    }));
  };

  (el.querySelector('#add') as HTMLElement).onclick = async () => {
    await fetch('/api/v1/blocks/calendario/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: (el.querySelector('#title') as HTMLInputElement).value, start: (el.querySelector('#start') as HTMLInputElement).value }) });
    refresh();
  };
  refresh();
  return () => el.remove();
});
