import { defineClientPlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default defineClientPlugin(manifest, () => {
  // El dashboard y los gráficos históricos se agregan en t174 (M13 UI).
  return () => {};
});
