import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, ({ container, config }) => {
  if (config.enabled !== false) {
    void fetch('/api/v1/plugins/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {});
  }
  container.appendChild(document.createElement('span'));
  return () => {};
});
