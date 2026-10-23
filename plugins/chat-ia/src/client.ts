import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<div id="log" style="height:240px;overflow:auto;border:1px solid var(--ws-border);border-radius:var(--ws-radius-md);padding:8px;margin-bottom:8px"></div>
    <div class="row"><input class="input" id="msg" placeholder="Preguntá a la IA…" /><button class="btn" id="send">Enviar</button></div>`;
  container.appendChild(el);
  const log = el.querySelector('#log') as HTMLElement;
  const send = async () => {
    const msg = (el.querySelector('#msg') as HTMLInputElement).value;
    if (!msg) return;
    log.insertAdjacentHTML('beforeend', `<div><strong>Tú</strong>: ${msg}</div>`);
    (el.querySelector('#msg') as HTMLInputElement).value = '';
    const r = await fetch('/api/v1/plugins/chat-ia/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
    const d = (await r.json()) as { reply?: string; error?: string };
    log.insertAdjacentHTML('beforeend', `<div><strong>IA</strong>: ${d.reply ?? d.error ?? ''}</div>`);
    log.scrollTop = log.scrollHeight;
  };
  (el.querySelector('#send') as HTMLElement).onclick = () => void send();
  return () => el.remove();
});
