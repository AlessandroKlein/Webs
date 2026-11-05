import { createServer } from 'node:http';

import { describe, expect, it } from 'vitest';

import { createIotDeviceClient, deviceApiPrefix, deviceUrl } from '../src/client';
// Parser SEMA: importa solo un `import type` de @webs/iot, no arrastra el plugin.
import { mapSemaToMeasurements } from '../../../plugins/sema/src/parse';

const now = new Date('2026-11-05T12:00:00Z');
const DEVICE = 'device-1';

// Payload real documentado de `GET /api/v1/sensors` (SEMA).
const SENSORS_PAYLOAD = {
  catalog: [{ id: 'EXT', model: 'BME280', interface: 'I2C', healthy: true }],
  measurements: [
    { sensor_id: 'EXT', channel_id: 'temperature', measurement: 'temperature', value: 23.4, unit: '°C', quality: 'VALID', sequence: 123 },
    { sensor_id: 'EXT', channel_id: 'dew_point', measurement: 'dew_point', value: 12.1, unit: '°C', quality: 'VALID', sequence: 124 },
    { sensor_id: 'clock', channel_id: '0', measurement: 'clock', value: 1760000000, quality: 'VALID', sequence: 125 },
  ],
  units: 'metric',
};

describe('mapSemaToMeasurements (parser SEMA real)', () => {
  it('mapea el payload de /api/v1/sensors a 3 medidas', () => {
    const out = mapSemaToMeasurements(SENSORS_PAYLOAD, DEVICE, now);
    const byMetric = Object.fromEntries(out.map((m) => [m.metric, m]));

    expect(out).toHaveLength(3);
    expect(Object.keys(byMetric).sort()).toEqual(['EXT.dew_point', 'EXT.temperature', 'clock.0']);
    expect(byMetric['EXT.temperature']).toMatchObject({ deviceId: DEVICE, ts: now, value: 23.4, unit: '°C' });
    expect(byMetric['EXT.dew_point']).toMatchObject({ deviceId: DEVICE, ts: now, value: 12.1, unit: '°C' });
    expect(byMetric['clock.0']).toMatchObject({ deviceId: DEVICE, ts: now, value: 1760000000 });
    expect(byMetric['clock.0'].unit).toBeUndefined();
  });

  it('devuelve [] para payloads vacíos', () => {
    expect(mapSemaToMeasurements({ measurements: [] }, DEVICE, now)).toEqual([]);
    expect(mapSemaToMeasurements({}, DEVICE, now)).toEqual([]);
    expect(mapSemaToMeasurements(null, DEVICE, now)).toEqual([]);
  });

  it('ignora entradas sin value numérico', () => {
    const out = mapSemaToMeasurements({
      measurements: [
        { sensor_id: 'A', channel_id: 'x', value: 'abc' },
        { sensor_id: 'B', channel_id: 'y', value: null },
        { sensor_id: 'C', channel_id: 'z' },
        { sensor_id: 'D', channel_id: 'w', value: 42 },
      ],
    }, DEVICE, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ metric: 'D.w', value: 42 });
  });

  it('omite entradas sin sensor_id/channel/measurement', () => {
    const out = mapSemaToMeasurements({
      measurements: [
        { sensor_id: '', channel_id: '', measurement: '', value: 1 },
        { sensor_id: '  ', channel_id: '  ', value: 2 },
        { sensor_id: 'ONLY', value: 3 },
      ],
    }, DEVICE, now);
    expect(out.map((m) => m.metric)).toEqual(['ONLY']);
  });

  it('deduplica claves repetidas quedándose con la última', () => {
    const out = mapSemaToMeasurements({
      measurements: [
        { sensor_id: 'EXT', channel_id: 'temperature', value: 10 },
        { sensor_id: 'EXT', channel_id: 'temperature', value: 20 },
      ],
    }, DEVICE, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ metric: 'EXT.temperature', value: 20 });
  });
});

describe('deviceApiPrefix', () => {
  it('antepone /api/v1 salvo que ya esté presente', () => {
    expect(deviceApiPrefix('http://192.168.1.50')).toBe('/api/v1');
    expect(deviceApiPrefix('http://192.168.1.50/')).toBe('/api/v1');
    expect(deviceApiPrefix('http://192.168.1.50/api/v1')).toBe('');
    expect(deviceApiPrefix('http://192.168.1.50/api/v1/')).toBe('');
  });
});

describe('deviceUrl (URL final que se sondea)', () => {
  // Regresión: `new URL('/status', baseUrl)` descartaba el path del baseUrl y
  // con `http://ip/api/v1` sondeaba `http://ip/status` (404 o /status de SEMA,
  // que solo devuelve identidad).
  it('resuelve /api/v1/… con baseUrl con y sin /api/v1', () => {
    for (const base of ['http://192.168.1.50', 'http://192.168.1.50/', 'http://192.168.1.50/api/v1', 'http://192.168.1.50/api/v1/']) {
      expect(deviceUrl(base, `${deviceApiPrefix(base)}/status`).pathname).toBe('/api/v1/status');
      expect(deviceUrl(base, `${deviceApiPrefix(base)}/sensors`).pathname).toBe('/api/v1/sensors');
      expect(deviceUrl(base, `${deviceApiPrefix(base)}/actuators`).pathname).toBe('/api/v1/actuators');
    }
  });

  it('conserva un path de proxy en el baseUrl', () => {
    expect(deviceUrl('http://192.168.1.50/greenhouse', '/api/v1/status').pathname).toBe('/greenhouse/api/v1/status');
  });
});

describe('cliente IoT contra dispositivo simulado', () => {
  it('pide /api/v1/sensors con baseUrl con y sin /api/v1', async () => {
    const hits: string[] = [];
    const server = createServer((req, res) => {
      hits.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ measurements: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      for (const base of [`http://127.0.0.1:${port}`, `http://127.0.0.1:${port}/api/v1`, `http://127.0.0.1:${port}/api/v1/`]) {
        const client = createIotDeviceClient({ baseUrl: base, allowlist: ['127.0.0.1'] });
        await client.fetchJson(`${deviceApiPrefix(base)}/sensors`);
      }
    } finally {
      server.close();
    }
    expect(hits).toEqual(['/api/v1/sensors', '/api/v1/sensors', '/api/v1/sensors']);
  });
});
