import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
}

/**
 * suscripciones — cliente.
 *
 * Renderiza los planes activos dentro del slot en el que se coloque el plugin.
 * La contratación/cancelación completa se hace desde el panel del usuario
 * (`/dashboard` → Planes).
 */
export default defineClientPlugin(manifest, ({ container, api, config }) => {
  const currency = String(config.currency ?? 'ARS');
  const el = document.createElement('div');
  el.innerHTML = `<div class="stack" style="gap: var(--ws-space-3)">
    <h4>Planes de suscripción</h4>
    <div id="suscripciones-plans" class="stack" style="gap: var(--ws-space-2)"></div>
  </div>`;
  container.appendChild(el);

  const target = el.querySelector('#suscripciones-plans')!;

  void (async () => {
    try {
      const plans = await api.get<Plan[]>('/api/v1/plugins/suscripciones/plans');
      target.innerHTML = plans
        .map(
          (p) => `<div class="row" style="justify-content:space-between;align-items:center;gap:var(--ws-space-2)">
            <strong>${p.name}</strong>
            <span>${(p.price / 100).toFixed(2)} ${currency} · ${p.durationDays} días</span>
          </div>`,
        )
        .join('');
    } catch {
      target.innerHTML = '<p class="muted">No hay planes disponibles.</p>';
    }
  })();

  return () => el.remove();
});
