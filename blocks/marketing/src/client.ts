import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque Marketing — cliente.
 *
 * Monta un listado básico de cupones activos en el slot. La administración
 * real (alta/baja/edición) se hace vía las rutas del servidor.
 */
export default defineClientBlock(manifest, ({ container, i18n }) => {
  const el = document.createElement('div');
  el.innerHTML = `<p class="muted">${i18n.t('marketing')}</p><div id="coupons" class="stack"></div>`;
  container.appendChild(el);

  const list = el.querySelector('#coupons')!;
  void fetch('/api/v1/blocks/marketing/coupons')
    .then((r) => r.json())
    .then((coupons: Array<{ id: string; code: string; discountPercent: number; active: boolean }>) => {
      const active = coupons.filter((c) => c.active);
      list.innerHTML = active.length
        ? active.map((c) => `<span class="badge">${c.code} · ${c.discountPercent}%</span>`).join(' ')
        : '<span class="muted">Sin cupones activos</span>';
    })
    .catch(() => {
      list.innerHTML = '<span class="muted">No disponible</span>';
    });

  return () => el.remove();
});
