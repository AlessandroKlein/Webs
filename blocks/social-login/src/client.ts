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
      // Referencia: en un flujo real aquí se redirige al proveedor OAuth (TODO).
      // Se simula el callback con un providerId dummy y un email.
      const res = await fetch('/api/v1/plugins/social-login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: p.id,
          providerId: `dummy-${p.id}-${crypto.randomUUID()}`,
          email: `usuario.${p.id}@example.com`,
          displayName: `Usuario ${p.name}`,
        }),
      });
      const data = (await res.json()) as { linked?: boolean; error?: string };
      msg.textContent = data.linked ? 'cuenta vinculada' : (data.error ?? 'sin vincular aún');
    });
    btns.appendChild(b);
  }

  return () => el.remove();
});
