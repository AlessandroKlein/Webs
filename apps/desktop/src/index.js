#!/usr/bin/env node
// @webs/desktop — Companion de escritorio para lectura de QR/barras (standalone).
//
// Entrada de consola: arranca el puente de lectores reutilizando
// `src/bridge.js` (misma lógica que usa la app Electron, sin duplicar).
//
// Escucha lecturas de un lector de código de barras/QR conectado por:
//   1) Puerto serial (USB/serie)  -> usa `serialport` si está instalada y
//                                    PORT_NAME está definido.
//   2) "Keyboard wedge"           -> el lector se comporta como teclado y tipea
//                                    el código; acá se lee de stdin.
//
// Variables de entorno:
//   PORT_NAME  Nombre del puerto serial (COM3, /dev/ttyUSB0, ...). Si se omite,
//              se usa stdin (keyboard wedge).
//   BAUD_RATE  Baudios del puerto (por defecto 9600).
//   WS_PORT    Puerto del servidor WebSocket (por defecto 4599).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createBridge } from './bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Versión del companion. Sigue la versión canónica de la plataforma
 * (`SYSTEM_VERSION` en apps/api/src/modules/system.ts) sin duplicar el literal.
 * Si el archivo no está disponible (despliegue standalone), usa la versión del
 * propio paquete (@webs/desktop) leída en runtime.
 */
function readVersion() {
  const systemTs = path.resolve(__dirname, '../../api/src/modules/system.ts');
  try {
    if (existsSync(systemTs)) {
      const src = readFileSync(systemTs, 'utf8');
      const match = src.match(/SYSTEM_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if (match) return match[1];
    }
  } catch { /* sigue con el fallback */ }

  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    if (pkg.version) return pkg.version;
  } catch { /* último recurso */ }

  return '0.0.0';
}

console.log('Webs Desktop Companion');
console.log('======================');

const bridge = await createBridge({ version: readVersion() });
bridge.start();

// Mantiene el proceso vivo aunque no haya entrada por stdin (p. ej. solo WS + serial).
process.stdin.resume();
