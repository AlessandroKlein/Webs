import type { Measurement } from '@webs/iot';

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function obj(v: unknown): Record<string, unknown> {
  return (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
}

/**
 * Parsea el payload real de `GET /api/v1/sensors` de SEMA → `Measurement[]`.
 * Cada entrada de `measurements[]` genera una métrica `sensor_id.channel`
 * (o `sensor_id.measurement` si no hay canal); las entradas sin `value` numérico
 * se ignoran y las claves repetidas se deduplican quedándose con la última.
 * `quality` no se exporta como métrica (fuera de alcance).
 */
export function mapSemaToMeasurements(payload: unknown, deviceId: string, now: Date): Measurement[] {
  const root = obj(payload);
  const list = Array.isArray(root.measurements) ? root.measurements : [];
  const byMetric = new Map<string, Measurement>();
  for (const raw of list) {
    const m = obj(raw);
    const sensorId = String(m.sensor_id ?? '').trim();
    const suffix = String(m.channel_id ?? '').trim() || String(m.measurement ?? '').trim();
    const value = asNumber(m.value);
    if (value === null) continue;
    const metric = [sensorId, suffix].filter(Boolean).join('.');
    if (!metric) continue;
    const unit = typeof m.unit === 'string' ? m.unit : undefined;
    byMetric.set(metric, { ts: now, deviceId, metric, value, unit });
  }
  return [...byMetric.values()];
}
