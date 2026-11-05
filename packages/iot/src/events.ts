import type { DeviceClient } from './client';

export type IotEventKind = 'event' | 'alarm';

/**
 * Fila normalizada lista para persistir (Prisma `IotDeviceEvent`). `tsRaw` es el
 * timestamp crudo del dispositivo SIN interpretar: uptime en ms en SEMA (`millis()`),
 * epoch en segundos en Invernadero (`time(nullptr)`). Ordenar/retener SIEMPRE por
 * `receivedAt`, nunca por `tsRaw`.
 */
export interface NormalizedIotEvent {
  deviceId: string;
  kind: IotEventKind;
  tsRaw: number;
  type: string | null;
  source: string | null;
  rule: string | null;
  severity: string | null;
  value: number | null;
  message: string | null;
  fingerprint: string;
}

type FingerprintInput = {
  tsRaw: number;
  type: string | null;
  source: string | null;
  rule: string | null;
  severity: string | null;
  value: number | null;
  message: string | null;
};

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Math.trunc(Number(v));
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

/** Fingerprint estable: fila completa (salvo deviceId/kind). `type:'alarm'` se omite para que /events y /alarms converjan al mismo hash. Sobrevive a ts que vuelve a 0 al reiniciar. */
function fingerprintOf(e: FingerprintInput): string {
  return `${e.tsRaw}|${e.type ?? ''}|${e.source ?? ''}|${e.rule ?? ''}|${e.severity ?? ''}|${e.value ?? ''}|${e.message ?? ''}`;
}

/** SEMA: {events:[{ts,type,source,rule,severity,value}]} o {alarms:[...]} (alarms sin `type`). */
function normalizeSema(kind: IotEventKind, raw: unknown, deviceId: string): NormalizedIotEvent[] {
  const m = asObj(raw);
  const tsRaw = asInt(m.ts); // uptime ms (millis()), NO epoch
  if (tsRaw === null) return [];
  const type = asStr(m.type);
  // La misma alarma llega por /events (type:'alarm') y por /alarms (sin type): el kind
  // canónico es 'alarm' en ambas, y el `type` 'alarm' se omite del fingerprint.
  const canonicalKind: IotEventKind = kind === 'alarm' || type === 'alarm' ? 'alarm' : 'event';
  const base = {
    deviceId,
    kind: canonicalKind,
    tsRaw,
    type,
    source: asStr(m.source),
    rule: asStr(m.rule),
    severity: asStr(m.severity),
    value: asNum(m.value), // x100 en alarmas de regla (4150 = 41,50): la UI divide
    message: null as string | null,
  };
  return [{ ...base, fingerprint: fingerprintOf({ ...base, type: type === 'alarm' ? null : type }) }];
}

/** Invernadero: array plano [{t (epoch s), sev (0..3), msg}] — sin type/source/rule/value. */
function normalizeInvernadero(kind: IotEventKind, raw: unknown, deviceId: string): NormalizedIotEvent[] {
  const m = asObj(raw);
  const tsRaw = asInt(m.t); // epoch SECONDS (time(nullptr))
  if (tsRaw === null) return [];
  const sev = asInt(m.sev); // 0 info, 1 warning, 2 error, 3 alarma
  // El firmware sirve /alarms como subconjunto de /events (sev >= 2): el kind canónico
  // es 'alarm' si sev >= 2, sin importar por cuál endpoint entró.
  const canonicalKind: IotEventKind = kind === 'alarm' || (sev !== null && sev >= 2) ? 'alarm' : 'event';
  const base = {
    deviceId,
    kind: canonicalKind,
    tsRaw,
    type: null as string | null,
    source: null as string | null,
    rule: null as string | null,
    severity: sev !== null ? String(sev) : null,
    value: null as number | null,
    message: asStr(m.msg),
  };
  return [{ ...base, fingerprint: fingerprintOf(base) }];
}

/**
 * Normaliza la respuesta de GET /events o /alarms a filas `IotDeviceEvent`, sin
 * deduplicar (el dedupe por ventana lo hace el collector, ver `startEventCollector`).
 * Detecta la forma por el payload: SEMA envuelve en {events:[...]}/{alarms:[...]};
 * Invernadero devuelve un array plano [{t, sev, msg}].
 */
export function normalizeEvents(kind: IotEventKind, payload: unknown, deviceId: string): NormalizedIotEvent[] {
  if (Array.isArray(payload)) return payload.flatMap((raw) => normalizeInvernadero(kind, raw, deviceId));
  const root = asObj(payload);
  const key = kind === 'event' ? 'events' : 'alarms';
  const list = Array.isArray(root[key]) ? (root[key] as unknown[]) : [];
  return list.flatMap((raw) => normalizeSema(kind, raw, deviceId));
}

/** Convierte `tsRaw` persistido (BigInt de Prisma) a number para serializar a JSON. */
export function serializeTsRaw(tsRaw: number | bigint): number {
  return typeof tsRaw === 'bigint' ? Number(tsRaw) : tsRaw;
}

export interface EventCollectorOptions {
  deviceId: string;
  client: DeviceClient;
  /** Prefijo ya calculado con `deviceApiPrefix(device.baseUrl)`. */
  prefix: string;
  /** Persistencia (normalmente `db.iotDeviceEvent.createMany`). */
  writeEvents: (rows: NormalizedIotEvent[]) => Promise<void>;
  /** Lee los fingerprints recientes del device (ventana de dedupe). */
  readRecentFingerprints: (limit: number) => Promise<string[]>;
  intervalMs?: number;
  onError?: (err: unknown) => void;
}

export interface EventCollector {
  stop: () => void;
  runOnce: () => Promise<void>;
}

/** Ventana de dedupe: últimas filas del device (cubre el buffer de ~100 entradas del equipo). */
const DEDUPE_WINDOW = 300;

/**
 * Sondeo de events+alarms, independiente del collector de medidas (no lo bloquea si falla).
 * Dedupe: (1) intra-ciclo (una misma alarma puede venir por /events y por /alarms) y
 * (2) por ventana contra los fingerprints ya persistidos. Si la API cae mucho tiempo,
 * pueden aparecer duplicados VISIBLES (mejor que pérdidas silenciosas por unique permanente).
 */
export function startEventCollector(opts: EventCollectorOptions): EventCollector {
  let running = false;
  async function runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const [eventsRes, alarmsRes] = await Promise.allSettled([
        opts.client.fetchJson<unknown>(`${opts.prefix}/events`),
        opts.client.fetchJson<unknown>(`${opts.prefix}/alarms`),
      ]);
      if (eventsRes.status === 'rejected') opts.onError?.(eventsRes.reason);
      if (alarmsRes.status === 'rejected') opts.onError?.(alarmsRes.reason);

      const normalized = [
        ...normalizeEvents('event', eventsRes.status === 'fulfilled' ? eventsRes.value : undefined, opts.deviceId),
        ...normalizeEvents('alarm', alarmsRes.status === 'fulfilled' ? alarmsRes.value : undefined, opts.deviceId),
      ];
      if (normalized.length === 0) return;

      // Dedupe intra-ciclo: /events y /alarms pueden describir la misma alarma física.
      const seen = new Set<string>();
      const deduped: NormalizedIotEvent[] = [];
      for (const r of normalized) {
        if (seen.has(r.fingerprint)) continue;
        seen.add(r.fingerprint);
        deduped.push(r);
      }

      // Dedupe por ventana: una sola lectura por ciclo. Un reinicio del equipo cambia ts
      // (vuelve a 0) y por tanto el fingerprint, así que no bloquea eventos nuevos.
      const recent = new Set(await opts.readRecentFingerprints(DEDUPE_WINDOW));
      const fresh = deduped.filter((r) => !recent.has(r.fingerprint));
      if (fresh.length > 0) await opts.writeEvents(fresh);
    } catch (err) {
      opts.onError?.(err);
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => {
    void runOnce();
  }, Math.max(1000, opts.intervalMs ?? 60_000));
  return { runOnce, stop: () => clearInterval(timer) };
}
