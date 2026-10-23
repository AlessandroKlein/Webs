import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = `<input class="input" id="reg-email" type="email" placeholder="Email" />
    <input class="input" id="reg-name" placeholder="Nombre" />
    <input class="input" id="reg-user" placeholder="Usuario (opcional)" />
    <input class="input" id="reg-pass" type="password" placeholder="Contraseña" />
    <input class="input" id="reg-invite" placeholder="Código de invitación (opcional)" />
    <button class="btn" id="reg-submit">Registrarse</button>
    <p class="muted" id="reg-msg"></p>`;
  container.appendChild(el);

  el.querySelector('#reg-submit')!.addEventListener('click', async () => {
    const email = (el.querySelector('#reg-email') as HTMLInputElement).value;
    const displayName = (el.querySelector('#reg-name') as HTMLInputElement).value;
    const username = (el.querySelector('#reg-user') as HTMLInputElement).value;
    const password = (el.querySelector('#reg-pass') as HTMLInputElement).value;
    const inviteToken = (el.querySelector('#reg-invite') as HTMLInputElement).value;
    const msg = el.querySelector('#reg-msg') as HTMLParagraphElement;

    const res = await fetch('/api/v1/plugins/register/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName: displayName || undefined,
        username: username || undefined,
        password,
        inviteToken: inviteToken || undefined,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; user?: { email?: string } };
    if (data.user) {
      msg.textContent = `Registro exitoso como ${data.user.email}.`;
    } else {
      msg.textContent = data.error ?? 'error en el registro';
    }
  });

  return () => el.remove();
});
