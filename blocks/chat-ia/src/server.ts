import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import { chatCompletion } from '../../../apps/api/src/integrations/ai';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

const AVAILABLE = ['openai', 'anthropic', 'gemini', 'ollama'] as const;
const DEFAULT_SYSTEM = 'Sos un asistente útil y conciso.';

type ChatMessageInput = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * chat-ia — servidor.
 *
 *  - GET  /config → {provider, model, available}.
 *  - POST /chat   → responde con el modelo configurado vía `chatCompletion`
 *    (OpenAI/Anthropic/Gemini/Ollama). Si el proveedor no tiene API key o falla,
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

      // Llamada real al proveedor configurado; `null` → respuesta simulada.
      const reply =
        (await chatCompletion(provider, config, messages)) ??
        `Respuesta simulada: ${provider} sin API key configurada.`;

      // Persiste el mensaje del usuario y la respuesta de la IA en la sala.
      await db.chatMessage.create({ data: { from: 'user', to: room, body: message } });
      await db.chatMessage.create({ data: { from: 'ai', to: room, body: reply } });

      return { ok: true, reply, provider, model, room };
    });
  },
});
