import { createHash } from 'node:crypto';

import { createIotDeviceClient, deviceApiPrefix, type DeviceClient } from './client';
import type { IoTStore } from './store';
import type { IotAuthMode, IotConfigVersion, IotConfigVersionStatus, IotDeviceKind, IotDeviceRecord, SeriesBucket, Aggregation } from './types';

/** Org raíz por defecto (coincide con `lib/tenant.ts` DEFAULT_ORG_ID en apps/api). */
const ROOT_ORG_ID = '00000000-0000-4000-8000-000000000001';

/** Datos para crear/actualizar un dispositivo. `tokenCipher` ya viene cifrado. */
export interface IotDeviceCreateInput {
  organizationId: string;
  kind: IotDeviceKind;
  name: string;
  baseUrl: string;
  tokenCipher: string | null;
  authMode: IotAuthMode;
  pollIntervalMs: number;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

/** Abstracción de persistencia (packages/iot es Prisma-free). */
export interface IotDeviceRepository {
  list(scope: Record<string, unknown>): Promise<IotDeviceRecord[]>;
  findById(id: string, scope: Record<string, unknown>, kind?: IotDeviceKind): Promise<IotDeviceRecord | null>;
  create(data: IotDeviceCreateInput): Promise<IotDeviceRecord>;
  update(id: string, scope: Record<string, unknown>, data: Partial<IotDeviceCreateInput>): Promise<IotDeviceRecord | null>;
  remove(id: string, scope: Record<string, unknown>): Promise<boolean>;
  listConfigVersions(deviceId: string, limit: number): Promise<IotConfigVersion[]>;
  findConfigVersion(deviceId: string, version: number): Promise<IotConfigVersion | null>;
  latestConfigVersion(deviceId: string): Promise<IotConfigVersion | null>;
  createConfigVersion(data: { deviceId: string; version: number; config: unknown; hash: string; authorId: string | null }): Promise<IotConfigVersion>;
  updateConfigVersion(deviceId: string, version: number, patch: { status: IotConfigVersionStatus; error?: string | null; appliedAt?: Date | null }): Promise<IotConfigVersion | null>;
}

export interface IotPrismaLike {
  iotDevice: {
    findMany(args: { where: unknown }): Promise<IotDeviceRecord[]>;
    findFirst(args: { where: unknown }): Promise<IotDeviceRecord | null>;
    create(args: { data: unknown }): Promise<IotDeviceRecord>;
    updateMany(args: { where: unknown; data: unknown }): Promise<{ count: number }>;
    deleteMany(args: { where: unknown }): Promise<{ count: number }>;
  };
  iotDeviceConfigVersion: {
    findMany(args: { where: unknown; orderBy?: unknown; take?: unknown; select?: unknown }): Promise<IotConfigVersion[]>;
    findFirst(args: { where: unknown; orderBy?: unknown }): Promise<IotConfigVersion | null>;
    create(args: { data: unknown }): Promise<IotConfigVersion>;
    updateMany(args: { where: unknown; data: unknown }): Promise<{ count: number }>;
  };
}

export function createPrismaIotDeviceRepository(prisma: IotPrismaLike): IotDeviceRepository {
  return {
    list: (scope) => prisma.iotDevice.findMany({ where: scope }),
    findById: (id, scope, kind) => prisma.iotDevice.findFirst({ where: { id, ...scope, ...(kind ? { kind } : {}) } }),
    create: (data) => prisma.iotDevice.create({ data }),
    update: async (id, scope, data) => {
      const r = await prisma.iotDevice.updateMany({ where: { id, ...scope }, data });
      return r.count > 0 ? prisma.iotDevice.findFirst({ where: { id, ...scope } }) : null;
    },
    remove: async (id, scope) => (await prisma.iotDevice.deleteMany({ where: { id, ...scope } })).count > 0,
    listConfigVersions: (deviceId, limit) =>
      prisma.iotDeviceConfigVersion.findMany({
        where: { deviceId },
        orderBy: { version: 'desc' },
        take: limit,
        select: { id: true, deviceId: true, version: true, status: true, hash: true, error: true, authorId: true, appliedAt: true, createdAt: true },
      }),
    findConfigVersion: (deviceId, version) => prisma.iotDeviceConfigVersion.findFirst({ where: { deviceId, version } }),
    latestConfigVersion: (deviceId) => prisma.iotDeviceConfigVersion.findFirst({ where: { deviceId }, orderBy: { version: 'desc' } }),
    createConfigVersion: (data) => prisma.iotDeviceConfigVersion.create({ data }),
    updateConfigVersion: async (deviceId, version, patch) => {
      const r = await prisma.iotDeviceConfigVersion.updateMany({ where: { deviceId, version }, data: patch });
      return r.count > 0 ? prisma.iotDeviceConfigVersion.findFirst({ where: { deviceId, version } }) : null;
    },
  };
}

export interface IotRouteDeps {
  repo: IotDeviceRepository;
  store: IoTStore;
  /** Encripta un token en reposo (AES-256-GCM). */
  encrypt: (value: string) => string;
  /** Desencripta un token. */
  decrypt: (value: string) => string;
  /** Kinds que admite el plugin dueño (valida `kind` en create/patch). */
  kinds?: IotDeviceKind[];
  /** Kind único que posee el plugin dueño (restringe lookup/mutación por id). */
  kind?: IotDeviceKind;
  /** Hosts adicionales permitidos (SSRF-safe) para el cliente del dispositivo. */
  allowlist?: string[];
}

interface IotFastifyLike {
  get(path: string, opts: unknown, handler: (request: unknown, reply: unknown) => Promise<unknown>): unknown;
  post(path: string, opts: unknown, handler: (request: unknown, reply: unknown) => Promise<unknown>): unknown;
  patch(path: string, opts: unknown, handler: (request: unknown, reply: unknown) => Promise<unknown>): unknown;
  delete(path: string, opts: unknown, handler: (request: unknown, reply: unknown) => Promise<unknown>): unknown;
  authenticate?: unknown;
  authorize?: (permission: string) => unknown;
  requireTenant?: unknown;
  resolveTenant?: (request: unknown) => Promise<{ organizationId?: string | null }>;
  resolveScope?: (tenant: unknown) => Promise<Record<string, unknown>>;
}

interface IotRequest {
  body?: { name?: unknown; baseUrl?: unknown; token?: unknown; kind?: unknown; authMode?: unknown; pollIntervalMs?: unknown; enabled?: unknown; metadata?: unknown; config?: unknown; publish?: unknown };
  params?: { id?: unknown; version?: unknown };
  query?: { metric?: unknown; from?: unknown; to?: unknown; agg?: unknown; bucket?: unknown; limit?: unknown };
  tenant?: { organizationId?: string | null };
  user?: { sub?: unknown; id?: unknown };
}
interface IotReply {
  code(n: number): IotReply;
  send(payload: unknown): unknown;
}

const KINDS: IotDeviceKind[] = ['invernadero', 'sema'];
const AUTH_MODES: IotAuthMode[] = ['bearer', 'x-auth-token', 'x-api-key'];

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function asInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
/** Devuelve el dispositivo sin el token cifrado (nunca serializar al cliente). */
function stripToken(device: IotDeviceRecord): Omit<IotDeviceRecord, 'tokenCipher'> {
  const { tokenCipher, ...rest } = device;
  void tokenCipher;
  return rest;
}

/** Stringify con claves ordenadas recursivamente (hash estable del config). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** Verifica que sea un objeto JSON plano (no array, no null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Devuelve el mensaje de rechazo si el body 2xx indica {ok:false}/{success:false}; null si aceptó. */
function deviceRejected(body: unknown): string | null {
  if (!isPlainObject(body)) return null;
  if (body.ok !== false && body.success !== false) return null;
  return String(body.error ?? body.message ?? 'El dispositivo rechazó la configuración').slice(0, 500);
}

/**
 * Registra las rutas base de dispositivos IoT (registro/listado/test/series),
 * reutilizables por los plugins de dominio (invernadero, semáforo, etc.).
 */
export function registerIotDeviceRoutes(fastify: IotFastifyLike, deps: IotRouteDeps): void {
  const allowedKinds: IotDeviceKind[] = deps.kinds ?? KINDS;
  const deviceKind: IotDeviceKind | undefined = deps.kind;
  const auth = { preHandler: [fastify.authenticate].filter(Boolean) };
  const read = { preHandler: [fastify.authenticate, fastify.authorize?.('iot.read'), fastify.requireTenant].filter(Boolean) };
  const write = { preHandler: [fastify.authenticate, fastify.authorize?.('iot.write'), fastify.requireTenant].filter(Boolean) };

  const orgOf = (req: IotRequest): string => req.tenant?.organizationId ?? ROOT_ORG_ID;

  async function scopeOf(req: IotRequest): Promise<Record<string, unknown>> {
    if (fastify.resolveTenant && fastify.resolveScope) {
      return fastify.resolveScope(await fastify.resolveTenant(req));
    }
    return { organizationId: orgOf(req) };
  }

  const clientOf = (device: IotDeviceRecord): DeviceClient => {
    const token = device.tokenCipher ? deps.decrypt(device.tokenCipher) : undefined;
    return createIotDeviceClient({ baseUrl: device.baseUrl, token, authMode: device.authMode, allowlist: deps.allowlist });
  };

  async function publishVersion(device: IotDeviceRecord, rec: IotConfigVersion): Promise<{ version: IotConfigVersion; ok: boolean; deviceResponse?: unknown }> {
    try {
      const deviceResponse = await clientOf(device).put<unknown>(`${deviceApiPrefix(device.baseUrl)}/config`, rec.config);
      // 2xx con {ok:false}/{success:false} = rechazo explícito del equipo (no marcar applied).
      const rejection = deviceRejected(deviceResponse);
      if (rejection !== null) {
        const updated = await deps.repo.updateConfigVersion(device.id, rec.version, { status: 'failed', error: rejection, appliedAt: null });
        return { version: updated ?? rec, ok: false, deviceResponse };
      }
      const updated = await deps.repo.updateConfigVersion(device.id, rec.version, { status: 'applied', error: null, appliedAt: new Date() });
      return { version: updated ?? rec, ok: true, deviceResponse };
    } catch (err) {
      const error = (err instanceof Error ? err.message : 'Error al publicar').slice(0, 500);
      const updated = await deps.repo.updateConfigVersion(device.id, rec.version, { status: 'failed', error, appliedAt: null });
      return { version: updated ?? rec, ok: false };
    }
  }

  fastify.post('/devices', write, async (request, reply) => {
    const req = request as IotRequest;
    const body = req.body ?? {};
    const name = asStr(body.name);
    const baseUrl = asStr(body.baseUrl);
    const kind = body.kind === undefined
      ? allowedKinds[0]!
      : typeof body.kind === 'string' && allowedKinds.includes(body.kind as IotDeviceKind)
        ? (body.kind as IotDeviceKind)
        : null;
    if (kind === null) {
      return (reply as IotReply).code(400).send({ error: `kind inválido (válidos: ${allowedKinds.join(', ')})` });
    }
    const authMode = AUTH_MODES.includes(body.authMode as IotAuthMode) ? (body.authMode as IotAuthMode) : 'bearer';
    const token = asStr(body.token);
    if (!name || !baseUrl) {
      return (reply as IotReply).code(400).send({ error: 'name y baseUrl son obligatorios' });
    }
    const device = await deps.repo.create({
      organizationId: orgOf(req),
      kind,
      name,
      baseUrl,
      tokenCipher: token ? deps.encrypt(token) : null,
      authMode,
      pollIntervalMs: Math.max(1000, asInt(body.pollIntervalMs, 60000)),
      enabled: body.enabled !== false,
      metadata: (typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {}) as Record<string, unknown>,
    });
    return stripToken(device);
  });

  fastify.get('/devices', read, async (request) => {
    const req = request as IotRequest;
    return (await deps.repo.list(await scopeOf(req))).map(stripToken);
  });

  fastify.patch('/devices/:id', write, async (request, reply) => {
    const req = request as IotRequest;
    const id = asStr(req.params?.id);
    const body = req.body ?? {};
    const data: Partial<IotDeviceCreateInput> = {};
    if (typeof body.name === 'string') data.name = body.name;
    if (typeof body.baseUrl === 'string') data.baseUrl = body.baseUrl;
    if (body.kind !== undefined) {
      if (typeof body.kind !== 'string' || !allowedKinds.includes(body.kind as IotDeviceKind)) {
        return (reply as IotReply).code(400).send({ error: `kind inválido (válidos: ${allowedKinds.join(', ')})` });
      }
      data.kind = body.kind as IotDeviceKind;
    }
    if (typeof body.authMode === 'string' && AUTH_MODES.includes(body.authMode as IotAuthMode)) data.authMode = body.authMode as IotAuthMode;
    if (typeof body.pollIntervalMs === 'number' || typeof body.pollIntervalMs === 'string') data.pollIntervalMs = Math.max(1000, asInt(body.pollIntervalMs, 60000));
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (typeof body.token === 'string' && body.token) data.tokenCipher = deps.encrypt(body.token);
    if (typeof body.metadata === 'object' && body.metadata !== null) data.metadata = body.metadata as Record<string, unknown>;
    const scope = await scopeOf(req);
    if (deviceKind) {
      const existing = await deps.repo.findById(id, scope, deviceKind);
      if (!existing) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    }
    const device = await deps.repo.update(id, scope, data);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    return stripToken(device);
  });

  fastify.delete('/devices/:id', write, async (request, reply) => {
    const req = request as IotRequest;
    const id = asStr(req.params?.id);
    const scope = await scopeOf(req);
    if (deviceKind) {
      const existing = await deps.repo.findById(id, scope, deviceKind);
      if (!existing) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    }
    const ok = await deps.repo.remove(id, scope);
    if (!ok) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    return { ok: true };
  });

  fastify.post('/devices/:id/test', read, async (request, reply) => {
    const req = request as IotRequest;
    const device = await deps.repo.findById(asStr(req.params?.id), await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    const client: DeviceClient = clientOf(device);
    try {
      await client.fetchJson(`${deviceApiPrefix(device.baseUrl)}/status`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error de conexión' };
    }
  });

  fastify.get('/devices/:id/series', read, async (request, reply) => {
    const req = request as IotRequest;
    const device = await deps.repo.findById(asStr(req.params?.id), await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    const metric = asStr(req.query?.metric);
    if (!metric) return (reply as IotReply).code(400).send({ error: 'Parámetro metric es obligatorio' });
    const agg = (['avg', 'min', 'max', 'count', 'sum'].includes(req.query?.agg as string) ? req.query?.agg : 'avg') as Aggregation;
    const bucket = (['raw', 'hour', 'day'].includes(req.query?.bucket as string) ? req.query?.bucket : undefined) as SeriesBucket | undefined;
    const from = asStr(req.query?.from);
    const to = asStr(req.query?.to);
    return deps.store.querySeries({
      deviceId: device.id,
      metric,
      agg,
      bucket,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: asInt(req.query?.limit, 1000),
    });
  });

  // La config viva incluye credenciales del equipo (SEMA: security.api_key/server_key/extra_keys) → write, no read.
  fastify.get('/devices/:id/config', write, async (request, reply) => {
    const req = request as IotRequest;
    const device = await deps.repo.findById(asStr(req.params?.id), await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    try {
      const config = await clientOf(device).fetchJson<unknown>(`${deviceApiPrefix(device.baseUrl)}/config`);
      return { config };
    } catch (err) {
      return (reply as IotReply).code(502).send({ error: err instanceof Error ? err.message : 'Error de conexión con el dispositivo' });
    }
  });

  fastify.post('/devices/:id/config', write, async (request, reply) => {
    const req = request as IotRequest;
    const body = req.body ?? {};
    if (!isPlainObject(body.config)) {
      return (reply as IotReply).code(400).send({ error: 'config debe ser un objeto' });
    }
    const device = await deps.repo.findById(asStr(req.params?.id), await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    const config = body.config;
    const hash = sha256Hex(config);
    const authorId = typeof req.user?.sub === 'string' ? req.user.sub : typeof req.user?.id === 'string' ? req.user.id : null;
    const latest = await deps.repo.latestConfigVersion(device.id);
    const version = (latest?.version ?? 0) + 1;
    let created: IotConfigVersion;
    try {
      created = await deps.repo.createConfigVersion({ deviceId: device.id, version, config, hash, authorId });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        return (reply as IotReply).code(409).send({ error: 'Otra versión se creó al mismo tiempo, reintentá' });
      }
      throw err;
    }
    if (body.publish === true) {
      const result = await publishVersion(device, created);
      return { version: result.version, deviceResponse: result.deviceResponse, ok: result.ok };
    }
    return { version: created, ok: true };
  });

  fastify.post('/devices/:id/config/:version/publish', write, async (request, reply) => {
    const req = request as IotRequest;
    const id = asStr(req.params?.id);
    const version = asInt(req.params?.version, NaN);
    if (!Number.isInteger(version) || version < 1) {
      return (reply as IotReply).code(400).send({ error: 'version inválida' });
    }
    const device = await deps.repo.findById(id, await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    const rec = await deps.repo.findConfigVersion(id, version);
    if (!rec) return (reply as IotReply).code(404).send({ error: 'Versión no encontrada' });
    const result = await publishVersion(device, rec);
    return { version: result.version, deviceResponse: result.deviceResponse, ok: result.ok };
  });

  fastify.get('/devices/:id/config/versions', read, async (request, reply) => {
    const req = request as IotRequest;
    const device = await deps.repo.findById(asStr(req.params?.id), await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    const rawLimit = asInt(req.query?.limit, 50);
    const limit = Math.min(200, Math.max(1, rawLimit));
    const versions = await deps.repo.listConfigVersions(device.id, limit);
    return { versions };
  });

  // Trae el `config` completo (con credenciales) → write, no read.
  fastify.get('/devices/:id/config/versions/:version', write, async (request, reply) => {
    const req = request as IotRequest;
    const id = asStr(req.params?.id);
    const version = asInt(req.params?.version, NaN);
    if (!Number.isInteger(version) || version < 1) {
      return (reply as IotReply).code(400).send({ error: 'version inválida' });
    }
    const device = await deps.repo.findById(id, await scopeOf(req), deviceKind);
    if (!device) return (reply as IotReply).code(404).send({ error: 'Dispositivo no encontrado' });
    const rec = await deps.repo.findConfigVersion(id, version);
    if (!rec) return (reply as IotReply).code(404).send({ error: 'Versión no encontrada' });
    return { version: rec };
  });

  // Referencia `auth` para el fallback sin decoradores de apps/api.
  void auth;
}
