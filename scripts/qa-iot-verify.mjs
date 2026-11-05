// QA task-25 (verificación restante): 2b reboot ts→0, 2c tsRaw>2^31, 3 allSettled, 4 kind-scope.
// Requiere: stack compose up, fake device con /_control (node scripts/qa-fake-device.mjs).
import { execSync } from 'node:child_process';

const BASE = 'http://localhost:4000';
const API = `${BASE}/api/v1`;
const FAKE = 'http://localhost:9001';
const ADMIN = { identifier: 'admin@webs.test', password: 'Admin12345!' };

let failures = 0;
const check = (name, cond, detail = '') => {
  const ok = Boolean(cond);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const ctl = async (state) => {
  const r = await fetch(`${FAKE}/_control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
  return r.json();
};

const psql = (db, sql) => execSync(
  `docker compose exec -T postgres psql -U webs -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
  { encoding: 'utf8', cwd: process.cwd(), timeout: 20000 },
).trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, intervalMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { const v = await fn(); if (v) return v; await sleep(intervalMs); }
  return null;
}

async function main() {
  const login = await api('POST', '/auth/login', { body: ADMIN });
  const token = login.json?.accessToken;
  check('login', login.status === 200 && !!token, `status=${login.status}`);
  if (!token) { console.log(JSON.stringify(login.json)); process.exit(1); }

  const devs = await api('GET', '/plugins/sema/devices', { token });
  const deviceId = (Array.isArray(devs.json) ? devs.json : [])[0]?.id;
  check('dispositivo sema existente', !!deviceId, `id=${deviceId}`);
  if (!deviceId) { console.log(JSON.stringify(devs.json)); process.exit(1); }
  console.log(`DEVICE_ID=${deviceId}`);

  const evCount = () => psql('webs', `select count(*) from iot_device_events where "deviceId"='${deviceId}'`);

  // --- 2c: tsRaw > 2^31 (BIGINT en DB, number en endpoint) ---
  await ctl({ highTs: 4000000000 });
  const before = Number(evCount());
  const highRow = await waitFor(async () => {
    const r = psql('webs', `select "tsRaw" from iot_device_events where "deviceId"='${deviceId}' and "tsRaw"=4000000000 limit 1`);
    return r ? r : null;
  }, 90000);
  check('2c: tsRaw>2^31 persiste (BIGINT)', !!highRow, `row=${highRow}`);
  // endpoint: tsRaw como number (no string), sin desbordar
  const evHigh = await api('GET', `/plugins/sema/devices/${deviceId}/events?limit=500`, { token });
  const hi = (evHigh.json?.events ?? []).find((e) => e.tsRaw === 4000000000);
  check('2c: endpoint tsRaw=4000000000 como number', hi && typeof hi.tsRaw === 'number', `tsRaw=${hi?.tsRaw} (${typeof hi?.tsRaw})`);
  await ctl({ highTs: null });

  // --- 2b: reboot sim (ts→0) → nuevo fingerprint, nueva fila (deuda conocida: no dedupe) ---
  await ctl({ tsAlarm: 0 });
  const zeroRow = await waitFor(async () => {
    const r = psql('webs', `select "tsRaw",fingerprint from iot_device_events where "deviceId"='${deviceId}' and "tsRaw"=0 limit 1`);
    return r ? r : null;
  }, 90000);
  check('2b: reboot ts→0 genera nueva fila (fingerprint nuevo)', !!zeroRow, `row=${zeroRow}`);
  // documentar: la alarma con ts=0 NO se deduplica contra ts=123456789 (distinto fingerprint)
  const oldAlarm = psql('webs', `select count(*) from iot_device_events where "deviceId"='${deviceId}' and "tsRaw"=123456789 and kind='alarm'`);
  check('2b: fila vieja (ts=123456789) sigue presente', Number(oldAlarm) >= 1, `count=${oldAlarm}`);
  await ctl({ tsAlarm: 123456789 });

  // --- 3: allSettled — deshabilitar una ruta no bloquea la otra ---
  // 3a: /alarms 404, /events sigue persistiendo (eventos de /events entran)
  await ctl({ disableAlarms: true });
  const evBeforeA = Number(evCount());
  const stillEvents = await waitFor(async () => {
    const c = Number(evCount());
    return c > evBeforeA ? c : null;
  }, 90000);
  check('3a: /alarms 404 no bloquea /events (filas nuevas)', !!stillEvents, `antes=${evBeforeA} después=${stillEvents}`);
  await ctl({ disableAlarms: false });

  // 3b: /events 404, /alarms sigue persistiendo (alarma de /alarms entra)
  await ctl({ disableEvents: true });
  const evBeforeB = Number(evCount());
  const stillAlarms = await waitFor(async () => {
    const c = Number(evCount());
    return c > evBeforeB ? c : null;
  }, 90000);
  check('3b: /events 404 no bloquea /alarms (filas nuevas)', !!stillAlarms, `antes=${evBeforeB} después=${stillAlarms}`);
  await ctl({ disableEvents: false });

  // --- 4: kind-scope — dispositivo sema NO accesible vía plugin invernadero ---
  const cross = await api('GET', `/plugins/invernadero/devices/${deviceId}/events`, { token });
  check('4: sema device no accesible vía invernadero (404)', cross.status === 404, `status=${cross.status} ${JSON.stringify(cross.json)}`);

  await ctl({ tsAlarm: 123456789, tsSensor: 123456790, highTs: null, disableEvents: false, disableAlarms: false });
  console.log(`\n${failures === 0 ? 'VERIFY: VERDE' : `VERIFY: ROJO (${failures} fallas)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
