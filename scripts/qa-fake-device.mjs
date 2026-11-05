// Fake SEMA device server para QA E2E (task-25 / task-29).
// Sirve los endpoints que el collector SEMA espera, con JSON determinista.
// La misma alarma aparece en /events (type:'alarm') y /alarms (sin type) para
// verificar que el dedupe por fingerprint colapsa ambas a UNA fila.
//
// Control en caliente (POST /_control con JSON) para simular escenarios:
//   { tsAlarm?, tsSensor?, highTs?, disableEvents?, disableAlarms? }
//   - tsAlarm/tsSensor: cambia el uptime (simula reinicio → ts vuelve a 0/otro valor).
//   - highTs: añade un evento con ese ts a /events (tsRaw > 2^31 → BigInt).
//   - disableEvents/disableAlarms: devuelve 404 en esa ruta (test Promise.allSettled).
//
// Uso: node scripts/qa-fake-device.mjs [port]
import http from 'node:http';

const port = Number(process.argv[2] ?? 9001);

const state = {
  tsAlarm: 123456789,
  tsSensor: 123456790,
  highTs: null,
  disableEvents: false,
  disableAlarms: false,
};

const counts = {};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  res.setHeader('Content-Type', 'application/json');

  if (path.startsWith('/api/v1/')) counts[path] = (counts[path] ?? 0) + 1;

  if (req.method === 'GET' && path === '/_stats') {
    res.statusCode = 200;
    res.end(JSON.stringify({ counts, state }));
    return;
  }

  if (req.method === 'POST' && path === '/_control') {
    const body = await readBody(req);
    if (typeof body.tsAlarm === 'number') state.tsAlarm = body.tsAlarm;
    if (typeof body.tsSensor === 'number') state.tsSensor = body.tsSensor;
    if (body.highTs === null || typeof body.highTs === 'number') state.highTs = body.highTs;
    if (typeof body.disableEvents === 'boolean') state.disableEvents = body.disableEvents;
    if (typeof body.disableAlarms === 'boolean') state.disableAlarms = body.disableAlarms;
    if (body.resetCounts === true) { for (const k of Object.keys(counts)) delete counts[k]; }
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, state, counts }));
    return;
  }

  if (path === '/api/v1/sensors') {
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        measurements: [
          { sensor_id: 'EXT', channel_id: 'temperature', value: 22.5, unit: 'C' },
          { sensor_id: 'EXT', channel_id: 'humidity', value: 60, unit: '%' },
          { sensor_id: 'EXT', channel_id: 'dew_point', value: 12.1, unit: 'C' },
        ],
      }),
    );
    return;
  }

  if (path === '/api/v1/events') {
    if (state.disableEvents) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found', path }));
      return;
    }
    const events = [];
    if (state.highTs !== null) {
      events.push({ ts: state.highTs, type: 'event', source: 'EXT', rule: 'uptime_overflow', severity: 'INFO', value: 1 });
    }
    events.push({ ts: state.tsAlarm, type: 'alarm', source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 });
    events.push({ ts: state.tsSensor, type: 'sensor', source: 'clock', rule: 'heartbeat', severity: 'INFO', value: 1 });
    res.statusCode = 200;
    res.end(JSON.stringify({ events }));
    return;
  }

  if (path === '/api/v1/alarms') {
    if (state.disableAlarms) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found', path }));
      return;
    }
    res.statusCode = 200;
    res.end(
      JSON.stringify({ alarms: [{ ts: state.tsAlarm, source: 'EXT', rule: 'high_temp', severity: 'WARNING', value: 4150 }] }),
    );
    return;
  }

  if (path === '/api/v1/status') {
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', firmware: 'qa-fake-v1' }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not_found', path }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[qa-fake-device] escuchando en 0.0.0.0:${port}`);
});
