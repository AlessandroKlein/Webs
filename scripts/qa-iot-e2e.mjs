// QA E2E de telemetría IoT (task-25): migración 0015 + collector SEMA + dedupe.
// Uso: node scripts/qa-iot-e2e.mjs
// Requiere: fake device corriendo (node scripts/qa-fake-device.mjs), stack compose up.
import { execSync } from 'node:child_process';

const BASE = process.env.QA_API_URL ?? 'http://localhost:4000';
const API = `${BASE}/api/v1`;
const ADMIN = { identifier: 'admin@webs.test', password: 'Admin12345!' };
const FAKE_HOST = 'host.docker.internal';
const FAKE_BASE = `http://${FAKE_HOST}:9001`;

let failures = 0;
function check(name, cond, detail = '') {
  const ok = Boolean(cond);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
  return ok;
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

const psql = (db, sql) => execSync(
  `docker compose exec -T postgres psql -U webs -d ${db} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
  { encoding: 'utf8', cwd: process.cwd(), timeout: 20000 },
).trim();

async function waitFor(fn, timeoutMs, intervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function main() {
  // 1. Login superadmin.
  const login = await api('POST', '/auth/login', { body: ADMIN });
  const token = login.json?.accessToken;
  check('login superadmin', login.status === 200 && !!token, `status=${login.status}`);
  if (!token) { console.log(JSON.stringify(login.json)); process.exit(1); }

  // 2. Instalar sema si no está.
  const instList = await api('GET', '/plugins', { token });
  const semaInstalled = (instList.json?.installed ?? []).some((p) => p.pluginId === 'sema');
  if (!semaInstalled) {
    const install = await api('POST', '/plugins/install', { token, body: { id: 'sema' } });
    check('instalar sema', install.status === 201 || install.status === 200, `status=${install.status} ${JSON.stringify(install.json)}`);
  } else {
    console.log('PASS  sema ya instalado');
  }

  // 3. ssrfAllowlist (host.docker.internal → fake server del host).
  const setCfg = await api('PUT', '/plugins/sema/settings', { token, body: { ssrfAllowlist: [FAKE_HOST] } });
  check('ssrfAllowlist', setCfg.status === 200, `status=${setCfg.status} ${JSON.stringify(setCfg.json)}`);

  // 4. Crear dispositivo (poll rápido para medidas; events va a 60s fijo).
  const dev = await api('POST', '/plugins/sema/devices', {
    token,
    body: { name: 'QA SEMA E2E', baseUrl: FAKE_BASE, pollIntervalMs: 2000, enabled: true },
  });
  const deviceId = dev.json?.id;
  check('crear dispositivo', dev.status === 200 && !!deviceId, `status=${dev.status} id=${deviceId} ${JSON.stringify(dev.json)}`);
  check('respuesta sin tokenCipher', dev.status === 200 && !('tokenCipher' in (dev.json ?? {})), '');
  if (!deviceId) { console.log(JSON.stringify(dev.json)); process.exit(1); }
  console.log(`DEVICE_ID=${deviceId}`);

  // 5. Reiniciar api para que reconcile arranque collectors con la config fresca.
  console.log('--- reiniciando api (reconcile inmediato) ---');
  execSync('docker compose restart api', { stdio: 'inherit', cwd: process.cwd() });
  const healthy = await waitFor(async () => {
    try { const r = await fetch(`${BASE}/health`); return r.status === 200 ? r : null; } catch { return null; }
  }, 60000);
  check('api healthy tras restart', !!healthy, '');

  // 6. Medidas entran (poll cada 2s).
  const measured = await waitFor(async () => {
    const rows = psql('webs_iot', `select metric,value,unit from measurements where device_id='${deviceId}' order by metric`);
    return rows.split('\n').filter(Boolean).length >= 3 ? rows : null;
  }, 25000);
  check('medidas en webs_iot (>=3 métricas)', !!measured, `\n${measured ?? '(vacío)'}`);
  const metricCount = measured ? measured.split('\n').filter(Boolean).length : 0;

  // 7. Events/alarms (primer poll a ~60s). Espera: alarm deduplicada (1) + sensor (1) = 2 filas.
  const evRows = () => psql('webs', `select kind,type,fingerprint from iot_device_events where "deviceId"='${deviceId}' order by kind,type nulls last`);
  const firstEvents = await waitFor(async () => {
    const rows = evRows();
    return rows.split('\n').filter(Boolean).length >= 2 ? rows : null;
  }, 90000);
  check('events/alarms entran (2 filas)', !!firstEvents, `\n${firstEvents ?? '(vacío)'}`);
  if (firstEvents) {
    const lines = firstEvents.split('\n').filter(Boolean);
    const alarms = lines.filter((l) => l.includes('alarm|'));
    const events = lines.filter((l) => l.includes('event|'));
    check('alarma deduplicada (1 fila, no 2)', alarms.length === 1, `alarms=${alarms.length}`);
    check('evento sensor (1 fila)', events.length === 1, `events=${events.length}`);
    console.log('--- filas tras 1er ciclo ---\n' + firstEvents);
  }
  const countAfterFirst = firstEvents ? firstEvents.split('\n').filter(Boolean).length : 0;

  // 8. Dedupe entre ciclos: 2do poll (~60s) no agrega filas.
  const secondEvents = await waitFor(async () => {
    const rows = evRows();
    return rows.split('\n').filter(Boolean).length >= 2 ? rows : null;
  }, 90000, 5000);
  const countAfterSecond = secondEvents ? secondEvents.split('\n').filter(Boolean).length : 0;
  check('dedupe entre ciclos (sin filas nuevas)', countAfterSecond === countAfterFirst, `antes=${countAfterFirst} después=${countAfterSecond}`);
  console.log('--- filas tras 2do ciclo ---\n' + (secondEvents ?? '(vacío)'));

  // 9. Shape del endpoint: sin fingerprint ni tokenCipher; limit y kind.
  const ev = await api('GET', `/plugins/sema/devices/${deviceId}/events`, { token });
  const events = ev.json?.events;
  check('GET /events 200', ev.status === 200 && Array.isArray(events), `status=${ev.status}`);
  if (Array.isArray(events) && events.length) {
    const keys = Object.keys(events[0]);
    check('sin fingerprint', !keys.includes('fingerprint'), keys.join(','));
    check('sin tokenCipher', !keys.includes('tokenCipher'), keys.join(','));
  }
  const evKind = await api('GET', `/plugins/sema/devices/${deviceId}/events?kind=alarm`, { token });
  const onlyAlarms = (evKind.json?.events ?? []).every((e) => e.kind === 'alarm');
  check('filtro kind=alarm', evKind.status === 200 && (evKind.json?.events?.length ?? 0) >= 1 && onlyAlarms, JSON.stringify(evKind.json));
  const evLimit = await api('GET', `/plugins/sema/devices/${deviceId}/events?limit=1`, { token });
  check('filtro limit=1', evLimit.status === 200 && (evLimit.json?.events?.length ?? 0) === 1, JSON.stringify(evLimit.json));

  console.log(`\n${failures === 0 ? 'RESULTADO: VERDE' : `RESULTADO: ROJO (${failures} fallas)`} | métricas=${metricCount} filas_events_1er=${countAfterFirst} filas_events_2do=${countAfterSecond}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
