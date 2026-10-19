import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

// Referencia: contador en memoria. En producción usar una tabla persistente.
const pages = new Map<string, number>();
let total = 0;

export default defineBlock(manifest, {
  register: async (fastify) => {
    fastify.post('/track', async (request: unknown) => {
      const { body } = request as { body?: { path?: string } };
      const path = body?.path ?? '/';
      pages.set(path, (pages.get(path) ?? 0) + 1);
      total += 1;
      return { ok: true };
    });

    fastify.get('/stats', async () => ({
      total,
      pages: [...pages.entries()].map(([path, views]) => ({ path, views })),
    }));
  },
});
