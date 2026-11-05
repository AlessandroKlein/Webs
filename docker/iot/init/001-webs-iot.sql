-- ============================================================================
-- webs_iot — base de datos separada para la telemetría IoT (ADR-0027).
--
-- Se ejecuta UNA vez, al inicializar por primera vez el volumen de PostgreSQL
-- (montado en /docker-entrypoint-initdb.d/). Todo es idempotente por defensa
-- (IF NOT EXISTS / \gexec) para poder re-ejecutarse sin romper nada.
--
-- Modelo (ThingSpeak local):
--   measurements        → raw, partición mensual por ts, retención 7 días.
--   measurements_hourly → agregación horaria (avg/min/max/count), 90 días.
--   measurements_daily  → agregación diaria (avg/min/max/count), 2 años.
-- ============================================================================

-- 1. Base de datos separada (idempotente: solo se crea si no existe).
SELECT 'CREATE DATABASE webs_iot'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'webs_iot')\gexec

-- 2. Trabajar sobre webs_iot.
\connect webs_iot

-- 3. Tabla raw, particionada mensualmente por ts.
CREATE TABLE IF NOT EXISTS measurements (
  ts        timestamptz      NOT NULL DEFAULT now(),
  device_id text             NOT NULL,   -- IotDevice.id (UUID)
  metric    text             NOT NULL,   -- 'temperature', 'humidity', ...
  value     double precision NOT NULL,
  unit      text             NOT NULL DEFAULT ''
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS measurements_device_metric_ts
  ON measurements (device_id, metric, ts DESC);

-- Partición DEFAULT: captura cualquier fecha sin partición explícita (red de
-- seguridad para v1; el job de downsampling crea las particiones mensuales).
CREATE TABLE IF NOT EXISTS measurements_default PARTITION OF measurements DEFAULT;

-- Particiones mensuales del mes actual y el siguiente (idempotentes).
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

-- 4. Agregación horaria (retención 90 días).
CREATE TABLE IF NOT EXISTS measurements_hourly (
  ts        timestamptz      NOT NULL,
  device_id text             NOT NULL,
  metric    text             NOT NULL,
  avg       double precision,
  min       double precision,
  max       double precision,
  count     bigint,
  unit      text             NOT NULL DEFAULT '',
  PRIMARY KEY (device_id, metric, ts)
);
CREATE INDEX IF NOT EXISTS measurements_hourly_ts
  ON measurements_hourly (ts DESC);

-- 5. Agregación diaria (retención 2 años).
CREATE TABLE IF NOT EXISTS measurements_daily (
  ts        timestamptz      NOT NULL,
  device_id text             NOT NULL,
  metric    text             NOT NULL,
  avg       double precision,
  min       double precision,
  max       double precision,
  count     bigint,
  unit      text             NOT NULL DEFAULT '',
  PRIMARY KEY (device_id, metric, ts)
);
CREATE INDEX IF NOT EXISTS measurements_daily_ts
  ON measurements_daily (ts DESC);
