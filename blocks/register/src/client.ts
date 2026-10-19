import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<input class="input" id="reg-email" type="email" placeholder="Email" />
    <input class="input" id="reg-name" placeholder="Nombre" />
    <input class="input" id="reg-pass" type="password" placeholder="Contraseña" />
    <button class="btn" id="reg-submit">Registrarse</button>
    <p class="muted" id="reg-msg"></p>`;
  container.appendChild(el);

  el.querySelector('#reg-submit')!.addEventListener('click', async () => {
    const email = (el.querySelector('#reg-email') as HTMLInputElement).value;
    const displayName = (el.querySelector('#reg-name') as HTMLInputElement).value;
    const password = (el.querySelector('#reg-pass') as HTMLInputElement).value;
    const msg = el.querySelector('#reg-msg') as HTMLParagraphElement;

    const res = await fetch('/api/v1/blocks/register/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName, password }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    msg.textContent = data.ok ? 'registro recibido, esperando aprobación' : (data.error ?? 'error en el registro');
  });

  return () => el.remove();
});
