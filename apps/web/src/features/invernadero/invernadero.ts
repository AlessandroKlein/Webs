/** Helpers del plugin invernadero (normalización de estado + catálogo de métricos). */

export const INVERNADERO_BASE = '/api/v1/plugins/invernadero';

export type ActuatorRole =
  | 'pump'
  | 'valve'
  | 'fan'
  | 'extractor'
  | 'heater'
  | 'humidifier'
  | 'light'
  | 'roof'
  | 'window'
  | 'shade'
  | 'alarm';

export const ACTUATOR_ROLES: ActuatorRole[] = [
  'pump',
  'valve',
  'fan',
  'extractor',
  'heater',
  'humidifier',
  'light',
  'roof',
  'window',
  'shade',
  'alarm',
];

export interface GreenhouseAlarm {
  severity: number;
  message?: string;
}

/** Estado normalizado (tolerante a claves ES/EN) de la respuesta GET /status. */
export interface GreenhouseStatus {
  /** Métricos numéricos (temperature/humidity/soil_moisture[_zona]/tank_level/light). */
  metrics: Record<string, number>;
  /** Estados booleanos on/off (pump/fan). */
  booleans: Record<string, boolean>;
  alarms: GreenhouseAlarm[];
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    return ['on', 'true', '1', 'activo', 'encendido', 'open', 'abierto', 'si', 'sí'].includes(
      v.trim().toLowerCase(),
    );
  }
  return false;
}

/** Lee un campo que puede ser escalar u objeto (p. ej. {estado} / {state}). */
function scalar(v: unknown, keys: string[]): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const k of keys) if (o[k] !== undefined) return o[k];
    return undefined;
  }
  return v;
}

/**
 * Normaliza el payload crudo de `GET /devices/:id/status` al mismo mapeo que
 * `mapStatusToMeasurements` del backend (tolerante a claves ES/EN).
 */
export function normalizeStatus(raw: unknown): GreenhouseStatus {
  const s = (raw ?? {}) as Record<string, unknown>;
  const metrics: Record<string, number> = {};
  const booleans: Record<string, boolean> = {};
  const alarms: GreenhouseAlarm[] = [];

  const temp = num(scalar(s.temperatura ?? s.temperature ?? s.air_temperature, ['value', 'valor']));
  if (temp !== null) metrics.temperature = temp;

  const hum = num(scalar(s.humedad ?? s.humidity ?? s.air_humidity, ['value', 'valor']));
  if (hum !== null) metrics.humidity = hum;

  // Humedad del suelo: escalar o array por zona.
  const soilRaw = s.suelo ?? s.soil ?? s.soil_moisture ?? s.humedad_suelo ?? s.humedadSuelo;
  if (Array.isArray(soilRaw)) {
    for (const z of soilRaw) {
      const zone = z?.zone ?? z?.zona ?? z?.id ?? z?.name;
      const value = num(z?.value) ?? num(z?.humedad) ?? num(z?.humidity) ?? num(z?.moisture);
      if (zone !== undefined && zone !== null && value !== null) {
        metrics[`soil_moisture_${String(zone)}`] = value;
      }
    }
  } else {
    const soilVal = num(soilRaw);
    if (soilVal !== null) metrics.soil_moisture = soilVal;
  }

  const tankVal = num(scalar(s.tanque ?? s.tank ?? s.nivel_tanque ?? s.tank_level, ['nivel', 'level']));
  if (tankVal !== null) metrics.tank_level = tankVal;

  const lightVal = num(scalar(s.luz ?? s.light ?? s.light_level, ['value', 'valor']));
  if (lightVal !== null) metrics.light = lightVal;

  const pumpVal = scalar(s.bomba ?? s.pump, ['estado', 'state', 'bomba_state', 'pump_state']);
  if (pumpVal !== undefined && pumpVal !== null) booleans.pump = toBool(pumpVal);

  const fanVal = scalar(s.ventilador ?? s.fan, ['estado', 'state', 'ventilador_state', 'fan_state']);
  if (fanVal !== undefined && fanVal !== null) booleans.fan = toBool(fanVal);

  const alarmsRaw = s.alarms ?? s.alarmas;
  if (Array.isArray(alarmsRaw)) {
    for (const a of alarmsRaw) {
      const sev = num(a?.severidad) ?? num(a?.severity);
      if (sev !== null && sev >= 2) {
        alarms.push({
          severity: sev,
          message:
            a?.message ?? a?.mensaje ?? a?.description ?? a?.name ?? a?.title ?? undefined,
        });
      }
    }
  }

  return { metrics, booleans, alarms };
}

export interface MetricDef {
  unit: string;
  labelKey: string;
  /** Clave de color/acceso usada para ordenar la tarjeta. */
  icon: string;
}

/** Catálogo de métricos numéricos graficables (claves estables). */
export const METRIC_DEFS: Record<string, MetricDef> = {
  temperature: { unit: '°C', labelKey: 'iot.metric.temperature', icon: 'bi-thermometer-half' },
  humidity: { unit: '%', labelKey: 'iot.metric.humidity', icon: 'bi-droplet-half' },
  soil_moisture: { unit: '%', labelKey: 'iot.metric.soilMoisture', icon: 'bi-moisture' },
  tank_level: { unit: '%', labelKey: 'iot.metric.tankLevel', icon: 'bi-water' },
  light: { unit: 'lux', labelKey: 'iot.metric.light', icon: 'bi-brightness-high' },
  alarms: { unit: '', labelKey: 'iot.metric.alarms', icon: 'bi-exclamation-triangle' },
};

/** Formatea el valor de un métrico con su unidad. */
export function formatMetricValue(metric: string, value: number): string {
  const def = METRIC_DEFS[metric] ?? { unit: '' };
  const n = Math.round(value * 100) / 100;
  return def.unit ? `${n} ${def.unit}` : String(n);
}
