import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Workflows</h4>
    <div class="row"><input class="input" id="w-name" placeholder="Nombre" /><input class="input" id="w-trigger" placeholder="Trigger" /></div>
    <button class="btn" id="w-send">Crear</button><div id="w-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/plugins/workflows/workflows');
    const list = (await res.json()) as Array<{ id: string; name: string; trigger: string; enabled: boolean }>;
    const target = el.querySelector('#w-list')!;
    target.innerHTML = list.map((w) => `<p><strong>${w.name}</strong> · ${w.trigger} · ${w.enabled ? 'activo' : 'inactivo'}</p>`).join('');
  };

  el.querySelector('#w-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/plugins/workflows/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: (el.querySelector('#w-name') as HTMLInputElement).value,
        trigger: (el.querySelector('#w-trigger') as HTMLInputElement).value,
        steps: [],
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
