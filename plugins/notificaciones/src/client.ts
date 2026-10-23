import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface Notif { id: string; title: string; body: string; read: boolean }

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.style.position = 'relative';
  el.innerHTML = `<button class="btn ghost" id="bell" title="Notificaciones"><i class="bi bi-bell"></i><span id="badge" class="badge" style="display:none"></span></button><div id="panel" style="display:none;position:absolute;right:0;top:2.5rem;min-width:260px;z-index:50;background:var(--ws-surface);border:1px solid var(--ws-border);border-radius:var(--ws-radius-md);padding:8px"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/plugins/notificaciones/inbox');
    const list = (await res.json()) as Notif[];
    const unread = list.filter((n) => !n.read).length;
    const badge = el.querySelector('#badge') as HTMLElement;
    badge.textContent = String(unread);
    badge.style.display = unread ? 'inline-block' : 'none';
    (el.querySelector('#panel') as HTMLElement).innerHTML = list.map((n) => `<div style="padding:6px 0;border-bottom:1px solid var(--ws-border)"><strong>${n.title}</strong><p class="muted">${n.body}</p></div>`).join('') || '<p class="muted">Sin notificaciones</p>';
  };

  (el.querySelector('#bell') as HTMLElement).onclick = async () => {
    const panel = el.querySelector('#panel') as HTMLElement;
    const visible = panel.style.display === 'block';
    panel.style.display = visible ? 'none' : 'block';
    if (!visible) {
      await fetch('/api/v1/plugins/notificaciones/read-all', { method: 'PATCH' });
      void refresh();
    }
  };
  refresh();
  return () => el.remove();
});
