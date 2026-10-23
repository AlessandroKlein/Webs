import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container, config }) => {
  const configured = (Array.isArray(config.providers) ? config.providers : []) as Array<{
    id: string;
    name: string;
    enabled?: boolean;
  }>;
  const enabled = configured.filter((p) => Boolean(p.enabled));

  const el = document.createElement('div');
  el.innerHTML = `<div id="social-btns"></div><p class="muted" id="social-msg"></p>`;
  container.appendChild(el);

  const msg = el.querySelector('#social-msg') as HTMLElement;
  if (enabled.length === 0) {
    msg.textContent = 'Sin proveedores habilitados.';
  }

  const btns = el.querySelector('#social-btns')!;
  for (const p of enabled) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = `Continuar con ${p.name}`;
    b.addEventListener('click', async () => {
      // Flujo OAuth2 real: el servidor genera state + PKCE y devuelve la URL de
      // authorize; el navegador redirige al proveedor. Al volver, el proveedor
      // redirige al /callback del plugin, que valida e intercambia el code.
      msg.textContent = 'Redirigiendo…';
      try {
        const res = await fetch('/api/v1/plugins/social-login/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: p.id, redirectBackTo: window.location.href }),
        });
        const data = (await res.json()) as { ok?: boolean; authorizeUrl?: string; error?: string };
        if (data.ok && data.authorizeUrl) {
          window.location.href = data.authorizeUrl;
        } else {
          msg.textContent = data.error ?? 'No se pudo iniciar el login.';
        }
      } catch {
        msg.textContent = 'Error al contactar el servidor.';
      }
    });
    btns.appendChild(b);
  }

  return () => el.remove();
});
