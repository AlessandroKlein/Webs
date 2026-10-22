import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<h4>Afiliados</h4>
    <div class="row"><input class="input" id="a-user" placeholder="UserId" /><input class="input" id="a-commission" type="number" value="0" style="width:100px" /></div>
    <button class="btn" id="a-send">Crear afiliado</button><div id="a-list"></div>`;
  container.appendChild(el);

  const refresh = async () => {
    const res = await fetch('/api/v1/plugins/afiliados/affiliates');
    const list = (await res.json()) as Array<{ code: string; commission: number }>;
    const target = el.querySelector('#a-list')!;
    target.innerHTML = list.map((a) => `<p><strong>${a.code}</strong> · ${a.commission}%</p>`).join('');
  };

  el.querySelector('#a-send')!.addEventListener('click', async () => {
    await fetch('/api/v1/plugins/afiliados/affiliates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: (el.querySelector('#a-user') as HTMLInputElement).value,
        commission: Number((el.querySelector('#a-commission') as HTMLInputElement).value),
      }),
    });
    refresh();
  });
  refresh();
  return () => el.remove();
});
