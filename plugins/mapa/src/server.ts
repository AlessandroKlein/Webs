import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    fastify.get('/public-config', async () => config);
  },
});
