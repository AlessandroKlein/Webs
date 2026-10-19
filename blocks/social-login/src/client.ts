import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const PROVIDERS = [
  { id: 'google', name: 'Google' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'github', name: 'GitHub' },
  { id: 'microsoft', name: 'Microsoft' },
];

export default defineClientBlock(manifest, ({ container, config }) => {
  const configured = (Array.isArray(config.providers) ? config.providers : []) as Array<{ id: string; name: string }>;
  const enabled = PROVIDERS.filter((p) => configured.some((c) => c.id === p.id));

  const el = document.createElement('div');
  el.innerHTML = `<div id="social-btns"></div><p class="muted" id="social-msg"></p>`;
  container.appendChild(el);

  const btns = el.querySelector('#social-btns')!;
  for (const p of enabled) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = `Continuar con ${p.name}`;
    b.addEventListener('click', async () => {
      // Referencia: en un flujo real aquí se redirige al proveedor OAuth.
      // Se simula el callback con un providerId dummy.
      const res = await fetch('/api/v1/blocks/social-login/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: p.id,
          providerId: `dummy-${p.id}-${crypto.randomUUID()}`,
          email: `usuario.${p.id}@example.com`,
          displayName: `Usuario ${p.name}`,
        }),
      });
      const data = (await res.json()) as { ok?: boolean };
      el.querySelector('#social-msg')!.textContent = data.ok ? 'conectado' : 'error al conectar';
    });
    btns.appendChild(b);
  }

  return () => el.remove();
});
