import { describe, expect, it, vi } from 'vitest';

import { startEventCollector } from '../src/events';
import type { DeviceClient } from '../src/client';

const DEVICE = 'device-1';

function makeClient(events: unknown, alarms: unknown, fail: Array<'events' | 'alarms'> = []): DeviceClient {
  return {
    fetchJson: async (path: string) => {
      if (path.endsWith('/events')) {
        if (fail.includes('events')) throw new Error('firmware sin /events');
        return events;
      }
      if (path.endsWith('/alarms')) {
        if (fail.includes('alarms')) throw new Error('firmware sin /alarms');
        return alarms;
      }
      throw new Error(`ruta inesperada: ${path}`);
    },
  } as unknown as DeviceClient;
}

const SEMA_EVENTS = { events: [{ ts: 4000000000, type: 'alarm', source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 }] };
const SEMA_ALARMS = { alarms: [{ ts: 4000000000, source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 }] };
const FP = '4000000000||EXT|high_temp|WARNING|4150|';

describe('startEventCollector (dedupe por ventana + allSettled)', () => {
  it('dedupe por ventana: filtra fingerprints ya persistidos', async () => {
    const written: unknown[] = [];
    const col = startEventCollector({
      deviceId: DEVICE,
      client: makeClient(SEMA_EVENTS, SEMA_ALARMS),
      prefix: '',
      readRecentFingerprints: async () => [FP],
      writeEvents: async (rows) => { written.push(...rows); },
      intervalMs: 60_000,
    });
    await col.runOnce();
    expect(written).toHaveLength(0);
    col.stop();
  });

  it('mismo fingerprint fuera de la ventana (reinicio) se inserta; events+alarms convergen a una fila', async () => {
    const written: unknown[] = [];
    const col = startEventCollector({
      deviceId: DEVICE,
      client: makeClient(SEMA_EVENTS, SEMA_ALARMS),
      prefix: '',
      readRecentFingerprints: async () => [],
      writeEvents: async (rows) => { written.push(...rows); },
      intervalMs: 60_000,
    });
    await col.runOnce();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ kind: 'alarm', tsRaw: 4000000000, source: 'EXT' });
    col.stop();
  });

  it('la ventana se pide una sola vez por ciclo', async () => {
    const read = vi.fn(async () => [] as string[]);
    const col = startEventCollector({
      deviceId: DEVICE,
      client: makeClient(SEMA_EVENTS, SEMA_ALARMS),
      prefix: '',
      readRecentFingerprints: read,
      writeEvents: async () => {},
      intervalMs: 60_000,
    });
    await col.runOnce();
    expect(read).toHaveBeenCalledTimes(1);
    col.stop();
  });

  it('allSettled: si /alarms falla persiste /events y loguea el fallo', async () => {
    const written: unknown[] = [];
    const errors: string[] = [];
    const col = startEventCollector({
      deviceId: DEVICE,
      client: makeClient(SEMA_EVENTS, SEMA_ALARMS, ['alarms']),
      prefix: '',
      readRecentFingerprints: async () => [],
      writeEvents: async (rows) => { written.push(...rows); },
      onError: (err) => { errors.push(err instanceof Error ? err.message : String(err)); },
      intervalMs: 60_000,
    });
    await col.runOnce();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ kind: 'alarm', tsRaw: 4000000000 });
    expect(errors.some((e) => e.includes('/alarms'))).toBe(true);
    col.stop();
  });

  it('allSettled: si ambos fallan no escribe nada y loguea los dos', async () => {
    const written: unknown[] = [];
    const errors: string[] = [];
    const col = startEventCollector({
      deviceId: DEVICE,
      client: makeClient(SEMA_EVENTS, SEMA_ALARMS, ['events', 'alarms']),
      prefix: '',
      readRecentFingerprints: async () => [],
      writeEvents: async (rows) => { written.push(...rows); },
      onError: (err) => { errors.push(err instanceof Error ? err.message : String(err)); },
      intervalMs: 60_000,
    });
    await col.runOnce();
    expect(written).toHaveLength(0);
    expect(errors).toHaveLength(2);
    col.stop();
  });
});
