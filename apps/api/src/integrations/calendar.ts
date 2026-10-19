/**
 * Adaptadores de calendario externo (Google Calendar / CalDAV). Devuelven
 * `{ external: false }` cuando no hay credenciales o falla la llamada; el
 * bloque mantiene siempre la persistencia local. Todo se lee de `config`.
 */

export interface CalendarEventInput {
  title: string;
  start: Date | string;
  end?: Date | string | null;
  timezone?: string;
  description?: string;
  location?: string;
}

export interface ExternalEventResult {
  external: boolean;
  provider: string;
  id?: string;
  link?: string;
  raw?: unknown;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    out += BASE64_CHARS[(b0 >> 2) & 0x3f];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += has1 ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += has2 ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function googleDateTime(value: Date | string | null | undefined, timezone: string): Record<string, string> {
  const date = value ? new Date(value) : new Date();
  return { dateTime: date.toISOString(), timeZone: timezone };
}

async function createGoogleEvent(
  config: Record<string, unknown>,
  event: CalendarEventInput,
): Promise<ExternalEventResult> {
  const accessToken = str(config.accessToken ?? config.token);
  const apiKey = str(config.apiKey);
  if (!accessToken && !apiKey) return { external: false, provider: 'google' };

  const calendarId = str(config.calendarId, 'primary');
  const timezone = str(config.timezone ?? event.timezone, 'UTC');
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  else url.searchParams.set('key', apiKey);

  const res = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      location: event.location,
      start: googleDateTime(event.start, timezone),
      end: googleDateTime(event.end ?? event.start, timezone),
    }),
  });
  if (!res.ok) return { external: false, provider: 'google' };

  const data = (await res.json()) as { id?: string; htmlLink?: string };
  return { external: true, provider: 'google', id: data.id, link: data.htmlLink, raw: data };
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsStamp(value: Date | string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildIcs(event: CalendarEventInput, uid: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Webs//Calendar//ES',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(event.start)}`,
    `DTEND:${icsStamp(event.end ?? event.start)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

async function createCaldavEvent(
  config: Record<string, unknown>,
  event: CalendarEventInput,
): Promise<ExternalEventResult> {
  const url = str(config.caldavUrl ?? config.url);
  const username = str(config.username ?? config.caldavUsername);
  const password = str(config.password ?? config.caldavPassword);
  if (!url || !username || !password) return { external: false, provider: 'caldav' };

  const uid = crypto.randomUUID();
  const res = await fetchWithTimeout(
    `${url.replace(/\/+$/, '')}/${encodeURIComponent(`${uid}.ics`)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        Authorization: `Basic ${toBase64(`${username}:${password}`)}`,
      },
      body: buildIcs(event, uid),
    },
  );
  if (!res.ok) return { external: false, provider: 'caldav' };
  return { external: true, provider: 'caldav', id: uid };
}

/**
 * Crea un evento en el calendario externo ("google" o "caldav") si hay
 * credenciales; en caso contrario (o ante error) devuelve `{ external: false }`.
 */
export async function createExternalEvent(
  provider: string,
  config: Record<string, unknown>,
  event: CalendarEventInput,
): Promise<ExternalEventResult> {
  try {
    if (provider === 'google') return await createGoogleEvent(config, event);
    if (provider === 'caldav') return await createCaldavEvent(config, event);
    return { external: false, provider };
  } catch {
    return { external: false, provider };
  }
}
