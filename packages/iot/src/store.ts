import pg from 'pg';

import type { Aggregation, Measurement, QuerySeriesOptions, SeriesBucket, SeriesPoint } from './types';

const { Pool } = pg;

export type IotPool = pg.Pool;

/** Retención por defecto (coincide con docker/iot/init/001-webs-iot.sql). */
export interface RetentionPolicy {
  rawDays: number;
  hourlyDays: number;
  dailyDays: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { rawDays: 7, hourlyDays: 90, dailyDays: 730 };

function rangeBucket(from: Date | undefined, to: Date | undefined): SeriesBucket {
  const end = to?.getTime() ?? Date.now();
  const start = from?.getTime() ?? end - 7 * 24 * 3600_000;
  const days = (end - start) / 86_400_000;
  if (days <= 7) return 'raw';
  if (days <= 90) return 'hour';
  return 'day';
}

/** Columna agregada de las tablas resumidas según la agregación pedida. */
function aggColumn(agg: Aggregation): string {
  switch (agg) {
    case 'min':
      return 'min';
    case 'max':
      return 'max';
    case 'count':
      return 'count';
    case 'sum':
      return '(avg * count)';
    default:
      return 'avg';
  }
}

interface Row {
  ts: Date;
  value: number | null;
  min?: number | null;
  max?: number | null;
  count?: number | null;
  unit?: string | null;
}

function mapRow(row: Row): SeriesPoint {
  return {
    ts: row.ts,
    value: row.value,
    min: row.min ?? null,
    max: row.max ?? null,
    count: row.count ?? null,
    unit: row.unit ?? null,
  };
}

/** Crea un pool `pg` contra la base `webs_iot` (serie temporal). Null si no hay URL. */
export function createIotPool(databaseUrl?: string): IotPool | null {
  if (!databaseUrl) return null;
  return new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Almacén de serie temporal sobre la base `webs_iot` (particionada por tiempo).
 * Provee escritura por lotes, consulta agregada y el job de retención/downsampling
 * que replica `docker/iot/jobs/iot-downsample.sql`.
 */
export class IoTStore {
  constructor(private readonly pool: IotPool) {}

  async writeBatch(measurements: Measurement[]): Promise<void> {
    if (measurements.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of measurements) {
        await client.query(
          'INSERT INTO measurements (ts, device_id, metric, value, unit) VALUES ($1, $2, $3, $4, $5)',
          [m.ts, m.deviceId, m.metric, m.value, m.unit ?? null],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async querySeries(opts: QuerySeriesOptions): Promise<SeriesPoint[]> {
    const bucket = opts.bucket ?? rangeBucket(opts.from, opts.to);
    const limit = Math.min(opts.limit ?? 1000, 10_000);

    if (bucket === 'raw') {
      const where = ['device_id = $1', 'metric = $2'];
      const params: unknown[] = [opts.deviceId, opts.metric];
      if (opts.from) {
        params.push(opts.from);
        where.push(`ts >= $${params.length}`);
      }
      if (opts.to) {
        params.push(opts.to);
        where.push(`ts < $${params.length}`);
      }
      params.push(limit);
      const { rows } = await this.pool.query(
        `SELECT ts, value, unit FROM measurements WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT $${params.length}`,
        params,
      );
      return (rows as Row[]).map((r) => mapRow({ ...r, value: r.value }));
    }

    const table = bucket === 'hour' ? 'measurements_hourly' : 'measurements_daily';
    const col = aggColumn(opts.agg ?? 'avg');
    const where = ['device_id = $1', 'metric = $2'];
    const params: unknown[] = [opts.deviceId, opts.metric];
    if (opts.from) {
      params.push(opts.from);
      where.push(`ts >= $${params.length}`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`ts < $${params.length}`);
    }
    params.push(limit);
    const { rows } = await this.pool.query(
      `SELECT ts, ${col} AS value, min, max, count, unit FROM ${table} WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT $${params.length}`,
      params,
    );
    return (rows as Row[]).map(mapRow);
  }

  /** Downsampling raw→horario y horario→diario (window fija), luego purga por retención. */
  async downsampleAndPurge(policy: RetentionPolicy = DEFAULT_RETENTION): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // raw → hourly (últimos 8 días; ON CONFLICT actualiza el bucket).
      await client.query(
        `INSERT INTO measurements_hourly (ts, device_id, metric, avg, min, max, count, unit)
         SELECT date_trunc('hour', ts), device_id, metric, avg(value), min(value), max(value), count(*), max(unit)
         FROM measurements
         WHERE ts >= now() - interval '8 days'
         GROUP BY 1, 2, 3
         ON CONFLICT (device_id, metric, ts) DO UPDATE
           SET avg = EXCLUDED.avg, min = EXCLUDED.min, max = EXCLUDED.max,
               count = EXCLUDED.count, unit = EXCLUDED.unit`,
      );
      // hourly → daily (avg ponderado por count).
      await client.query(
        `INSERT INTO measurements_daily (ts, device_id, metric, avg, min, max, count, unit)
         SELECT date_trunc('day', ts), device_id, metric,
                sum(avg * count) / NULLIF(sum(count), 0),
                min(min), max(max), sum(count), max(unit)
         FROM measurements_hourly
         WHERE ts >= now() - interval '90 days'
         GROUP BY 1, 2, 3
         ON CONFLICT (device_id, metric, ts) DO UPDATE
           SET avg = EXCLUDED.avg, min = EXCLUDED.min, max = EXCLUDED.max,
               count = EXCLUDED.count, unit = EXCLUDED.unit`,
      );
      // Purga por retención.
      await client.query(`DELETE FROM measurements WHERE ts < now() - $1::interval`, [`${policy.rawDays} days`]);
      await client.query(`DELETE FROM measurements_hourly WHERE ts < now() - $1::interval`, [`${policy.hourlyDays} days`]);
      await client.query(`DELETE FROM measurements_daily WHERE ts < now() - $1::interval`, [`${policy.dailyDays} days`]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
