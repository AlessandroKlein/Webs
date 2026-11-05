import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import {
  createIotDeviceClient,
  createIotPool,
  createPrismaIotDeviceRepository,
  deviceApiPrefix,
  IoTStore,
  registerIotDeviceRoutes,
  startCollector,
  type IotAuthMode,
  type IotDeviceRecord,
  type Measurement,
} from '@webs/iot';
import { decrypt, encrypt } from '@webs/core';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/** Roles de actuadores permitidos por la API del invernadero (v3.29.0). */
const ACTUATOR_ROLES = new Set([
  'pump', 'valve', 'fan', 'extractor', 'heater', 'humidifier', 'light', 'roof', 'window', 'shade', 'alarm',
]);

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Mapeo tolerante del payload `GET /status` → `Measurement[]` (claves ES y EN).
 * Cubre: temperatura, humedad, suelo por zona, tanque, luz, bomba/ventilador y alarmas severas (≥2).
 */
function mapStatusToMeasurements(payload: unknown, deviceId: string, now: Date): Measurement[] {
  const out: Measurement[] = [];
  const s = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  const push = (metric: string, v: unknown, unit?: string) => {
    const n = asNumber(v);
    if (n !== null) out.push({ ts: now, deviceId, metric, value: n, unit });
  };
  const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;

  push('temperature', s.temperatura ?? s.temperature ?? s.air_temperature, '°C');
  push('humidity', s.humedad ?? s.humidity ?? s.air_humidity, '%');

  const soil = s.suelo ?? s.soil ?? s.soil_moisture;
  if (Array.isArray(soil)) {
    soil.forEach((zoneRaw, i) => {
      const z = obj(zoneRaw);
      push(`soil_moisture_${String(z.zone ?? z.zona ?? z.id ?? i)}`, z.value ?? z.humedad ?? z.humidity ?? z.moisture, '%');
    });
  } else {
    push('soil_moisture', soil ?? s.humedad_suelo ?? s.humedadSuelo, '%');
  }

  const tank = obj(s.tanque ?? s.tank);
  push('tank_level', tank.nivel ?? tank.level ?? s.nivel_tanque ?? s.tank_level, '%');
  push('light', s.luz ?? s.light ?? s.light_level, 'lux');

  const pump = obj(s.bomba ?? s.pump);
  push('pump', pump.estado ?? pump.state ?? s.bomba_state ?? s.pump_state);
  const fan = obj(s.ventilador ?? s.fan);
  push('fan', fan.estado ?? fan.state ?? s.ventilador_state ?? s.fan_state);

  const alarms = s.alarms ?? s.alarmas;
  if (Array.isArray(alarms)) {
    const severe = alarms.filter((a) => {
      const x = obj(a);
      return asNumber(x.severidad ?? x.severity ?? 0)! >= 2;
    }).length;
    push('alarms', severe);
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
      kinds: ['invernadero'],
    });

    const authenticate = (fastify as unknown as { authenticate?: unknown }).authenticate;
    const authorize = (fastify as unknown as { authorize?: (p: string) => unknown }).authorize;
    const requireTenant = (fastify as unknown as { requireTenant?: unknown }).requireTenant;
    const resolveTenant = (fastify as unknown as { resolveTenant?: (r: unknown) => Promise<{ organizationId?: string | null }> }).resolveTenant;
    const resolveScope = (fastify as unknown as { resolveScope?: (t: unknown) => Promise<Record<string, unknown>> }).resolveScope;

    const read = { preHandler: [authenticate, authorize?.('iot.read'), requireTenant].filter(Boolean) };
    const write = { preHandler: [authenticate, authorize?.('iot.write'), requireTenant].filter(Boolean) };

    const scopeOf = async (req: unknown): Promise<Record<string, unknown>> => {
      if (resolveTenant && resolveScope) return resolveScope(await resolveTenant(req));
      return {};
    };
    const getDevice = async (req: unknown, id: string): Promise<IotDeviceRecord | null> => {
      const scope = await scopeOf(req);
      return repo.findById(id, scope);
    };
    const clientOf = (device: IotDeviceRecord) => {
      let token: string | undefined;
      if (device.tokenCipher) {
        try {
          token = decrypt(device.tokenCipher);
        } catch (err) {
          console.warn(`[invernadero] token corrupto en device ${device.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return createIotDeviceClient({ baseUrl: device.baseUrl, token, authMode: device.authMode as IotAuthMode, allowlist });
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
        const status = await clientOf(device).fetchJson(`${deviceApiPrefix(device.baseUrl)}/status`);
        return { device: stripToken(device), status };
      } catch (err) {
        return (reply as Rep).code(502).send({ error: err instanceof Error ? err.message : 'Error de conexión con el dispositivo' });
      }
    });

    // POST /devices/:id/actuators — control (proxy al dispositivo).
    fastify.post('/devices/:id/actuators', write, async (request: unknown, reply: unknown) => {
      const id = (request as Req).params?.id ?? '';
      const body = (request as Req).body ?? {};
      const role = typeof body.role === 'string' ? body.role : '';
      const index = asNumber(body.index);
      const output = asNumber(body.output);
      if (!ACTUATOR_ROLES.has(role)) return (reply as Rep).code(400).send({ error: `role inválido (roles: ${[...ACTUATOR_ROLES].join(', ')})` });
      if (output === null || output < 0 || output > 100) return (reply as Rep).code(400).send({ error: 'output debe ser 0..100' });
      const device = await getDevice(request, id);
      if (!device) return (reply as Rep).code(404).send({ error: 'Dispositivo no encontrado' });
      try {
        const result = await clientOf(device).post(`${deviceApiPrefix(device.baseUrl)}/actuators`, { role, ...(index !== null ? { index } : {}), output });
        return { ok: true, result };
      } catch (err) {
        return (reply as Rep).code(502).send({ error: err instanceof Error ? err.message : 'Error de conexión con el dispositivo' });
      }
    });

    // --- Collectors: sondeo periódico de los dispositivos habilitados. ---
    const collectors = new Map<string, ReturnType<typeof startCollector>>();

    async function reconcile(): Promise<void> {
      const devices = (await db.iotDevice.findMany({ where: { kind: 'invernadero', enabled: true } })) as IotDeviceRecord[];
      const active = new Set(devices.map((d) => d.id));
      for (const [id, col] of collectors) {
        if (!active.has(id)) {
          col.stop();
          collectors.delete(id);
        }
      }
      for (const d of devices) {
        if (collectors.has(d.id)) continue;
        const client = clientOf(d);
        const col = startCollector({
          deviceId: d.id,
          client,
          store,
          measurementsPath: `${deviceApiPrefix(d.baseUrl)}/status`,
          intervalMs: d.pollIntervalMs,
          parse: mapStatusToMeasurements,
          onError: (err) => console.warn(`[invernadero] poll ${d.id}: ${err instanceof Error ? err.message : String(err)}`),
          onSuccess: () => {
            void db.iotDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
          },
        });
        collectors.set(d.id, col);
      }
    }

    await reconcile();
    const reconcileTimer = setInterval(() => void reconcile(), 60_000);
    // El timer queda activo mientras la app vive; al apagar el proceso se libera.
    void reconcileTimer;
  },
});
