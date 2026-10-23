import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Plugin OCA — cliente: solo indica dónde configurar el proveedor. */
export default defineClientPlugin(manifest, ({ container }) => {
  const el = document.createElement('div');
  el.innerHTML = '<p style="margin:0;color:#667">Proveedor de envío OCA — configurá en /admin/block-settings.</p>';
  container.appendChild(el);
  return () => el.remove();
});
