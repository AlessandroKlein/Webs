import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import {
  createIotDeviceClient,
  createIotPool,
  createPrismaIotDeviceRepository,
  IoTStore,
  registerIotDeviceRoutes,
  startCollector,
  type IotDeviceRecord,
  type Measurement,
} from '@webs/iot';
import { decrypt, encrypt } from '@webs/core';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function obj(v: unknown): Record<string, unknown> {
  return (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
}

function alarmCount(alarms: unknown): number | null {
  if (Array.isArray(alarms)) return alarms.length;
  return asNumber(alarms);
}

/**
 * Mapeo tolerante del payload `GET /status` → `Measurement[]` (SEMA v1.103.0).
 * Cubre: temperatura EXT/INT, humedad, energía y alarmas; también sensores anidados.
 */
function mapSemaToMeasurements(payload: unknown, deviceId: string, now: Date): Measurement[] {
  const out: Measurement[] = [];
  const s = obj(payload);
  const push = (metric: string, v: unknown, unit?: string) => {
    const n = asNumber(v);
    if (n !== null) out.push({ ts: now, deviceId, metric, value: n, unit });
  };

  push('temperature_ext', s.temperature_ext ?? s.temperatureExternal ?? s.temperature_external ?? s.temp_ext ?? s.temperatura_ext ?? s.outdoor_temperature ?? s.temp_outdoor, '°C');
  push('temperature_int', s.temperature_int ?? s.temperatureInternal ?? s.temperature_internal ?? s.temp_int ?? s.temperatura_int ?? s.indoor_temperature ?? s.temp_indoor, '°C');
  push('humidity', s.humidity ?? s.humedad ?? s.rh ?? s.relative_humidity, '%');
  push('energy', s.energy ?? s.energia ?? s.energy_wh ?? s.energy_kwh ?? s.energyWh ?? s.power ?? s.potencia, 'Wh');
  push('alarms', alarmCount(s.alarms ?? s.alarmas));

  const sensors = s.sensors ?? s.sensores;
  if (Array.isArray(sensors)) {
    for (const sensorRaw of sensors) {
      const x = obj(sensorRaw);
      const type = String(x.type ?? x.tipo ?? x.kind ?? '').toLowerCase();
      const val = x.value ?? x.valor ?? x.reading ?? x.measurement;
      const unit = typeof x.unit === 'string' ? x.unit : typeof x.unidad === 'string' ? x.unidad : undefined;
      if (type.includes('temp') || type.includes('temperatura')) {
        if (type.includes('ext') || type.includes('out') || type.includes('exter')) push('temperature_ext', val, unit ?? '°C');
        else if (type.includes('int') || type.includes('in') || type.includes('inter')) push('temperature_int', val, unit ?? '°C');
        else push('temperature', val, unit ?? '°C');
      } else if (type.includes('hum') || type.includes('humedad')) {
        push('humidity', val, unit ?? '%');
      }
    }
  }
  return out;
}

type Rep = { code: (n: number) => Rep; send: (p: unknown) => unknown };
type Req = { params?: Record<string, string>; body?: Record<string, unknown> };

function stripToken(device: IotDeviceRecord): Omit<IotDeviceRecord, 'tokenCipher'> {
  const { tokenCipher, ...rest } = device;
  void tokenCipher;
  return rest;
}

export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const fastifyConfig = (fastify as unknown as { config?: { IOT_DATABASE_URL?: string } }).config;
    const allowlist = Array.isArray(config.ssrfAllowlist) ? (config.ssrfAllowlist as string[]) : [];

    const pool = createIotPool(fastifyConfig?.IOT_DATABASE_URL);
    const store: IoTStore = pool
      ? new IoTStore(pool)
      : ({ writeBatch: async () => {}, querySeries: async () => [], downsampleAndPurge: async () => {} } as unknown as IoTStore);

    const repo = createPrismaIotDeviceRepository(db as unknown as Parameters<typeof createPrismaIotDeviceRepository>[0]);

    // Rutas base compartidas de @webs/iot (CRUD de dispositivos + test + series).
    registerIotDeviceRoutes(fastify as unknown as Parameters<typeof registerIotDeviceRoutes>[0], {
      repo,
      store,
      encrypt,
      decrypt,
      kinds: ['sema'],
    });

    const authenticate = (fastify as unknown as { authenticate?: unknown }).authenticate;
    const authorize = (fastify as unknown as { authorize?: (p: string) => unknown }).authorize;
    const requireTenant = (fastify as unknown as { requireTenant?: unknown }).requireTenant;
    const resolveTenant = (fastify as unknown as { resolveTenant?: (r: unknown) => Promise<{ organizationId?: string | null }> }).resolveTenant;
    const resolveScope = (fastify as unknown as { resolveScope?: (t: unknown) => Promise<Record<string, unknown>> }).resolveScope;

    const read = { preHandler: [authenticate, authorize?.('iot.read'), requireTenant].filter(Boolean) };

    const scopeOf = async (req: unknown): Promise<Record<string, unknown>> => {
      if (resolveTenant && resolveScope) return resolveScope(await resolveTenant(req));
      return {};
    };
    const getDevice = async (req: unknown, id: string): Promise<IotDeviceRecord | null> => {
      const scope = await scopeOf(req);
      return repo.findById(id, scope);
    };
    // SEMA v1 autentica con X-API-Key (la key es opcional: la lectura es pública).
    const clientOf = (device: IotDeviceRecord) => {
      let token: string | undefined;
      if (device.tokenCipher) {
        try {
          token = decrypt(device.tokenCipher);
        } catch (err) {
          console.warn(`[sema] token corrupto en device ${device.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return createIotDeviceClient({ baseUrl: device.baseUrl, token, authMode: 'x-api-key', allowlist });
    };

    // GET /devices/:id — detalle (sin token).
    fastify.get('/devices/:id', read, async (request: unknown, reply: unknown) => {
      const id = (request as Req).params?.id ?? '';
      const device = await getDevice(request, id);
      if (!device) return (reply as Rep).code(404).send({ error: 'Dispositivo no encontrado' });
      return stripToken(device);
    });

    // GET /devices/:id/status — estado en vivo (poll bajo demanda).
    fastify.get('/devices/:id/status', read, async (request: unknown, reply: unknown) => {
      const id = (request as Req).params?.id ?? '';
      const device = await getDevice(request, id);
      if (!device) return (reply as Rep).code(404).send({ error: 'Dispositivo no encontrado' });
      try {
        const status = await clientOf(device).fetchJson('/status');
        return { device: stripToken(device), status };
      } catch (err) {
        return (reply as Rep).code(502).send({ error: err instanceof Error ? err.message : 'Error de conexión con el dispositivo' });
      }
    });

    // --- Collectors: sondeo periódico de los dispositivos habilitados. ---
    const collectors = new Map<string, ReturnType<typeof startCollector>>();

    async function reconcile(): Promise<void> {
      const devices = (await db.iotDevice.findMany({ where: { kind: 'sema', enabled: true } })) as IotDeviceRecord[];
      const active = new Set(devices.map((d) => d.id));
      for (const [id, col] of collectors) {
        if (!active.has(id)) {
          col.stop();
          collectors.delete(id);
        }
      }
      for (const d of devices) {
        if (collectors.has(d.id)) continue;
        const col = startCollector({
          deviceId: d.id,
          client: clientOf(d),
          store,
          measurementsPath: '/status',
          intervalMs: d.pollIntervalMs,
          parse: mapSemaToMeasurements,
          onError: (err) => console.warn(`[sema] poll ${d.id}: ${err instanceof Error ? err.message : String(err)}`),
          onSuccess: () => {
            void db.iotDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
          },
        });
        collectors.set(d.id, col);
      }
    }

    await reconcile();
    const reconcileTimer = setInterval(() => void reconcile(), 60_000);
    void reconcileTimer;
  },
});
