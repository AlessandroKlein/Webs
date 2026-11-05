// QA: rutas de configuración versionada IoT (`registerIotDeviceRoutes`).
// Sin Docker, sin Prisma, sin dependencias nuevas. Corre con:
//   pnpm --filter @webs/api exec tsx ../../scripts/qa-iot-config.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { registerIotDeviceRoutes } from '../packages/iot/src/index.ts';

const ORG1 = 'org-1';
const ORG2 = 'org-2';
const USER = { sub: 'u1' };

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

// ---------- dispositivo falso (node:http en 127.0.0.1:0) ----------
let rejectConfig = false;
let softRejectError = null; // 200 {ok:false,error} (rechazo suave con body)
let successFalse = false; // 200 {success:false} sin error
let deviceLastPut = null; // último body recibido por PUT /api/v1/config
const deviceServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const json = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/v1/config') {
      return json(200, { network: { ssid: 'x' }, system: { tz: 'America/Argentina/Buenos_Aires' } });
    }
    if (req.method === 'PUT' && url.pathname === '/api/v1/config') {
      try { deviceLastPut = raw ? JSON.parse(raw) : null; } catch { deviceLastPut = raw; }
      if (rejectConfig) return json(400, { error: 'invalid config' });
      if (softRejectError) return json(200, { ok: false, error: softRejectError });
      if (successFalse) return json(200, { success: false });
      return json(200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/config') {
      return json(200, { ok: true, config_version: 7 });
    }
    return json(404, { error: 'not found' });
  });
});
await new Promise((r) => deviceServer.listen(0, '127.0.0.1', r));
const PORT = deviceServer.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

// ---------- fastify falso (con matching de path params) ----------
function makeFastify() {
  const handlers = new Map(); // `${method} ${template}` -> handler

  function findHandler(method, path) {
    const segs = path.split('?')[0].split('/');
    for (const [key, h] of handlers) {
      const [m, pattern] = key.split(' ');
      if (m !== method) continue;
      const ps = pattern.split('/');
      if (ps.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < ps.length; i++) {
        if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
        else if (ps[i] !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: h, params };
    }
    return null;
  }

  const f = {
    get(path, _opts, handler) { handlers.set(`GET ${path}`, handler); return f; },
    post(path, _opts, handler) { handlers.set(`POST ${path}`, handler); return f; },
    patch(path, _opts, handler) { handlers.set(`PATCH ${path}`, handler); return f; },
    delete(path, _opts, handler) { handlers.set(`DELETE ${path}`, handler); return f; },
    authenticate: {},
    authorize: () => ({}),
    requireTenant: {},
    resolveTenant: async () => ({ organizationId: ORG1 }),
    resolveScope: async (tenant) => ({ organizationId: tenant.organizationId }),
  };
  f.invoke = async (method, path, { params = {}, body, query = {}, tenant = { organizationId: ORG1 } } = {}) => {
    const found = findHandler(method, path);
    if (!found) {
      const templates = [...handlers.keys()].join(', ');
      throw new Error(`handler no registrado: ${method} ${path} (plantillas: ${templates})`);
    }
    const { handler, params: foundParams } = found;
    const request = { params: { ...foundParams, ...params }, body, query, tenant, user: USER };
    const reply = { status: 200, body: undefined, code(n) { this.status = n; return this; }, send(p) { this.body = p; return this; } };
    const result = await handler(request, reply);
    const status = reply.body !== undefined ? reply.status : 200;
    const payload = reply.body !== undefined ? reply.body : result;
    return { status, payload };
  };
  return f;
}

// ---------- repo falso en memoria (interfaz real IotDeviceRepository) ----------
function makeRepo() {
  const devices = new Map([
    ['d1', { id: 'd1', organizationId: ORG1, kind: 'invernadero', baseUrl: BASE, tokenCipher: null, authMode: 'bearer', pollIntervalMs: 60000, enabled: true, metadata: {} }],
    ['d2', { id: 'd2', organizationId: ORG2, kind: 'invernadero', baseUrl: BASE, tokenCipher: null, authMode: 'bearer', pollIntervalMs: 60000, enabled: true, metadata: {} }],
  ]);
  const versions = []; // IotConfigVersion[]

  return {
    // métodos de dispositivo
    async list(scope) {
      return [...devices.values()].filter((d) => d.organizationId === scope.organizationId);
    },
    async findById(id, scope, kind) {
      const d = devices.get(id);
      if (!d) return null;
      if (scope && scope.organizationId && d.organizationId !== scope.organizationId) return null;
      if (kind && d.kind !== kind) return null;
      return d;
    },
    async create(data) {
      const d = { ...data, id: data.id ?? `d${devices.size + 1}` };
      devices.set(d.id, d);
      return d;
    },
    async update(id, scope, data) {
      const d = await this.findById(id, scope);
      if (!d) return null;
      Object.assign(d, data);
      return d;
    },
    async remove(id, scope) {
      if (!(await this.findById(id, scope))) return false;
      devices.delete(id);
      return true;
    },
    // métodos de config versionada (nombres y firmas REALES de routes.ts)
    async listConfigVersions(deviceId, limit) {
      return versions
        .filter((v) => v.deviceId === deviceId)
        .sort((a, b) => b.version - a.version)
        .slice(0, limit)
        .map(({ config, ...rest }) => rest); // sin `config` (el real usa select)
    },
    async findConfigVersion(deviceId, version) {
      return versions.find((v) => v.deviceId === deviceId && v.version === version) ?? null;
    },
    async latestConfigVersion(deviceId) {
      return versions.filter((v) => v.deviceId === deviceId).sort((a, b) => b.version - a.version)[0] ?? null;
    },
    async createConfigVersion({ deviceId, version, config, hash, authorId }) {
      const rec = {
        id: `cv-${deviceId}-${version}`,
        deviceId,
        version,
        config,
        hash,
        authorId,
        status: 'draft',
        error: null,
        appliedAt: null,
        createdAt: new Date(),
      };
      versions.push(rec);
      return rec;
    },
    async updateConfigVersion(deviceId, version, patch) {
      const v = versions.find((x) => x.deviceId === deviceId && x.version === version);
      if (!v) return null;
      Object.assign(v, patch);
      return v;
    },
  };
}

// ---------- registrar rutas ----------
const repo = makeRepo();
const fastify = makeFastify();
const deps = {
  repo,
  store: { querySeries: async () => [] },
  encrypt: (v) => `enc:${v}`,
  decrypt: (v) => String(v).replace(/^enc:/, ''),
  kinds: ['invernadero'],
  kind: 'invernadero',
  allowlist: ['127.0.0.1'], // imprescindible para permitir loopback (SSRF)
};
registerIotDeviceRoutes(fastify, deps);

const invoke = (method, path, opts) => fastify.invoke(method, path, opts);

// ---------- aserciones ----------
const CFG = { network: { ssid: 'x' } };

// (0) GET config → proxy al device
await (async () => {
  const r = await invoke('GET', '/devices/d1/config', {});
  await check('GET config proxy', () => {
    assert.equal(r.status, 200);
    assert.equal(r.payload.config.network.ssid, 'x');
  });
})();

// (a) POST config sin publish → v1 draft + hash 64 hex + ok:true
await (async () => {
  const r = await invoke('POST', '/devices/d1/config', { body: { config: CFG } });
  await check('POST config sin publish → v1 draft', () => {
    assert.equal(r.status, 200);
    const v = r.payload.version;
    assert.equal(v.version, 1);
    assert.equal(v.status, 'draft');
    assert.match(v.hash, /^[0-9a-f]{64}$/i);
    assert.equal(r.payload.ok, true);
  });
})();

// (b) publish v1 → applied + appliedAt + device recibió el body exacto
await (async () => {
  const r = await invoke('POST', '/devices/d1/config/1/publish', {});
  await check('publish v1 → applied', () => {
    assert.equal(r.status, 200);
    const v = r.payload.version;
    assert.equal(v.status, 'applied');
    assert.ok(v.appliedAt != null);
    assert.equal(r.payload.ok, true);
    assert.equal(r.payload.deviceResponse?.ok, true);
    assert.deepEqual(deviceLastPut, CFG);
  });
})();

// (c) device rechaza → v2 failed + error, v1 sigue applied
await (async () => {
  rejectConfig = true;
  const r = await invoke('POST', '/devices/d1/config', { body: { config: { bad: true }, publish: true } });
  rejectConfig = false;
  const v1now = await repo.findConfigVersion('d1', 1);
  await check('publish rechazado → v2 failed + error, v1 intacta', () => {
    assert.equal(r.status, 200); // SIEMPRE 200; el rechazo va en version.status/error
    const v2 = r.payload.version;
    assert.equal(v2.version, 2);
    assert.equal(v2.status, 'failed');
    assert.ok(v2.error && /400|HTTP/i.test(v2.error), `error debe mencionar 400/HTTP, fue: ${v2.error}`);
    assert.equal(r.payload.ok, false);
    assert.equal(v1now.status, 'applied');
  });
})();

// (d) reintento publish v2 con device aceptando → v2 applied
await (async () => {
  const r = await invoke('POST', '/devices/d1/config/2/publish', {});
  await check('retry publish v2 → applied', () => {
    assert.equal(r.status, 200);
    assert.equal(r.payload.version.status, 'applied');
    assert.equal(r.payload.ok, true);
  });
})();

// (e) GET versions → DESC, sin config
await (async () => {
  const r = await invoke('GET', '/devices/d1/config/versions', {});
  await check('GET versions DESC sin config', () => {
    assert.equal(r.status, 200);
    const vs = r.payload.versions;
    assert.equal(vs.length, 2);
    assert.equal(vs[0].version, 2);
    assert.equal(vs[1].version, 1);
    assert.ok(vs.every((v) => !('config' in v)), 'ninguna fila debe traer config');
  });
})();

// (f) GET versions/1 → con config
await (async () => {
  const r = await invoke('GET', '/devices/d1/config/versions/1', {});
  await check('GET versions/1 con config', () => {
    assert.equal(r.status, 200);
    assert.ok('config' in r.payload.version);
    assert.deepEqual(r.payload.version.config, CFG);
  });
})();

// (g) 404: dispositivo de otra org + versión inexistente
await (async () => {
  const r2 = await invoke('GET', '/devices/d2/config/versions', {});
  const r999 = await invoke('GET', '/devices/d1/config/versions/999', {});
  await check('404 org-2 y versión inexistente', () => {
    assert.equal(r2.status, 404);
    assert.equal(r999.status, 404);
  });
})();

// (h) config [] / null → 400
await (async () => {
  const rArr = await invoke('POST', '/devices/d1/config', { body: { config: [] } });
  const rNull = await invoke('POST', '/devices/d1/config', { body: { config: null } });
  await check('config [] / null → 400', () => {
    assert.equal(rArr.status, 400);
    assert.equal(rNull.status, 400);
  });
})();

// (i) version no numérica → 400
await (async () => {
  const r = await invoke('GET', '/devices/d1/config/versions/abc', {});
  await check('version no numérica → 400', () => {
    assert.equal(r.status, 400);
  });
})();

// (j) 200 {"ok":false,"error":"..."} → failed + error del body
await (async () => {
  softRejectError = 'sensor 3 fuera de rango';
  const r = await invoke('POST', '/devices/d1/config', { body: { config: { v: 'j' }, publish: true } });
  softRejectError = null;
  await check('200 ok:false → failed + error del body', () => {
    assert.equal(r.status, 200);
    const v = r.payload.version;
    assert.equal(v.version, 3);
    assert.equal(v.status, 'failed');
    assert.ok(v.error && /fuera de rango/.test(v.error), `error debe contener "fuera de rango", fue: ${v.error}`);
    assert.equal(r.payload.ok, false);
  });
})();

// (k) 200 {"success":false} sin error → failed + error no vacío
await (async () => {
  successFalse = true;
  const r = await invoke('POST', '/devices/d1/config', { body: { config: { v: 'k' }, publish: true } });
  successFalse = false;
  await check('200 success:false → failed + error por defecto', () => {
    assert.equal(r.status, 200);
    const v = r.payload.version;
    assert.equal(v.version, 4);
    assert.equal(v.status, 'failed');
    assert.ok(v.error && String(v.error).length > 0, 'error debe ser no vacío');
    assert.equal(r.payload.ok, false);
  });
})();

// ---------- limpieza + veredicto ----------
deviceServer.close();
if (failures > 0) {
  console.log(`qa-iot-config: FAIL (${failures})`);
  process.exit(1);
}
console.log('qa-iot-config: OK');
process.exit(0);
