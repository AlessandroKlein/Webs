/** Helpers del plugin sema (normalización de estado + catálogo de métricos). */

export const SEMA_BASE = '/api/v1/plugins/sema';

export interface SemaAlarm {
  message?: string;
  severity?: number;
}

/** Estado normalizado (tolerante a claves ES/EN) de la respuesta GET /status. */
export interface SemaStatus {
  /** Métricos numéricos (temperature_ext/temperature_int/humidity/energy/alarms). */
  metrics: Record<string, number>;
  /** Estado del sistema en texto (opcional). */
  system?: string;
  alarms: SemaAlarm[];
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Normaliza el payload crudo de `GET /devices/:id/status` al mismo mapeo que
 * `mapSemaToMeasurements` del backend (tolerante a claves ES/EN).
 */
export function normalizeSemaStatus(raw: unknown): SemaStatus {
  const s = (raw ?? {}) as Record<string, unknown>;
  const metrics: Record<string, number> = {};
  const alarms: SemaAlarm[] = [];

  const push = (metric: string, v: unknown) => {
    const n = asNumber(v);
    if (n !== null) metrics[metric] = n;
  };

  push(
    'temperature_ext',
    s.temperature_ext ?? s.temperatureExternal ?? s.temperature_external ?? s.temp_ext ?? s.temperatura_ext ?? s.outdoor_temperature ?? s.temp_outdoor,
  );
  push(
    'temperature_int',
    s.temperature_int ?? s.temperatureInternal ?? s.temperature_internal ?? s.temp_int ?? s.temperatura_int ?? s.indoor_temperature ?? s.temp_indoor,
  );
  push('humidity', s.humidity ?? s.humedad ?? s.rh ?? s.relative_humidity);
  push('energy', s.energy ?? s.energia ?? s.energy_wh ?? s.energy_kwh ?? s.energyWh ?? s.power ?? s.potencia);

  const alarmsRaw = s.alarms ?? s.alarmas;
  if (Array.isArray(alarmsRaw)) {
    metrics.alarms = alarmsRaw.length;
    for (const a of alarmsRaw) {
      const x = (typeof a === 'object' && a !== null ? a : {}) as Record<string, unknown>;
      alarms.push({
        message: (x.message ?? x.mensaje ?? x.description ?? x.name ?? x.title) as string | undefined,
        severity: asNumber(x.severity ?? x.severidad) ?? undefined,
      });
    }
  } else {
    const count = asNumber(alarmsRaw);
    if (count !== null) metrics.alarms = count;
  }

  const systemRaw = s.status ?? s.state ?? s.system ?? s.estado;

  return { metrics, system: typeof systemRaw === 'string' ? systemRaw : undefined, alarms };
}

export interface MetricDef {
  unit: string;
  labelKey: string;
  icon: string;
}

/** Catálogo de métricos numéricos graficables del nodo SEMA. */
export const SEMA_METRIC_DEFS: Record<string, MetricDef> = {
  temperature_ext: { unit: '°C', labelKey: 'sema.metric.temperatureExt', icon: 'bi-thermometer-sun' },
  temperature_int: { unit: '°C', labelKey: 'sema.metric.temperatureInt', icon: 'bi-thermometer-half' },
  humidity: { unit: '%', labelKey: 'sema.metric.humidity', icon: 'bi-droplet-half' },
  energy: { unit: 'Wh', labelKey: 'sema.metric.energy', icon: 'bi-lightning-charge' },
  alarms: { unit: '', labelKey: 'sema.metric.alarms', icon: 'bi-exclamation-triangle' },
};

/** Formatea el valor de un métrico con su unidad. */
export function formatSemaMetricValue(metric: string, value: number): string {
  const def = SEMA_METRIC_DEFS[metric] ?? { unit: '' };
  const n = Math.round(value * 100) / 100;
  return def.unit ? `${n} ${def.unit}` : String(n);
}
