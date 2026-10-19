import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const cfg = config as Record<string, unknown>;
    const endpoint = String(cfg.endpoint ?? '');
    const apiKey = String(cfg.apiKey ?? '');
    const model = String(cfg.model ?? 'gpt-4o-mini');

    fastify.post('/message', async (request: unknown) => {
      const { body } = request as { body?: { message?: string } };
      if (!endpoint) return { reply: 'Configurá el endpoint del modelo en los ajustes del bloque.' };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: body?.message ?? '' }] }),
      });
      if (!res.ok) return { reply: `Error del modelo: ${res.status}` };
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return { reply: data.choices?.[0]?.message?.content ?? '' };
    });
  },
});
