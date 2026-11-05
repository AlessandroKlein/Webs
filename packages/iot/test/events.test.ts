import { describe, expect, it } from 'vitest';

import { normalizeEvents, serializeTsRaw } from '../src/events';

const DEVICE = 'device-1';

describe('normalizeEvents (SEMA)', () => {
  it('mapea /events → filas con type/source/rule/severity/value', () => {
    const payload = {
      events: [
        { ts: 123456, type: 'alarm', source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 },
        { ts: 123457, type: 'sensor', source: 'clock', rule: 'heartbeat', severity: 'INFO', value: 1 },
      ],
    };
    const out = normalizeEvents('event', payload, DEVICE);
    expect(out).toHaveLength(2);
    // type:'alarm' → kind canónico 'alarm' y el type se omite del fingerprint.
    expect(out[0]).toMatchObject({
      deviceId: DEVICE, kind: 'alarm', tsRaw: 123456, type: 'alarm', source: 'EXT',
      rule: 'high_temp', severity: 'WARNING', value: 4150, message: null,
    });
    expect(out[0]!.fingerprint).toBe('123456||EXT|high_temp|WARNING|4150|');
    // type:'sensor' → kind 'event' y el type participa del fingerprint.
    expect(out[1]).toMatchObject({ kind: 'event', tsRaw: 123457, type: 'sensor' });
    expect(out[1]!.fingerprint).toBe('123457|sensor|clock|heartbeat|INFO|1|');
  });

  it('mapea /alarms → sin type', () => {
    const payload = { alarms: [{ ts: 123456, source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 }] };
    const out = normalizeEvents('alarm', payload, DEVICE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'alarm', tsRaw: 123456, type: null, source: 'EXT', severity: 'WARNING' });
    expect(out[0]!.fingerprint).toBe('123456||EXT|high_temp|WARNING|4150|');
  });

  it('SEMA: la misma alarma por /events y /alarms converge (kind y fingerprint)', () => {
    const viaEvents = normalizeEvents('event', {
      events: [{ ts: 123456, type: 'alarm', source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 }],
    }, DEVICE)[0]!;
    const viaAlarms = normalizeEvents('alarm', {
      alarms: [{ ts: 123456, source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 }],
    }, DEVICE)[0]!;
    expect(viaEvents.kind).toBe('alarm');
    expect(viaAlarms.kind).toBe('alarm');
    expect(viaEvents.fingerprint).toBe(viaAlarms.fingerprint);
  });

  it('SEMA: type distinto de alarm → kind event y type participa del fingerprint', () => {
    const sensor = normalizeEvents('event', {
      events: [{ ts: 123457, type: 'sensor', source: 'clock', rule: 'heartbeat', severity: 'INFO', value: 1 }],
    }, DEVICE)[0]!;
    expect(sensor.kind).toBe('event');
    expect(sensor.fingerprint).toBe('123457|sensor|clock|heartbeat|INFO|1|');
  });

  it('SEMA: dos alarmas con el mismo ts dan fingerprints distintos', () => {
    const out = normalizeEvents('alarm', {
      alarms: [
        { ts: 123456, source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 },
        { ts: 123456, source: 'BAT', rule: 'low_battery', severity: 'ERROR', value: 3 },
      ],
    }, DEVICE);
    expect(out).toHaveLength(2);
    expect(out[0]!.fingerprint).not.toBe(out[1]!.fingerprint);
  });

  it('devuelve [] para payload vacío o sin ts', () => {
    expect(normalizeEvents('event', {}, DEVICE)).toEqual([]);
    expect(normalizeEvents('event', { events: [] }, DEVICE)).toEqual([]);
    expect(normalizeEvents('alarm', null, DEVICE)).toEqual([]);
    expect(normalizeEvents('event', { events: [{ no_ts: true }] }, DEVICE)).toEqual([]);
  });
});

describe('normalizeEvents (Invernadero)', () => {
  it('mapea array plano [{t, sev, msg}] → severity string, kind canónico por sev', () => {
    const payload = [
      { t: 1760000000, sev: 2, msg: 'Temperatura alta en zona 1' },
      { t: 1760000001, sev: 1, msg: 'Nivel de tanque normal' },
    ];
    const out = normalizeEvents('event', payload, DEVICE);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      kind: 'alarm', tsRaw: 1760000000, severity: '2', message: 'Temperatura alta en zona 1',
      type: null, source: null, rule: null, value: null,
    });
    expect(out[0]!.fingerprint).toBe('1760000000||||2||Temperatura alta en zona 1');
    expect(out[1]).toMatchObject({ kind: 'event', severity: '1' });
  });

  it('Invernadero: kind canónico por sev (>=2 alarma) y mismo fingerprint por ambas rutas', () => {
    const ev = normalizeEvents('event', [{ t: 1760000000, sev: 2, msg: 'x' }], DEVICE)[0]!;
    const al = normalizeEvents('alarm', [{ t: 1760000000, sev: 2, msg: 'x' }], DEVICE)[0]!;
    expect(ev.kind).toBe('alarm');
    expect(al.kind).toBe('alarm');
    expect(ev.fingerprint).toBe(al.fingerprint);
    expect(normalizeEvents('event', [{ t: 1760000000, sev: 1, msg: 'y' }], DEVICE)[0]!.kind).toBe('event');
  });

  it('no colisiona: mismo t+sev con distinto msg da fingerprints distintos', () => {
    const payload = [
      { t: 1760000000, sev: 2, msg: 'a' },
      { t: 1760000000, sev: 2, msg: 'b' },
    ];
    const out = normalizeEvents('alarm', payload, DEVICE);
    expect(out.map((r) => r.fingerprint)).toEqual(['1760000000||||2||a', '1760000000||||2||b']);
    expect(new Set(out.map((r) => r.fingerprint)).size).toBe(2);
  });

  it('devuelve [] para array vacío o items sin t', () => {
    expect(normalizeEvents('event', [], DEVICE)).toEqual([]);
    expect(normalizeEvents('alarm', [{ sev: 2, msg: 'x' }], DEVICE)).toEqual([]);
  });
});

describe('tsRaw uint32 + serialización', () => {
  it('4_000_000_000 se conserva como number (sin truncar a Int32) y listo para BigInt', () => {
    const out = normalizeEvents('event', {
      events: [{ ts: 4000000000, type: 'sensor', source: 'clock', rule: 'hb', severity: 'INFO', value: 1 }],
    }, DEVICE)[0]!;
    expect(out.tsRaw).toBe(4000000000);
    expect(BigInt(out.tsRaw)).toBe(4000000000n);
    expect(out.fingerprint).toBe('4000000000|sensor|clock|hb|INFO|1|');
  });

  it('serializeTsRaw: BigInt → number para JSON (no crashea)', () => {
    expect(serializeTsRaw(4000000000n)).toBe(4000000000);
    expect(JSON.stringify({ tsRaw: serializeTsRaw(4000000000n) })).toBe('{"tsRaw":4000000000}');
    expect(serializeTsRaw(123)).toBe(123);
  });
});
