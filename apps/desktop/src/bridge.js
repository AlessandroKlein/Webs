// @webs/desktop — Núcleo reutilizable del puente de lectores.
//
// Concentra TODA la lógica del companion (servidor WebSocket + lectura serial o
// stdin) para que la usen dos entradas sin duplicarla:
//   1. `src/index.js`       -> companion standalone de consola.
//   2. `electron/main.js`   -> arranca el WS 4599 dentro de la app Electron.
//
// Cada lectura se emite como evento `scan` a los clientes WebSocket y, si se
// pasó `onScan`, también se entrega por ese callback (IPC en Electron).

import readline from 'node:readline';

export const BRIDGE_PROTOCOL = 'webs-desktop-bridge/1.0';

/**
 * Normaliza códigos de lectores externos (AIM/GS1): quita saltos de línea y
 * prefijos `]C0`/`]E0`. Idéntico a `normalizeBarcode` de la PWA
 * (apps/mobile/src/barcode.js) y de apps/web/src/components/ui/BarcodeScanner.tsx.
 */
export function normalizeBarcode(raw) {
  return String(raw ?? '')
    .replace(/[\r\n\t]/g, '')
    .replace(/^\]\w\d/, '')
    .trim();
}

/**
 * Crea el puente de lectores (sin arrancarlo; llamá a `start()`).
 *
 * @param {object} [opts]
 * @param {number} [opts.wsPort]    Puerto WS (default env WS_PORT o 4599).
 * @param {string} [opts.portName]  Puerto serial (default env PORT_NAME).
 * @param {number} [opts.baudRate]  Baudios (default env BAUD_RATE o 9600).
 * @param {string} [opts.version]   Versión reportada en el evento `ready`.
 * @param {boolean} [opts.useStdin] Habilitar keyboard-wedge por stdin (default true).
 * @param {(code:string, source:string, data:object)=>void} [opts.onScan] Callback extra por lectura (IPC en Electron).
 * @param {Console} [opts.log]      Logger (default console).
 * @returns {Promise<{ start:()=>void, broadcast:(p:object)=>void, emitScan:(raw:string,source:string,extra?:object)=>void, close:()=>void, version:string }>}
 */
export async function createBridge(opts = {}) {
  const wsPort = opts.wsPort ?? Number(process.env.WS_PORT ?? 4599);
  const portName = opts.portName ?? process.env.PORT_NAME ?? '';
  const baudRate = opts.baudRate ?? Number(process.env.BAUD_RATE ?? 9600);
  const version = opts.version ?? '0.0.0';
  const useStdin = opts.useStdin ?? true;
  const onScan = opts.onScan ?? null;
  const log = opts.log ?? console;

  // 1) Dependencias opcionales (carga dinámica para degradar con mensaje claro).
  let WebSocketServer = null;
  let serialport = null;

  try {
    const wsPkg = await import('ws');
    WebSocketServer = wsPkg.WebSocketServer ?? wsPkg.default?.WebSocketServer ?? wsPkg.default;
    log.log('[ws] dependencia "ws" cargada correctamente.');
  } catch {
    log.warn('[ws] "ws" no está instalada. Instalala con: pnpm --filter @webs/desktop add ws');
    log.warn('[ws] Sin "ws" no se puede abrir el servidor WebSocket.');
  }

  try {
    const sp = await import('serialport');
    serialport = sp.SerialPort ?? sp.default?.SerialPort ?? sp.default;
    log.log('[serial] dependencia "serialport" cargada correctamente.');
  } catch {
    log.warn('[serial] "serialport" no está instalada (opcional). Se usará el modo keyboard-wedge (stdin).');
  }

  // 2) Servidor WebSocket.
  const clients = new Set();
  let wss = null;

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === 1 /* OPEN */) {
        try { client.send(data); } catch { /* cliente caído */ }
      }
    }
  }

  function emitScan(rawCode, source, extra = {}) {
    const code = normalizeBarcode(rawCode);
    if (!code) return; // ignorá lecturas vacías tras normalizar
    const event = {
      type: 'scan',
      data: { code, source, at: new Date().toISOString(), ...extra },
    };
    broadcast(event);
    onScan?.(code, source, event.data);
    log.log(`[scan] (${source}) ${code}`);
  }

  function activeSource() {
    return serialport && portName ? 'serial' : 'stdin';
  }

  function startWebSocketServer() {
    if (!WebSocketServer) return null;

    wss = new WebSocketServer({ port: wsPort });

    wss.on('connection', (socket) => {
      clients.add(socket);
      log.log(`[ws] cliente conectado (${clients.size} en total).`);

      socket.send(JSON.stringify({
        type: 'ready',
        data: {
          protocol: BRIDGE_PROTOCOL,
          version,
          source: activeSource(),
          port: portName || null,
          server: `ws://localhost:${wsPort}`,
        },
      }));

      socket.on('message', (msg) => {
        if (String(msg) === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      });

      socket.on('close', () => {
        clients.delete(socket);
        log.log(`[ws] cliente desconectado (${clients.size} en total).`);
      });

      socket.on('error', (err) => log.warn('[ws] error en cliente:', err.message));
    });

    wss.on('listening', () => log.log(`[ws] servidor escuchando en ws://localhost:${wsPort}`));
    wss.on('error', (err) => log.error('[ws] error del servidor:', err.message));
    return wss;
  }

  // 3) Fuente de lectura: puerto serial.
  function listSerialPorts() {
    if (!serialport || typeof serialport.list !== 'function') return;
    serialport.list()
      .then((ports) => {
        const names = ports.map((p) => `${p.path} (${p.manufacturer ?? 'desconocido'})`).join(', ');
        log.log(`[serial] puertos disponibles: ${names || 'ninguno'}`);
      })
      .catch(() => { /* la lista es informativa; ignoramos el error */ });
  }

  function startSerial() {
    if (!serialport) return false;
    listSerialPorts();

    if (!portName) return false;

    try {
      const port = new serialport({ path: portName, baudRate, autoOpen: false });
      let buffer = '';

      port.open((err) => {
        if (err) {
          log.error(`[serial] no se pudo abrir ${portName}: ${err.message}`);
          log.warn('[serial] degradando a modo keyboard-wedge (stdin).');
          startStdin();
          return;
        }
        log.log(`[serial] puerto ${portName} abierto a ${baudRate} baudios.`);

        port.on('data', (chunk) => {
          buffer += chunk.toString();
          let nl;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) emitScan(line, 'serial', { port: portName });
          }
        });

        port.on('error', (err) => log.error('[serial] error:', err.message));
      });

      return true;
    } catch (err) {
      log.error(`[serial] error al crear el puerto ${portName}: ${err.message}`);
      return false;
    }
  }

  // 4) Fuente de lectura: keyboard-wedge (stdin).
  function startStdin() {
    if (!useStdin) return;
    if (process.stdin.isTTY) {
      log.log('[stdin] escribí códigos y presioná Enter (modo keyboard-wedge).');
    } else {
      log.log('[stdin] leyendo líneas desde stdin (ej: echo CODIGO | npm start).');
    }

    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (line) => {
      const code = line.trim();
      if (code) emitScan(code, 'stdin');
    });
  }

  // 5) Arranque.
  function start() {
    startWebSocketServer();
    if (serialport && portName) {
      if (!startSerial()) startStdin();
    } else {
      startStdin();
    }
  }

  function close() {
    for (const client of clients) {
      try { client.close(); } catch { /* ya cerrado */ }
    }
    clients.clear();
    try { wss?.close(); } catch { /* ya cerrado */ }
    wss = null;
  }

  return { start, broadcast, emitScan, close, version };
}
