/**
 * Adaptadores de analytics (GA4 Measurement Protocol / Plausible / Matomo).
 * Fire-and-forget: nunca interrumpe el request. Si no hay configuración para
 * el proveedor, es un no-op. Todo se lee de `config`.
 */

export interface AnalyticsEvent {
  name: string;
  url?: string;
  params?: Record<string, unknown>;
}

export type AnalyticsProvider = 'internal' | 'google-analytics' | 'plausible' | 'matomo';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** GA4 Measurement Protocol. */
async function sendGa4(config: Record<string, unknown>, event: AnalyticsEvent): Promise<void> {
  const measurementId = str(config.measurementId ?? config.trackingId);
  const apiSecret = str(config.apiSecret);
  if (!measurementId || !apiSecret) return;
  const clientId = str(config.clientId, crypto.randomUUID());
  const url =
    'https://www.google-analytics.com/mp/collect' +
    `?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, events: [{ name: event.name, params: event.params ?? {} }] }),
  });
}

/** Plausible Events API. */
async function sendPlausible(config: Record<string, unknown>, event: AnalyticsEvent): Promise<void> {
  const domain = str(config.domain);
  if (!domain) return;
  const serverUrl = str(config.serverUrl, 'https://plausible.io').replace(/\/+$/, '');
  await fetchWithTimeout(`${serverUrl}/api/event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': str(config.userAgent, 'webs-platform/1.0'),
      'X-Forwarded-For': str(config.forwardedFor, '127.0.0.1'),
    },
    body: JSON.stringify({ name: event.name, url: event.url ?? '', domain, props: event.params }),
  });
}

/** Matomo Tracking HTTP API. */
async function sendMatomo(config: Record<string, unknown>, event: AnalyticsEvent): Promise<void> {
  const siteId = str(config.siteId);
  if (!siteId) return;
  const serverUrl = str(config.serverUrl ?? config.matomoUrl).replace(/\/+$/, '');
  if (!serverUrl) return;
  const params = new URLSearchParams({
    idsite: siteId,
    rec: '1',
    action_name: event.name,
    url: event.url ?? '',
    _id: str(config.clientId, crypto.randomUUID()),
  });
  await fetchWithTimeout(`${serverUrl}/matomo.php?${params.toString()}`, { method: 'POST' });
}

/**
 * Envía un evento de analytics al proveedor configurado (fire-and-forget).
 * No lanza nunca; si el proveedor no está configurado, no hace nada.
 */
export async function track(
  provider: string,
  config: Record<string, unknown>,
  event: AnalyticsEvent,
): Promise<void> {
  try {
    if (provider === 'google-analytics') await sendGa4(config, event);
    else if (provider === 'plausible') await sendPlausible(config, event);
    else if (provider === 'matomo') await sendMatomo(config, event);
  } catch {
    /* fire-and-forget: no interrumpe el request */
  }
}
