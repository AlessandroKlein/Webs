/** Punto de una serie temporal (telemetría de dispositivo). */
export interface Measurement {
  /** Marca de tiempo de la muestra. */
  ts: Date;
  /** `IotDevice.id` (UUID) dueño de la muestra. */
  deviceId: string;
  /** Métrica (ej. `temperature`, `humidity`, `soil_moisture`, `energy`). */
  metric: string;
  /** Valor numérico. */
  value: number;
  /** Unidad opcional (ej. `°C`, `%`, `kWh`). */
  unit?: string;
}

/** Tipo de dispositivo IoT soportado (ADR-0027). */
export type IotDeviceKind = 'invernadero' | 'sema';

/** Modo de autenticación HTTP del dispositivo (ADR-0028). */
export type IotAuthMode = 'bearer' | 'x-auth-token' | 'x-api-key';

/** Agregación para la consulta de series. */
export type Aggregation = 'avg' | 'min' | 'max' | 'count' | 'sum';

/** Nivel de bucketing para la consulta de series. */
export type SeriesBucket = 'raw' | 'hour' | 'day';

export interface QuerySeriesOptions {
  deviceId: string;
  metric: string;
  /** Cota inferior (inclusive). Opcional. */
  from?: Date;
  /** Cota superior (exclusive). Opcional. */
  to?: Date;
  /** Agregación a devolver como `value`. Default `avg` (irrelevante en `raw`). */
  agg?: Aggregation;
  /** Nivel de bucketing. Si se omite, se auto-selecciona por el rango temporal. */
  bucket?: SeriesBucket;
  /** Máximo de puntos. Default 1000. */
  limit?: number;
}

export interface SeriesPoint {
  ts: Date;
  value: number | null;
  min?: number | null;
  max?: number | null;
  count?: number | null;
  unit?: string | null;
}

/** Fila de `IotDevice` (Prisma). `tokenCipher` es el token CIFRADO en reposo. */
export interface IotDeviceRecord {
  id: string;
  organizationId: string;
  kind: IotDeviceKind;
  name: string;
  baseUrl: string;
  tokenCipher: string | null;
  authMode: IotAuthMode;
  pollIntervalMs: number;
  enabled: boolean;
  lastSeenAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IotDeviceClientOptions {
  baseUrl: string;
  token?: string;
  /** Default `bearer`. */
  authMode?: IotAuthMode;
  /** Default 5000 ms. */
  timeoutMs?: number;
  /** Reintentos (0 = sin reintentos). Default 2. */
  maxRetries?: number;
  /** Hosts adicionales permitidos (SSRF-safe), además de los públicos. */
  allowlist?: string[];
}

/** Estado de una versión de configuración de dispositivo. */
export type IotConfigVersionStatus = 'draft' | 'applied' | 'failed';

/** Fila de `IotDeviceConfigVersion` (Prisma). `config` es opcional (el historial no lo trae). */
export interface IotConfigVersion {
  id: string;
  deviceId: string;
  version: number;
  status: IotConfigVersionStatus;
  hash: string;
  error: string | null;
  authorId: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  config?: unknown;
}
