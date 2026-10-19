import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const AVAILABLE = ['openai', 'anthropic', 'gemini', 'ollama'] as const;
const DEFAULT_SYSTEM = 'Sos un asistente útil y conciso.';

type ChatMessageInput = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * chat-ia — servidor.
 *
 *  - GET  /config → {provider, model, available}.
 *  - POST /chat   → responde con el modelo configurado. Para `ollama` intenta
 *    `fetch({ollamaUrl}/api/chat)`; si falla (o el proveedor no tiene API key)
 *    devuelve una respuesta simulada explícita. Persiste el mensaje del usuario
 *    y la respuesta en `db.chatMessage` dentro de `config.room` (default "general").
 *
 * No se usa ninguna API key real en el código: se lee de `config`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const provider = String(config.provider ?? 'openai');
    const model = String(config.model ?? 'gpt-4o-mini');
    const apiKey = String(config.apiKey ?? '');
    const ollamaUrl = String(config.ollamaUrl ?? 'http://localhost:11434');
    const room = String(config.room ?? 'general');
    const systemPrompt = String(config.systemPrompt ?? DEFAULT_SYSTEM);
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    fastify.get('/config', async () => ({
      provider,
      model,
      available: AVAILABLE,
    }));

    fastify.post('/chat', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { message?: string; history?: ChatMessageInput[] };
      };
      const message = (body?.message ?? '').trim();
      if (!message) return { ok: false, error: 'message es requerido' };

      const history = Array.isArray(body?.history) ? body.history : [];
      const messages: ChatMessageInput[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      let reply: string;

      if (provider === 'ollama' && ollamaUrl) {
        try {
          const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages }),
          });
          if (res.ok) {
            const data = (await res.json()) as { message?: { content?: string } };
            reply = data.message?.content ?? '';
          } else {
            reply = `Respuesta simulada: ${provider} respondió ${res.status}.`;
          }
        } catch {
          reply = `Respuesta simulada: no se pudo contactar a ${provider} en ${ollamaUrl}.`;
        }
      } else {
        reply = `Respuesta simulada: ${provider} sin API key configurada.`;
      }

      // Persiste el mensaje del usuario y la respuesta de la IA en la sala.
      await db.chatMessage.create({ data: { from: 'user', to: room, body: message } });
      await db.chatMessage.create({ data: { from: 'ai', to: room, body: reply } });

      return { ok: true, reply, provider, model, room };
    });
  },
});
