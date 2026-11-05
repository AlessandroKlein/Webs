import { api } from '../../lib/api';

export type IotDeviceKind = 'invernadero' | 'sema';
export type IotAuthMode = 'bearer' | 'x-auth-token' | 'x-api-key';
export type Aggregation = 'avg' | 'min' | 'max' | 'count' | 'sum';
export type SeriesRange = '1h' | '24h' | '7d' | '30d';
export type SeriesBucket = 'raw' | 'hour' | 'day';

export interface IotDevice {
  id: string;
  organizationId: string;
  kind: IotDeviceKind;
  name: string;
  baseUrl: string;
  tokenCipher: string | null;
  authMode: IotAuthMode;
  pollIntervalMs: number;
  enabled: boolean;
  lastSeenAt: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesPoint {
  ts: string;
  value: number | null;
  min?: number;
  max?: number;
  count?: number;
  unit?: string | null;
}

export interface TestResult {
  ok: boolean;
  error?: string;
}

export type DeviceMetricValue = number | { value: number; unit?: string };

/** Estado en vivo normalizado que exponen los plugins (p. ej. GET /status). */
export interface DeviceStatus {
  online: boolean;
  lastSeenAt?: string | null;
  metrics?: Record<string, DeviceMetricValue>;
}

export interface DeviceInput {
  name: string;
  baseUrl: string;
  kind: IotDeviceKind;
  authMode: IotAuthMode;
  token?: string;
  pollIntervalMs?: number;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export const DEVICE_KINDS: IotDeviceKind[] = ['invernadero', 'sema'];
export const AUTH_MODES: IotAuthMode[] = ['bearer', 'x-auth-token', 'x-api-key'];
export const AGGREGATIONS: Aggregation[] = ['avg', 'min', 'max', 'sum', 'count'];
export const SERIES_RANGES: SeriesRange[] = ['1h', '24h', '7d', '30d'];

const strip = (basePath: string) => basePath.replace(/\/+$/, '');

export function listDevices(basePath: string): Promise<IotDevice[]> {
  return api.get<IotDevice[]>(`${strip(basePath)}/devices`);
}

export function createDevice(basePath: string, input: DeviceInput): Promise<IotDevice> {
  return api.post<IotDevice>(`${strip(basePath)}/devices`, input);
}

export function updateDevice(
  basePath: string,
  id: string,
  patch: Partial<DeviceInput>,
): Promise<IotDevice> {
  return api.patch<IotDevice>(`${strip(basePath)}/devices/${id}`, patch);
}

export function deleteDevice(basePath: string, id: string): Promise<{ ok: boolean }> {
  return api.del<{ ok: boolean }>(`${strip(basePath)}/devices/${id}`);
}

export function testDevice(basePath: string, id: string): Promise<TestResult> {
  return api.post<TestResult>(`${strip(basePath)}/devices/${id}/test`);
}

export interface SeriesQuery {
  metric: string;
  from?: string;
  to?: string;
  agg?: Aggregation;
  bucket?: SeriesBucket;
  limit?: number;
}

export function fetchSeries(
  basePath: string,
  id: string,
  q: SeriesQuery,
): Promise<SeriesPoint[]> {
  const params = new URLSearchParams();
  params.set('metric', q.metric);
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  if (q.agg) params.set('agg', q.agg);
  if (q.bucket) params.set('bucket', q.bucket);
  if (q.limit) params.set('limit', String(q.limit));
  return api.get<SeriesPoint[]>(`${strip(basePath)}/devices/${id}/series?${params.toString()}`);
}

/** Rango de fechas para una ventana de serie (1h/24h/7d/30d). */
export function rangeWindow(range: SeriesRange, now = new Date()): { from: string; to: string } {
  const to = now.toISOString();
  const from = new Date(now.getTime());
  if (range === '1h') from.setHours(from.getHours() - 1);
  else if (range === '24h') from.setDate(from.getDate() - 1);
  else if (range === '7d') from.setDate(from.getDate() - 7);
  else from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to };
}

/** Evento/alarma persistido por el colector del plugin (task-20). */
export interface DeviceEvent {
  id: string;
  kind: 'event' | 'alarm';
  /** NO es fecha: uptime ms (SEMA) o epoch s (Invernadero). Usar `receivedAt`. */
  tsRaw: number | null;
  type?: string | null;
  source?: string | null;
  rule?: string | null;
  severity?: string | null;
  value?: number | null;
  message?: string | null;
  receivedAt: string;
}

export interface EventsQuery {
  kind?: 'event' | 'alarm';
  limit?: number;
}

/** Eventos recientes del dispositivo, orden `receivedAt DESC`. */
export function fetchEvents(
  basePath: string,
  id: string,
  q: EventsQuery = {},
): Promise<DeviceEvent[]> {
  const params = new URLSearchParams();
  if (q.kind) params.set('kind', q.kind);
  if (q.limit) params.set('limit', String(q.limit));
  return api
    .get<{ events: DeviceEvent[] }>(`${strip(basePath)}/devices/${id}/events?${params.toString()}`)
    .then((r) => r.events);
}

export type SeverityTone = 'danger' | 'warning' | 'neutral';

/** Normaliza severidad (SEMA string / Invernadero '0'..'3') a tono de Badge. */
export function severityTone(severity: string | null | undefined): SeverityTone {
  const s = String(severity ?? '').trim().toUpperCase();
  if (s === '2' || s === '3' || s === 'ERROR' || s === 'CRITICAL') return 'danger';
  if (s === '1' || s === 'WARNING') return 'warning';
  return 'neutral';
}
