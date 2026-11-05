import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import {
  createIotDeviceClient,
  createIotPool,
  createPrismaIotDeviceRepository,
  deviceApiPrefix,
  IoTStore,
  registerIotDeviceRoutes,
  serializeTsRaw,
  startCollector,
  startEventCollector,
  type IotDeviceRecord,
} from '@webs/iot';
import { decrypt, encrypt } from '@webs/core';
import manifestJson from '../plugin.json';
import { mapSemaToMeasurements } from './parse';

const manifest = manifestJson as unknown as PluginManifest;

type Rep = { code: (n: number) => Rep; send: (p: unknown) => unknown };
type Req = { params?: Record<string, string>; body?: Record<string, unknown>; query?: Record<string, string> };

/**
 * El loader monta este plugin en DOS prefijos (`/api/v1/plugins/sema` y
 * `/api/v1/blocks/sema`), así que `register()` corre dos veces en el mismo
 * proceso. Las rutas duplicadas no molestan (prefijos distintos), pero los
 * collectors/timers deben arrancar una sola vez: si no, cada dispositivo se
 * sondea dos veces y el primer ciclo inserta filas duplicadas.
 */
let runtimeStarted = false;

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
      kind: 'sema',
      allowlist,
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
      return repo.findById(id, scope, 'sema');
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
        const status = await clientOf(device).fetchJson(`${deviceApiPrefix(device.baseUrl)}/status`);
        return { device: stripToken(device), status };
      } catch (err) {
        return (reply as Rep).code(502).send({ error: err instanceof Error ? err.message : 'Error de conexión con el dispositivo' });
      }
    });

    // GET /devices/:id/events — histórico de eventos/alarmas ingeridos.
    fastify.get('/devices/:id/events', read, async (request: unknown, reply: unknown) => {
      const id = (request as Req).params?.id ?? '';
      const query = (request as Req).query ?? {};
      const limitRaw = Number(query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.trunc(limitRaw))) : 100;
      const kind = query.kind === 'alarm' ? 'alarm' : query.kind === 'event' ? 'event' : undefined;
      const device = await getDevice(request, id);
      if (!device) return (reply as Rep).code(404).send({ error: 'Dispositivo no encontrado' });
      const events = await db.iotDeviceEvent.findMany({
        where: { deviceId: device.id, organizationId: device.organizationId, ...(kind ? { kind } : {}) },
        orderBy: { receivedAt: 'desc' },
        take: limit,
        select: { id: true, kind: true, tsRaw: true, type: true, source: true, rule: true, severity: true, value: true, message: true, receivedAt: true },
      });
      return { events: events.map((e: { tsRaw: number | bigint }) => ({ ...e, tsRaw: serializeTsRaw(e.tsRaw) })) };
    });

    if (runtimeStarted) return;
    runtimeStarted = true;

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
          measurementsPath: `${deviceApiPrefix(d.baseUrl)}/sensors`,
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

    // --- Collector de eventos/alarmas (independiente del de medidas). ---
    const eventCollectors = new Map<string, ReturnType<typeof startEventCollector>>();

    async function reconcileEvents(): Promise<void> {
      const devices = (await db.iotDevice.findMany({ where: { kind: 'sema', enabled: true } })) as IotDeviceRecord[];
      const active = new Set(devices.map((d) => d.id));
      for (const [id, col] of eventCollectors) {
        if (!active.has(id)) {
          col.stop();
          eventCollectors.delete(id);
        }
      }
      for (const d of devices) {
        if (eventCollectors.has(d.id)) continue;
        const col = startEventCollector({
          deviceId: d.id,
          client: clientOf(d),
          prefix: deviceApiPrefix(d.baseUrl),
          intervalMs: 60_000,
          writeEvents: (rows) =>
            db.iotDeviceEvent.createMany({
              data: rows.map((r) => ({ ...r, organizationId: d.organizationId, tsRaw: BigInt(r.tsRaw) })),
            }),
          readRecentFingerprints: async (limit) => {
            const rows = await db.iotDeviceEvent.findMany({
              where: { deviceId: d.id },
              orderBy: { receivedAt: 'desc' },
              take: limit,
              select: { fingerprint: true },
            });
            return rows.map((r: { fingerprint: string }) => r.fingerprint);
          },
          onError: (err) => console.warn(`[sema] events ${d.id}: ${err instanceof Error ? err.message : String(err)}`),
        });
        eventCollectors.set(d.id, col);
      }
    }

    await reconcileEvents();
    const eventsTimer = setInterval(() => void reconcileEvents(), 60_000);
    void eventsTimer;

    // --- Purga de eventos >90 días (una vez al día). ---
    async function purgeOldEvents(): Promise<void> {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      try {
        await db.iotDeviceEvent.deleteMany({ where: { receivedAt: { lt: cutoff } } });
      } catch (err) {
        console.warn(`[sema] purge events: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    void purgeOldEvents();
    const purgeTimer = setInterval(() => void purgeOldEvents(), 24 * 60 * 60 * 1000);
    void purgeTimer;
  },
});
