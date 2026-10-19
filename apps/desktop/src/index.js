#!/usr/bin/env node
// @webs/desktop — Companion de escritorio para lectura de QR/barras.
//
// Escucha lecturas de un lector de código de barras/QR conectado por:
//   1) Puerto serial (USB/serie)  -> usa `serialport` si está instalada y
//                                    PORT_NAME está definido.
//   2) "Keyboard wedge"           -> el lector se comporta como teclado y tipea
//                                    el código; acá se lee de stdin.
//
// Cada lectura se emite como evento `scan` a todos los clientes WebSocket
// conectados en ws://localhost:4599.
//
// Variables de entorno:
//   PORT_NAME  Nombre del puerto serial (COM3, /dev/ttyUSB0, ...). Si se omite,
//              se usa stdin (keyboard wedge).
//   BAUD_RATE  Baudios del puerto (por defecto 9600).
//   WS_PORT    Puerto del servidor WebSocket (por defecto 4599).

import readline from 'node:readline';

const WS_PORT = Number(process.env.WS_PORT ?? 4599);
const PORT_NAME = process.env.PORT_NAME ?? '';
const BAUD_RATE = Number(process.env.BAUD_RATE ?? 9600);

// ---------------------------------------------------------------------------
// 1) Dependencias opcionales (carga dinámica para degradar con mensaje claro).
// ---------------------------------------------------------------------------
let WebSocketServer = null;
let serialport = null;

try {
  const wsPkg = await import('ws');
  WebSocketServer = wsPkg.WebSocketServer ?? wsPkg.default?.WebSocketServer ?? wsPkg.default;
  console.log('[ws] dependencia "ws" cargada correctamente.');
} catch {
  console.warn('[ws] "ws" no está instalada. Instalala con: pnpm --filter @webs/desktop add ws');
  console.warn('[ws] Sin "ws" no se puede abrir el servidor WebSocket.');
}

try {
  const sp = await import('serialport');
  serialport = sp.SerialPort ?? sp.default?.SerialPort ?? sp.default;
  console.log('[serial] dependencia "serialport" cargada correctamente.');
} catch {
  console.warn('[serial] "serialport" no está instalada (opcional). Se usará el modo keyboard-wedge (stdin).');
}

// ---------------------------------------------------------------------------
// 2) Servidor WebSocket
// ---------------------------------------------------------------------------
/** @type {Set<import('ws').WebSocket>} Clientes conectados. */
const clients = new Set();

/** Emite un mensaje JSON a todos los clientes conectados. */
function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      try { client.send(data); } catch { /* cliente caído */ }
    }
  }
}

/** Emite un evento de lectura de código. */
function emitScan(code, source, extra = {}) {
  const event = {
    type: 'scan',
    data: { code, source, at: new Date().toISOString(), ...extra },
  };
  broadcast(event);
  console.log(`[scan] (${source}) ${code}`);
}

/** Devuelve la fuente de lectura activa (serial o stdin). */
function activeSource() {
  return serialport && PORT_NAME ? 'serial' : 'stdin';
}

/** Abre el servidor WebSocket en WS_PORT. */
function startWebSocketServer() {
  if (!WebSocketServer) return;

  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on('connection', (socket) => {
    clients.add(socket);
    console.log(`[ws] cliente conectado (${clients.size} en total).`);

    // Informa al cliente qué fuente está activa y qué puerto serial hay.
    socket.send(JSON.stringify({
      type: 'ready',
      data: {
        source: activeSource(),
        port: PORT_NAME || null,
        server: `ws://localhost:${WS_PORT}`,
      },
    }));

    socket.on('message', (msg) => {
      // Protocolo mínimo: "ping" -> "pong" (keepalive).
      if (String(msg) === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      console.log(`[ws] cliente desconectado (${clients.size} en total).`);
    });

    socket.on('error', (err) => console.warn('[ws] error en cliente:', err.message));
  });

  wss.on('listening', () => console.log(`[ws] servidor escuchando en ws://localhost:${WS_PORT}`));
  wss.on('error', (err) => console.error('[ws] error del servidor:', err.message));
}

// ---------------------------------------------------------------------------
// 3) Fuente de lectura: puerto serial
// ---------------------------------------------------------------------------
function listSerialPorts() {
  if (!serialport) return;
  if (typeof serialport.list !== 'function') return;
  serialport.list()
    .then((ports) => {
      const names = ports.map((p) => `${p.path} (${p.manufacturer ?? 'desconocido'})`).join(', ');
      console.log(`[serial] puertos disponibles: ${names || 'ninguno'}`);
    })
    .catch(() => { /* la lista es informativa; ignoramos el error */ });
}

function startSerial() {
  if (!serialport) return false;
  listSerialPorts();

  if (!PORT_NAME) return false;

  try {
    // Crear sin abrir para poder capturar el error de apertura con claridad.
    const port = new serialport({ path: PORT_NAME, baudRate: BAUD_RATE, autoOpen: false });
    let buffer = '';

    port.open((err) => {
      if (err) {
        console.error(`[serial] no se pudo abrir ${PORT_NAME}: ${err.message}`);
        console.warn('[serial] degradando a modo keyboard-wedge (stdin).');
        startStdin();
        return;
      }
      console.log(`[serial] puerto ${PORT_NAME} abierto a ${BAUD_RATE} baudios.`);

      // Acumula datos y emite una lectura por línea terminada en '\n'.
      port.on('data', (chunk) => {
        buffer += chunk.toString();
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) emitScan(line, 'serial', { port: PORT_NAME });
        }
      });

      port.on('error', (err) => console.error('[serial] error:', err.message));
    });

    return true;
  } catch (err) {
    console.error(`[serial] error al crear el puerto ${PORT_NAME}: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 4) Fuente de lectura: keyboard-wedge (stdin)
// ---------------------------------------------------------------------------
function startStdin() {
  if (process.stdin.isTTY) {
    console.log('[stdin] escribí códigos y presioná Enter (modo keyboard-wedge).');
  } else {
    console.log('[stdin] leyendo líneas desde stdin (ej: echo CODIGO | npm start).');
  }

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const code = line.trim();
    if (code) emitScan(code, 'stdin');
  });
}

// ---------------------------------------------------------------------------
// 5) Arranque
// ---------------------------------------------------------------------------
console.log('Webs Desktop Companion');
console.log('======================');

startWebSocketServer();

if (serialport && PORT_NAME) {
  const ok = startSerial();
  if (!ok) startStdin(); // Si el serial no pudo iniciarse, degrada a stdin.
} else {
  startStdin();
}

// Mantiene el proceso vivo aunque no haya entrada por stdin (p. ej. solo WS + serial).
process.stdin.resume();
