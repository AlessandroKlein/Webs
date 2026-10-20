import { defineClientBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/** Bloque Correo Argentino — cliente: solo indica dónde configurar el proveedor. */
export default defineClientBlock(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = '<p style="margin:0;color:#667">Proveedor de envío Correo Argentino — configurá en /admin/block-settings.</p>';
  container.appendChild(el);
  return () => el.remove();
});
