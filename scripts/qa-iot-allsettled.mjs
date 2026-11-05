import { execSync } from 'node:child_process';

const API = 'http://localhost:4000/api/v1';
const CTRL = 'http://localhost:9001/_control';
const DEV = 'c04d93f9-ba62-4bd4-8a0e-72987f77adcd';
const DB = 'webs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setCtrl(state) {
  return fetch(CTRL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
}

function dbCount(tsRaw) {
  const sql = `SELECT count(*) FROM iot_device_events WHERE "deviceId"='${DEV}' AND "tsRaw"=${tsRaw};`;
  const out = execSync(
    `docker compose exec -T postgres psql -U webs -d ${DB} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', cwd: 'D:/Users/alekl/Documents/GitHub/Webs' },
  );
  return parseInt(out.trim(), 10) || 0;
}

function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) process.exitCode = 1;
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identifier: 'admin@webs.test', password: 'Admin12345!' }),
});
const tok = (await login.json()).accessToken;
if (!tok) { console.error('login failed'); process.exit(1); }
console.log('login OK');

// --- 3a: /alarms 404 must NOT block /events (change tsSensor on surviving /events) ---
await setCtrl({ disableAlarms: true, tsSensor: 600000001 });
console.log('control: disableAlarms=true, tsSensor=600000001; waiting 70s for poll...');
await sleep(70000);
const a = dbCount(600000001);
check('3a: /alarms 404 no bloquea /events (nueva fila tsSensor=600000001)', a >= 1);

// --- 3b: /events 404 must NOT block /alarms (change tsAlarm on surviving /alarms) ---
await setCtrl({ disableAlarms: false, disableEvents: true, tsSensor: 123456790, tsAlarm: 700000001 });
console.log('control: disableEvents=true, tsAlarm=700000001; waiting 70s for poll...');
await sleep(70000);
const b = dbCount(700000001);
check('3b: /events 404 no bloquea /alarms (nueva fila tsAlarm=700000001)', b >= 1);

// reset fake device to defaults
await setCtrl({ disableEvents: false, tsAlarm: 123456789, tsSensor: 123456790, highTs: null, disableAlarms: false });
console.log('control reset to defaults');

console.log(process.exitCode ? 'ALLSETTLED: ROJO' : 'ALLSETTLED: VERDE');
