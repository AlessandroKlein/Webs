import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface Msg { id: string; from: string; body: string; createdAt: string }

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<div id="log" style="height:240px;overflow:auto;border:1px solid var(--ws-border);border-radius:var(--ws-radius-md);padding:8px;margin-bottom:8px"></div>
    <div class="row"><input class="input" id="from" placeholder="Tu nombre" style="width:140px" /><input class="input" id="msg" placeholder="Mensaje…" /><button class="btn" id="send">Enviar</button></div>`;
  container.appendChild(el);

  const log = el.querySelector('#log') as HTMLElement;
  let lastId = '';

  const add = (m: Msg) => {
    log.insertAdjacentHTML('beforeend', `<div><strong>${m.from}</strong>: ${m.body}</div>`);
    log.scrollTop = log.scrollHeight;
  };

  const refresh = async () => {
    const r = await fetch('/api/v1/plugins/chat/messages');
    const data = (await r.json()) as Msg[];
    const newest = data[0];
    if (newest && newest.id !== lastId) {
      log.innerHTML = '';
      lastId = newest.id;
      data.reverse().forEach(add);
    }
  };

  const send = async () => {
    const from = (el.querySelector('#from') as HTMLInputElement).value || 'anon';
    const body = (el.querySelector('#msg') as HTMLInputElement).value;
    if (!body) return;
    await fetch('/api/v1/plugins/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, body }),
    });
    (el.querySelector('#msg') as HTMLInputElement).value = '';
    await refresh();
  };
  (el.querySelector('#send') as HTMLElement).onclick = () => void send();

  void refresh();
  const timer = setInterval(() => void refresh(), 3000);

  return () => {
    clearInterval(timer);
    el.remove();
  };
});
