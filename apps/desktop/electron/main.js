// electron/main.js — Shell Electron de escritorio (ESM).
//
// Envuelve apps/web (build de producción) o el dev server de Vite, y arranca el
// puente de lectores (WS 4599 + serial) reutilizando `src/bridge.js`.
//
// Variables de entorno:
//   ELECTRON_DEV=1  carga http://localhost:5173 (dev server de Vite).
//   WEB_URL=...     carga una URL remota (p. ej. el sitio desplegado).
//   KIOSK=1         abre en modo kiosco (sin salir del panel).
//   PORT_NAME       puerto serial del lector (opcional).

import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBridge } from '../src/bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `--dev` (CLI) o `ELECTRON_DEV=1` activan el dev server de Vite.
const DEV = process.argv.includes('--dev') || process.env.ELECTRON_DEV === '1';
const KIOSK = process.env.KIOSK === '1';
const WEB_URL = process.env.WEB_URL || '';

let mainWindow = null;
let bridge = null;

/** Ruta al index.html de apps/web en producción (sin empaquetar). */
function resolveProdIndex() {
  // Sin empaquetar: apps/desktop/electron/ -> ../../web/dist/index.html.
  if (!app.isPackaged) return path.resolve(__dirname, '../../web/dist/index.html');
  // Empaquetado: extraResources copia apps/web/dist a resources/web-dist.
  return path.join(process.resourcesPath, 'web-dist', 'index.html');
}

/** Qué carga la ventana según el entorno. */
function resolveTarget() {
  if (WEB_URL) return WEB_URL;
  if (DEV) return 'http://localhost:5173';
  return resolveProdIndex(); // file:// en producción
}

/** Solo http/https salen al navegador del sistema (nada de file:, smb:, etc.). */
function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
  } catch {
    // URL inválida: se ignora.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: KIOSK,
    autoHideMenuBar: true,
    webPreferences: {
      // preload.cjs es CommonJS a propósito: un preload con sandbox:true
      // no puede ser ESM (limitación de Electron).
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const target = resolveTarget();
  if (target.startsWith('http')) {
    mainWindow.loadURL(target);
  } else {
    mainWindow.loadFile(target);
  }

  // Enlaces externos al navegador del sistema, nunca a otra ventana Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  // Navegación fuera de la app: se abre en el navegador, no dentro de Electron.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/** Menú mínimo: recargar, zoom, pantalla completa, salir. */
function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Recargar sin caché' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { role: 'resetZoom', label: 'Restablecer zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        { role: 'toggleDevTools', label: 'DevTools' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Una sola instancia de la app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // La app empaquetada es un cliente del servidor Webs: sin WEB_URL cargaría
    // `file://` y todas las llamadas a /api fallarían por CORS/origen.
    if (app.isPackaged && !WEB_URL && !DEV) {
      dialog.showErrorBox(
        'Falta la dirección del servidor',
        'Abrí Webs indicando la URL de tu instancia, por ejemplo:\n\nWEB_URL=https://mi-dominio.com webs\n\n(En Windows, desde una consola o acceso directo con esa variable de entorno.)',
      );
      app.quit();
      return;
    }

    // Puente de lectores (WS 4599 + serial). Sin stdin: en Electron el
    // keyboard-wedge lo captura el renderer (la ventana con foco), no stdin.
    bridge = await createBridge({
      useStdin: false,
      version: app.getVersion(),
      onScan: (code, source, data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('webs:scan', { code, source, at: data.at });
        }
      },
    });
    bridge.start();

    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // IPC: el renderer pide la versión del puente.
  ipcMain.handle('webs:version', () => bridge?.version ?? app.getVersion());

  app.on('will-quit', () => { bridge?.close(); });
}
