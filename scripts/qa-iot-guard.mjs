import { execSync } from 'node:child_process';

const API = 'http://localhost:4000/api/v1';
const FAKE = 'http://localhost:9001';
const CWD = 'D:/Users/alekl/Documents/GitHub/Webs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (db, sql) =>
  execSync(
    `docker compose exec -T postgres psql -U webs -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', cwd: CWD },
  ).trim();

let fail = false;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fail = true;
};

async function api(method, path, body, token) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}

const ctrl = (state) =>
  fetch(`${FAKE}/_control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
const stats = async () => (await (await fetch(`${FAKE}/_stats`)).json());

async function waitHealthy() {
  for (let i = 0; i < 30; i++) {
    const h = await fetch(`${API}/health`).catch(() => null);
    if (h && h.ok) { console.log('api healthy'); return true; }
    await sleep(2000);
  }
  return false;
}

// 1. login
const login = await api('POST', '/auth/login', { identifier: 'admin@webs.test', password: 'Admin12345!' });
const tok = (await login.json()).accessToken;
check('login', !!tok, 'status=' + login.status);

// 2. ensure sema installed + allowlist
const pj = await (await api('GET', '/plugins', null, tok)).json();
const installed = (pj.installed || []).map((x) => x.pluginId || x.id);
if (!installed.includes('sema')) {
  const inst = await api('POST', '/plugins/install', { id: 'sema' }, tok);
  console.log('install sema:', inst.status);
}
await api('PUT', '/plugins/sema/settings', { ssrfAllowlist: ['host.docker.internal'] }, tok);
console.log('sema allowlist = [host.docker.internal]');

// 3. reset fake counts
await ctrl({ resetCounts: true });

// 4. create new device (pollIntervalMs 60000 → 1 poll/cycle per collector)
const dev = await api('POST', '/plugins/sema/devices', { name: 'QA GUARD', baseUrl: 'http://host.docker.internal:9001', pollIntervalMs: 60000 }, tok);
const dj = await dev.json();
const devId = dj.id;
check('create device', dev.status === 200 && !!devId, `status=${dev.status} id=${devId}`);
check('no tokenCipher en create', !JSON.stringify(dj).includes('tokenCipher'));
console.log(`DEVICE_ID=${devId}`);

// 5. restart api (picks up device at register)
execSync('docker compose restart api', { stdio: 'inherit', cwd: CWD });
await waitHealthy();
await ctrl({ resetCounts: true });

// 6. wait for first poll cycle (collectors fire at +60s)
console.log('waiting for first poll cycle (~70s)...');
for (let i = 0; i < 18; i++) {
  await sleep(5000);
  const s = await stats();
  if ((s.counts['/api/v1/events'] || 0) >= 1) { console.log('first event poll detected'); break; }
}

// 7. count rows + receivedAt distinct
const q = psql('webs', `select count(*), count(distinct "receivedAt") from iot_device_events where "deviceId"='${devId}'`);
const [total, distinctTs] = q.split('|').map((s) => s.trim());
console.log(`events: total=${total} distinct_receivedAt=${distinctTs}`);
check('primer ciclo = 2 filas (no 4)', total === '2', `total=${total}`);
check('un solo createMany (1 receivedAt distinto)', distinctTs === '1', `distinct=${distinctTs}`);

// 8. request counts (no duplicate polling)
const s = await stats();
const c = s.counts || {};
console.log('fake requests:', JSON.stringify(c));
check('/api/v1/sensors = 1 por ciclo', (c['/api/v1/sensors'] || 0) === 1, `sensors=${c['/api/v1/sensors'] || 0}`);
check('/api/v1/events = 1 por ciclo', (c['/api/v1/events'] || 0) === 1, `events=${c['/api/v1/events'] || 0}`);
check('/api/v1/alarms = 1 por ciclo', (c['/api/v1/alarms'] || 0) === 1, `alarms=${c['/api/v1/alarms'] || 0}`);

// 9. restart api → next cycle must NOT duplicate
console.log('restarting api for post-restart cycle check...');
execSync('docker compose restart api', { stdio: 'inherit', cwd: CWD });
await waitHealthy();
await ctrl({ resetCounts: true });
console.log('waiting for post-restart poll cycle (~70s)...');
for (let i = 0; i < 18; i++) {
  await sleep(5000);
  const s2 = await stats();
  if ((s2.counts['/api/v1/events'] || 0) >= 1) { console.log('post-restart event poll detected'); break; }
}
const q2 = psql('webs', `select count(*) from iot_device_events where "deviceId"='${devId}'`);
check('post-restart: sin filas nuevas (sigue en 2)', q2 === '2', `total=${q2}`);
const s3 = await stats();
console.log('fake requests post-restart:', JSON.stringify(s3.counts || {}));

console.log(fail ? 'GUARD: ROJO' : 'GUARD: VERDE');
process.exit(fail ? 1 : 0);
