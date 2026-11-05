-- ============================================================================
-- webs_iot — job de retención y downsampling (idempotente).
--
-- Se ejecuta periódicamente (sidecar iot-downsample, cada 6 horas) contra
-- webs_iot. Reduce la cardinalidad de la serie temporal en 3 niveles:
--   raw (7 días)  → horario (90 días) → diario (2 años).
--
-- Retención (ADR-0027):
--   measurements        → raw, purga > 7 días.
--   measurements_hourly → agregación 1h, purga > 90 días.
--   measurements_daily  → agregación 1d, purga > 2 años.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Asegurar particiones mensuales del mes actual y el siguiente (idempotente).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  m_start timestamptz;
  m_end   timestamptz;
  p_name  text;
BEGIN
  FOR i IN 0..1 LOOP
    m_start := date_trunc('month', now()) + (i || ' month')::interval;
    m_end   := date_trunc('month', now()) + ((i + 1) || ' month')::interval;
    p_name  := 'measurements_' || to_char(m_start, 'YYYYMM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF measurements FOR VALUES FROM (%L) TO (%L)',
      p_name, m_start, m_end
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. raw → horario (agrega la ventana raw; ON CONFLICT actualiza el bucket).
--    Ventana de 8 días: 1 día de margen sobre la retención raw de 7 días para
--    no perder datos en el borde entre corridas.
-- ---------------------------------------------------------------------------
INSERT INTO measurements_hourly (ts, device_id, metric, avg, min, max, count, unit)
SELECT
  date_trunc('hour', ts) AS ts,
  device_id,
  metric,
  avg(value)             AS avg,
  min(value)             AS min,
  max(value)             AS max,
  count(*)               AS count,
  max(unit)              AS unit
FROM measurements
WHERE ts >= date_trunc('hour', now()) - interval '8 days'
GROUP BY date_trunc('hour', ts), device_id, metric
ON CONFLICT (device_id, metric, ts) DO UPDATE
  SET avg   = EXCLUDED.avg,
      min   = EXCLUDED.min,
      max   = EXCLUDED.max,
      count = EXCLUDED.count,
      unit  = EXCLUDED.unit;

-- ---------------------------------------------------------------------------
-- 3. horario → diario (promedio ponderado por count).
-- ---------------------------------------------------------------------------
INSERT INTO measurements_daily (ts, device_id, metric, avg, min, max, count, unit)
SELECT
  date_trunc('day', ts)                         AS ts,
  device_id,
  metric,
  sum(avg * count) / NULLIF(sum(count), 0)      AS avg,
  min(min)                                      AS min,
  max(max)                                      AS max,
  sum(count)                                    AS count,
  max(unit)                                     AS unit
FROM measurements_hourly
WHERE ts >= date_trunc('day', now()) - interval '90 days'
GROUP BY date_trunc('day', ts), device_id, metric
ON CONFLICT (device_id, metric, ts) DO UPDATE
  SET avg   = EXCLUDED.avg,
      min   = EXCLUDED.min,
      max   = EXCLUDED.max,
      count = EXCLUDED.count,
      unit  = EXCLUDED.unit;

-- ---------------------------------------------------------------------------
-- 4. Purga por retención.
-- ---------------------------------------------------------------------------
DELETE FROM measurements        WHERE ts < now() - interval '7 days';
DELETE FROM measurements_hourly WHERE ts < now() - interval '90 days';
DELETE FROM measurements_daily  WHERE ts < now() - interval '2 years';
