import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import { chatCompletion } from '../../../apps/api/src/integrations/ai';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

const AVAILABLE = ['openai', 'anthropic', 'gemini', 'ollama', 'mistral', 'groq', 'openrouter'] as const;
const DEFAULT_SYSTEM = 'Sos un asistente útil y conciso.';

/** URL base por defecto para proveedores OpenAI-compatibles (se les suma `/v1/chat/completions`). */
const OPENAI_COMPAT_DEFAULTS: Record<string, string> = {
  mistral: 'https://api.mistral.ai',
  groq: 'https://api.groq.com/openai',
  openrouter: 'https://openrouter.ai/api',
};

type ChatMessageInput = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * Llamada a un endpoint OpenAI-compatible (`POST <baseUrl>/v1/chat/completions`).
 * Devuelve `null` sin API key o ante un error, para que se use la respuesta simulada.
 */
async function openAICompatibleChat(
  config: Record<string, unknown>,
  baseUrl: string,
  messages: ChatMessageInput[],
): Promise<string | null> {
  const apiKey = String(config.apiKey ?? '');
  const clean = baseUrl.replace(/\/+$/, '');
  if (!apiKey || !clean) return null;
  try {
    const res = await fetch(`${clean}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: String(config.model ?? 'gpt-4o-mini'),
        messages,
        temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

/** Resuelve el chat contra el proveedor configurado; `null` → respuesta simulada. */
async function resolveChat(
  provider: string,
  config: Record<string, unknown>,
  messages: ChatMessageInput[],
): Promise<string | null> {
  if (provider === 'mistral' || provider === 'groq' || provider === 'openrouter') {
    const baseUrl = String(config.baseUrl ?? OPENAI_COMPAT_DEFAULTS[provider] ?? '');
    return openAICompatibleChat(config, baseUrl, messages);
  }
  return chatCompletion(provider, config, messages);
}

/**
 * chat-ia — servidor.
 *
 *  - GET  /config → {provider, model, available}.
 *  - POST /chat   → responde con el modelo configurado vía `chatCompletion`
 *    (OpenAI/Anthropic/Gemini/Ollama) o, para Mistral/Groq/OpenRouter, vía un
 *    endpoint OpenAI-compatible (`POST /v1/chat/completions`). Si el proveedor no
 *    tiene API key o falla, devuelve una respuesta simulada explícita. Persiste el
 *    mensaje del usuario y la respuesta en `db.chatMessage` dentro de `config.room`
 *    (default "general").
 *
 * No se usa ninguna API key real en el código: se lee de `config`.
 */
export default definePlugin(manifest, {
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
        (await resolveChat(provider, config, messages)) ??
        `Respuesta simulada: ${provider} sin API key configurada.`;

      // Persiste el mensaje del usuario y la respuesta de la IA en la sala.
      await db.chatMessage.create({ data: { from: 'user', to: room, body: message } });
      await db.chatMessage.create({ data: { from: 'ai', to: room, body: reply } });

      return { ok: true, reply, provider, model, room };
    });
  },
});
