import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container, i18n }) => {
  const el = document.createElement('div');
  el.innerHTML = `<p class="muted">${i18n.t('invoicing')}</p>`;
  container.appendChild(el);
  return () => el.remove();
});
