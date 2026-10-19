import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Msg { from: string; body: string; createdAt: string }

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<div id="log" style="height:240px;overflow:auto;border:1px solid var(--ws-border);border-radius:var(--ws-radius-md);padding:8px;margin-bottom:8px"></div>
    <div class="row"><input class="input" id="from" placeholder="Tu nombre" style="width:140px" /><input class="input" id="msg" placeholder="Mensaje…" /><button class="btn" id="send">Enviar</button></div>`;
  container.appendChild(el);

  const log = el.querySelector('#log') as HTMLElement;
  const add = (m: Msg) => {
    log.insertAdjacentHTML('beforeend', `<div><strong>${m.from}</strong>: ${m.body}</div>`);
    log.scrollTop = log.scrollHeight;
  };

  void fetch('/api/v1/blocks/chat/messages').then(async (r) => {
    const data = (await r.json()) as Msg[];
    data.reverse().forEach(add);
  });

  const send = async () => {
    const from = (el.querySelector('#from') as HTMLInputElement).value || 'anon';
    const body = (el.querySelector('#msg') as HTMLInputElement).value;
    if (!body) return;
    await fetch('/api/v1/blocks/chat/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, body }) });
    (el.querySelector('#msg') as HTMLInputElement).value = '';
  };
  (el.querySelector('#send') as HTMLElement).onclick = () => void send();

  // Tiempo real por WebSocket (fallback: polling cada 3s).
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/v1/blocks/chat/ws`);
  ws.onmessage = (e) => add(JSON.parse(e.data) as Msg);
  ws.onerror = () => setInterval(async () => {
    const r = await fetch('/api/v1/blocks/chat/messages');
    const data = (await r.json()) as Msg[];
    const last = data[0];
    if (last && !log.textContent?.includes(last.body)) add(last);
  }, 3000);

  return () => el.remove();
});
