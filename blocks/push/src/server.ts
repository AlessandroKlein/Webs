import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    fastify.get('/public-key', async () => ({ publicKey: cfg.publicKey ?? null }));
  },
});
