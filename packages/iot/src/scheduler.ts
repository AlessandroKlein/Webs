import type { DeviceClient } from './client';
import type { IoTStore } from './store';
import type { Measurement } from './types';

export interface CollectorOptions {
  /** Dispositivo dueño de las muestras (id). */
  deviceId: string;
  /** Cliente HTTP del dispositivo. */
  client: DeviceClient;
  /** Almacén de serie temporal. */
  store: IoTStore;
  /** Ruta del endpoint que devuelve el lote de medidas. */
  measurementsPath: string;
  /** Intervalo de sondeo en ms. */
  intervalMs: number;
  /** Parser opcional: adapta la respuesta del dispositivo a `Measurement[]`. */
  parse?: (payload: unknown, deviceId: string, now: Date) => Measurement[];
  /** Llamado en cada error (no detiene el scheduler). */
  onError?: (err: unknown) => void;
  /** Llamado tras cada ciclo exitoso. */
  onSuccess?: (measurements: Measurement[]) => void;
}

function defaultParse(payload: unknown, deviceId: string, now: Date): Measurement[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map((m) => ({
        ts: (m.ts as Date) ?? now,
        deviceId,
        metric: String(m.metric ?? m.key ?? 'value'),
        value: Number(m.value),
        unit: typeof m.unit === 'string' ? m.unit : undefined,
      }));
  }
  if (typeof payload === 'object' && payload !== null) {
    return Object.entries(payload as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'number')
      .map(([metric, value]) => ({ ts: now, deviceId, metric, value: value as number }));
  }
  return [];
}

export interface Collector {
  stop: () => void;
  /** Ejecuta un ciclo inmediatamente (además del timer). */
  runOnce: () => Promise<void>;
}

/** Arranca un sondeo periódico. Devuelve el handle para detenerlo. */
export function startCollector(opts: CollectorOptions): Collector {
  const parse = opts.parse ?? defaultParse;
  let running = false;

  async function runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const payload = await opts.client.fetchJson<unknown>(opts.measurementsPath);
      const now = new Date();
      const measurements = parse(payload, opts.deviceId, now);
      if (measurements.length > 0) await opts.store.writeBatch(measurements);
      opts.onSuccess?.(measurements);
    } catch (err) {
      opts.onError?.(err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void runOnce();
  }, Math.max(1000, opts.intervalMs));

  return {
    runOnce,
    stop: () => clearInterval(timer),
  };
}
