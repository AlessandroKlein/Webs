/**
 * Adaptadores de chat con IA (OpenAI / Anthropic / Gemini / Ollama).
 * Devuelve `null` cuando no hay API key o el proveedor falla, para que el
 * bloque muestre la respuesta simulada. Todo se lee de `config`.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function openaiChat(config: Record<string, unknown>, messages: ChatMessage[]): Promise<string | null> {
  const apiKey = str(config.apiKey);
  if (!apiKey) return null;
  const baseUrl = str(config.baseUrl, 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: str(config.model, 'gpt-4o-mini'),
      messages,
      temperature: typeof config.temperature === 'number' ? config.temperature : undefined,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}

async function anthropicChat(config: Record<string, unknown>, messages: ChatMessage[]): Promise<string | null> {
  const apiKey = str(config.apiKey);
  if (!apiKey) return null;
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: str(config.model, 'claude-3-5-sonnet-latest'),
      max_tokens: Number(config.maxTokens ?? 1024),
      system: system || undefined,
      messages: rest,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text;
  return typeof text === 'string' ? text : null;
}

async function geminiChat(config: Record<string, unknown>, messages: ChatMessage[]): Promise<string | null> {
  const apiKey = str(config.apiKey);
  if (!apiKey) return null;
  const model = str(config.model, 'gemini-1.5-flash');
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text : null;
}

async function ollamaChat(config: Record<string, unknown>, messages: ChatMessage[]): Promise<string | null> {
  const ollamaUrl = str(config.ollamaUrl, 'http://localhost:11434').replace(/\/+$/, '');
  if (!ollamaUrl) return null;
  const res = await fetchWithTimeout(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: str(config.model, 'llama3'), messages }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { message?: { content?: string } };
  const content = data.message?.content;
  return typeof content === 'string' ? content : null;
}

/**
 * Realiza una llamada de chat contra el proveedor configurado. Devuelve el
 * texto de la respuesta o `null` (sin API key, proveedor no soportado o error).
 */
export async function chatCompletion(
  provider: string,
  config: Record<string, unknown>,
  messages: ChatMessage[],
): Promise<string | null> {
  try {
    switch (provider) {
      case 'openai':
        return await openaiChat(config, messages);
      case 'anthropic':
        return await anthropicChat(config, messages);
      case 'gemini':
        return await geminiChat(config, messages);
      case 'ollama':
        return await ollamaChat(config, messages);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
